package id.ac.telkomuniversity.its;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.KeyguardManager;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.hardware.biometrics.BiometricPrompt;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaRouter;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.window.OnBackInvokedDispatcher;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Locale;
import java.text.SimpleDateFormat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LockScreenDashboardActivity extends Activity {
    private static final String TAG = "ITS-LockScreen";
    private static final String DETECTOR_URL = "file:///android_asset/public/lockscreen-detector.html?native=1";
    private static final String WIDGET_PREFS = "its_widget_prefs";
    private static final String LOCAL_AI_SLOT_PREFIX = "local_ai_slot_";
    private static final String ACTION_DIAL_EMERGENCY = "android.intent.action.DIAL_EMERGENCY";
    private static final String PREF_HOSTED_WIDGET_IDS = "lock_hosted_widget_ids_v1";
    private static final int APP_WIDGET_HOST_ID = 7203;
    private static final int REQUEST_BIND_APP_WIDGET = 7204;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private DashboardView dashboardView;
    private FrameLayout rootLayout;
    private WebView detectorWebView;
    private AppWidgetHost appWidgetHost;
    private AppWidgetManager appWidgetManager;
    private final Map<String, HostedWidget> hostedWidgets = new HashMap<>();
    private volatile boolean destroyed;
    private CancellationSignal biometricCancellation;

    private final Runnable refreshRunnable = new Runnable() {
        @Override
        public void run() {
            if (destroyed) return;
            loadSnapshotAsync();
            if (dashboardView != null) {
                dashboardView.postDelayed(this, LockScreenRenderer.LIVE_REFRESH_MS);
            }
        }
    };

    private final Runnable mediaTickRunnable = new Runnable() {
        @Override
        public void run() {
            if (destroyed) return;
            if (dashboardView != null) {
                dashboardView.invalidate(); // cuma redraw, TIDAK fetch ulang data Firebase
                dashboardView.postDelayed(this, 250L);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreenWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBack
            );
        }
        WidgetRealtimeService.startFromLockScreen(this);
        appWidgetManager = AppWidgetManager.getInstance(this);
        appWidgetHost = new AppWidgetHost(this, APP_WIDGET_HOST_ID);
        dashboardView = new DashboardView(this);
        rootLayout = new FrameLayout(this);
        rootLayout.addView(dashboardView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        detectorWebView = createDetectorWebView();
        FrameLayout.LayoutParams detectorLayout = new FrameLayout.LayoutParams(2, 2);
        detectorLayout.leftMargin = 1;
        detectorLayout.topMargin = 1;
        rootLayout.addView(detectorWebView, detectorLayout);
        setContentView(rootLayout);
        loadSnapshotAsync();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (appWidgetHost != null) {
            try {
                appWidgetHost.startListening();
            } catch (RuntimeException err) {
                Log.w(TAG, "Host widget belum dapat mendengarkan", err);
            }
        }
        syncHostedWidgets(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        destroyed = false;
        hideSystemBars();
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
            dashboardView.postDelayed(refreshRunnable, 1_000L);
            dashboardView.removeCallbacks(mediaTickRunnable);
            dashboardView.postDelayed(mediaTickRunnable, 1_000L);
        }
    }

    @Override
    protected void onPause() {
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
            dashboardView.removeCallbacks(mediaTickRunnable);
        }
        super.onPause();
    }

    @Override
    protected void onStop() {
        if (appWidgetHost != null) {
            try {
                appWidgetHost.stopListening();
            } catch (RuntimeException err) {
                Log.w(TAG, "Host widget berhenti dengan peringatan", err);
            }
        }
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
        }
        cancelBiometricPrompt();
        clearHostedViews(false);
        executor.shutdownNow();
        if (detectorWebView != null) {
            detectorWebView.removeJavascriptInterface("LockScreenBridge");
            detectorWebView.stopLoading();
            detectorWebView.destroy();
            detectorWebView = null;
        }
        super.onDestroy();
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_BIND_APP_WIDGET) {
            syncHostedWidgets(false);
            if (dashboardView != null) dashboardView.invalidate();
        }
    }

    private void handleBack() {
        if (dashboardView != null && dashboardView.hideDetails()) return;
        finish();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createDetectorWebView() {
        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        webView.setAlpha(0.01f);
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        webView.addJavascriptInterface(new LockScreenDetectionBridge(), "LockScreenBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Detector siap: " + url);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, "Detector: " + message.message());
                return true;
            }
        });
        webView.loadUrl(DETECTOR_URL);
        return webView;
    }

    private final class LockScreenDetectionBridge {
        @JavascriptInterface
        public void onStatus(String raw) {
            try {
                JSONObject payload = new JSONObject(raw);
                SlotAnalysisResult result = SlotAnalysisResult.from(payload, new ArrayList<>());
                Log.i(TAG, "AI slot " + result.slot + " " + result.state + ": " + result.note);
                runOnUiThread(() -> {
                    if (dashboardView != null) dashboardView.updateAnalysis(result);
                });
            } catch (Exception error) {
                Log.w(TAG, "Status AI tidak dapat dibaca", error);
            }
        }

        @JavascriptInterface
        public void onDetection(String raw) {
            try {
                JSONObject payload = new JSONObject(raw);
                int slot = payload.optInt("slot", 1) == 2 ? 2 : 1;
                int frameWidth = payload.optInt("frameWidth", 0);
                int frameHeight = payload.optInt("frameHeight", 0);
                JSONArray array = payload.optJSONArray("detections");
                List<LockScreenRenderer.Detection> detections = new ArrayList<>();
                if (array != null) {
                    for (int i = 0; i < array.length() && detections.size() < 24; i++) {
                        JSONObject item = array.optJSONObject(i);
                        if (item == null) continue;
                        detections.add(new LockScreenRenderer.Detection(
                            item.optString("label", "Objek"),
                            item.optDouble("confidence", 0d),
                            item.optDouble("x", 0d),
                            item.optDouble("y", 0d),
                            item.optDouble("width", 0d),
                            item.optDouble("height", 0d)
                        ));
                    }
                }
                SlotAnalysisResult result = SlotAnalysisResult.from(payload, detections);
                Log.i(TAG, "AI slot " + slot + " selesai: " + detections.size() + " objek");
                getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(LOCAL_AI_SLOT_PREFIX + slot, raw)
                    .apply();
                Intent widgetUpdate = new Intent(LockScreenDashboardActivity.this, TrafficDetectionWidgetProvider.class);
                widgetUpdate.setAction("id.ac.telkomuniversity.its.action.TRAFFIC_DETECTION_REFRESH");
                sendBroadcast(widgetUpdate);
                runOnUiThread(() -> {
                    if (dashboardView != null) dashboardView.updateAnalysis(result);
                });
            } catch (Exception error) {
                Log.w(TAG, "Hasil AI tidak dapat dibaca", error);
            }
        }
    }

    private static final class SlotAnalysisResult {
        final int slot;
        final int imageLength;
        final String imageTail;
        final String state;
        final String note;
        final int frameWidth;
        final int frameHeight;
        final List<LockScreenRenderer.Detection> detections;

        SlotAnalysisResult(
            int slot,
            int imageLength,
            String imageTail,
            String state,
            String note,
            int frameWidth,
            int frameHeight,
            List<LockScreenRenderer.Detection> detections
        ) {
            this.slot = slot == 2 ? 2 : 1;
            this.imageLength = Math.max(0, imageLength);
            this.imageTail = imageTail == null ? "" : imageTail;
            this.state = state == null ? "pending" : state;
            this.note = note == null ? "" : note;
            this.frameWidth = Math.max(0, frameWidth);
            this.frameHeight = Math.max(0, frameHeight);
            this.detections = detections == null ? new ArrayList<>() : detections;
        }

        static SlotAnalysisResult from(JSONObject payload, List<LockScreenRenderer.Detection> detections) {
            return new SlotAnalysisResult(
                payload.optInt("slot", 1),
                payload.optInt("imageLength", 0),
                payload.optString("imageTail", ""),
                payload.optString("state", "pending"),
                payload.optString("note", ""),
                payload.optInt("frameWidth", 0),
                payload.optInt("frameHeight", 0),
                detections
            );
        }
    }

    private void configureLockScreenWindow() {
        Window window = getWindow();
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private void loadSnapshotAsync() {
        executor.execute(() -> {
            LockScreenRenderer.Snapshot next = LockScreenRenderer.load(this);
            long now = System.currentTimeMillis();
            Log.i(TAG, "Snapshot status=" + next.status
                + " telemetryAt=" + next.deviceLastSeen
                + " ageMs=" + (next.deviceLastSeen > 0L ? now - next.deviceLastSeen : -1L)
                + " online=" + next.online(now));
            next.warmImages(this);
            if (destroyed) return;
            runOnUiThread(() -> {
                if (dashboardView != null) {
                    dashboardView.setSnapshot(next);
                }
            });
        });
    }

    private void requestSystemUnlock() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null && keyguardManager.isKeyguardLocked()) {
                keyguardManager.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                    @Override
                    public void onDismissSucceeded() {
                        finishLockOverlay();
                    }

                    @Override
                    public void onDismissCancelled() {
                        if (dashboardView != null) dashboardView.stopFingerprintUnlockAnimation();
                    }

                    @Override
                    public void onDismissError() {
                        if (dashboardView != null) dashboardView.stopFingerprintUnlockAnimation();
                    }
                });
                return;
            }
        }
        finishLockOverlay();
    }

    private void requestFingerprintUnlock() {
        if (dashboardView != null) dashboardView.startFingerprintUnlockAnimation();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                showBiometricUnlockPrompt();
                return;
            } catch (RuntimeException err) {
                Log.w(TAG, "Prompt sidik jari tidak tersedia, memakai dismiss keyguard", err);
            }
        }
        requestSystemUnlock();
    }

    private Executor mainThreadExecutor() {
        return command -> runOnUiThread(command);
    }

    private void showBiometricUnlockPrompt() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            requestSystemUnlock();
            return;
        }
        cancelBiometricPrompt();
        biometricCancellation = new CancellationSignal();
        Executor executor = mainThreadExecutor();
        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
            .setTitle("Buka lock screen")
            .setSubtitle("Sentuh sensor sidik jari")
            .setNegativeButton("Batal", executor, (dialog, which) -> {
                cancelBiometricPrompt();
                if (dashboardView != null) dashboardView.stopFingerprintUnlockAnimation();
            })
            .build();
        prompt.authenticate(biometricCancellation, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                biometricCancellation = null;
                requestSystemUnlock();
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                biometricCancellation = null;
                if (dashboardView != null) dashboardView.stopFingerprintUnlockAnimation();
                if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                    || errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                    || errorCode == 13) {
                    return;
                }
                Log.w(TAG, "Autentikasi sidik jari gagal: " + errString);
                requestSystemUnlock();
            }

            @Override
            public void onAuthenticationFailed() {
                if (dashboardView != null) dashboardView.startFingerprintUnlockAnimation();
            }
        });
    }

    private void cancelBiometricPrompt() {
        CancellationSignal signal = biometricCancellation;
        biometricCancellation = null;
        if (signal != null && !signal.isCanceled()) {
            signal.cancel();
        }
    }

    private void finishLockOverlay() {
        if (dashboardView != null) dashboardView.stopFingerprintUnlockAnimation();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                finishAndRemoveTask();
            } else {
                moveTaskToBack(true);
                finish();
            }
        } catch (RuntimeException err) {
            Log.w(TAG, "Panel lock screen gagal ditutup bersih", err);
            finish();
        }
    }

    private void launchDialerShortcut() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (keyguardManager != null && keyguardManager.isKeyguardLocked()) {
                    Intent emergencyDialer = new Intent(ACTION_DIAL_EMERGENCY);
                    emergencyDialer.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
                    startActivity(emergencyDialer);
                    return;
                }
            }
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:"));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
            startActivity(intent);
        } catch (RuntimeException err) {
            Log.w(TAG, "Shortcut telepon tidak dapat dibuka", err);
            requestSystemUnlock();
        }
    }

    private void launchCameraShortcut() {
        try {
            Intent intent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA_SECURE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
            startActivity(intent);
        } catch (RuntimeException err) {
            try {
                Intent fallback = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
                startActivity(fallback);
            } catch (RuntimeException second) {
                Log.w(TAG, "Shortcut kamera tidak dapat dibuka", second);
                requestSystemUnlock();
            }
        }
    }

    private void dispatchMediaControl(String packageName, String action) {
        try {
            MediaSessionManager manager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager != null) {
                ComponentName listener = new ComponentName(this, ItsNotificationListenerService.class);
                List<MediaController> controllers = manager.getActiveSessions(listener);
                if (controllers != null) {
                    for (MediaController controller : controllers) {
                        if (controller == null) continue;
                        if (packageName != null && !packageName.isEmpty() && !packageName.equals(controller.getPackageName())) continue;
                        MediaController.TransportControls controls = controller.getTransportControls();
                        if (controls == null) continue;
                        if (LockScreenRenderer.SHEET_ACTION_MEDIA_PREVIOUS.equals(action)) {
                            controls.skipToPrevious();
                        } else if (LockScreenRenderer.SHEET_ACTION_MEDIA_NEXT.equals(action)) {
                            controls.skipToNext();
                        } else {
                            PlaybackState state = controller.getPlaybackState();
                            if (state != null && state.getState() == PlaybackState.STATE_PLAYING) controls.pause();
                            else controls.play();
                        }
                        return;
                    }
                }
            }
            if (dispatchFallbackMediaKey(action)) return;
            Toast.makeText(this, "Media session belum aktif", Toast.LENGTH_SHORT).show();
        } catch (SecurityException err) {
            Toast.makeText(this, "Izin notifikasi/media diperlukan", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "Kontrol media membutuhkan izin", err);
        } catch (RuntimeException err) {
            Log.w(TAG, "Kontrol media gagal", err);
        }
    }

    private void dispatchMediaFavoriteReal(String favoriteKey) {
        if (favoriteKey == null || favoriteKey.isEmpty()) return;
        String packageName = favoriteKey.contains("|")
            ? favoriteKey.substring(0, favoriteKey.indexOf('|'))
            : favoriteKey;
        try {
            MediaSessionManager manager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager == null) return;
            ComponentName listener = new ComponentName(this, ItsNotificationListenerService.class);
            List<MediaController> controllers = manager.getActiveSessions(listener);
            if (controllers == null) return;
            for (MediaController controller : controllers) {
                if (controller == null || !packageName.equals(controller.getPackageName())) continue;
                PlaybackState state = controller.getPlaybackState();
                if (state == null || state.getCustomActions() == null) return;
                for (PlaybackState.CustomAction customAction : state.getCustomActions()) {
                    String name = customAction.getAction() == null ? "" : customAction.getAction().toLowerCase(java.util.Locale.ROOT);
                    if (name.contains("favorite") || name.contains("heart") || name.contains("like") || name.contains("save")) {
                        controller.getTransportControls().sendCustomAction(customAction.getAction(), null);
                        return;
                    }
                }
                return;
            }
        } catch (SecurityException err) {
            Log.w(TAG, "Favorit membutuhkan izin media", err);
        } catch (RuntimeException err) {
            Log.w(TAG, "Toggle favorit gagal", err);
        }
    }

    private void dispatchMediaSeek(String packageName, float fraction) {
        float safeFraction = Math.max(0f, Math.min(1f, fraction));
        try {
            MediaSessionManager manager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager == null) return;
            ComponentName listener = new ComponentName(this, ItsNotificationListenerService.class);
            List<MediaController> controllers = manager.getActiveSessions(listener);
            if (controllers == null) return;
            for (MediaController controller : controllers) {
                if (controller == null) continue;
                if (packageName != null && !packageName.isEmpty() && !packageName.equals(controller.getPackageName())) continue;
                MediaMetadata metadata = controller.getMetadata();
                long duration = metadata == null ? 0L : metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
                if (duration <= 0L) {
                    Toast.makeText(this, "Durasi media belum tersedia", Toast.LENGTH_SHORT).show();
                    return;
                }
                MediaController.TransportControls controls = controller.getTransportControls();
                if (controls != null) controls.seekTo(Math.round(duration * safeFraction));
                return;
            }
        } catch (SecurityException err) {
            Toast.makeText(this, "Izin notifikasi/media diperlukan", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "Seek media membutuhkan izin", err);
        } catch (RuntimeException err) {
            Log.w(TAG, "Seek media gagal", err);
        }
    }

    private void dispatchMediaRepeat(String packageName) {
        boolean repeatEnabled = !LockScreenRenderer.isMediaRepeatEnabled(this, packageName);
        boolean sent = false;
        try {
            MediaSessionManager manager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager != null) {
                ComponentName listener = new ComponentName(this, ItsNotificationListenerService.class);
                List<MediaController> controllers = manager.getActiveSessions(listener);
                if (controllers != null) {
                    for (MediaController controller : controllers) {
                        if (controller == null) continue;
                        if (packageName != null && !packageName.isEmpty() && !packageName.equals(controller.getPackageName())) continue;
                        MediaController.TransportControls controls = controller.getTransportControls();
                        PlaybackState state = controller.getPlaybackState();
                        if (state != null && state.getCustomActions() != null && controls != null) {
                            for (PlaybackState.CustomAction customAction : state.getCustomActions()) {
                                String action = customAction.getAction() == null ? "" : customAction.getAction().toLowerCase(Locale.ROOT);
                                String label = customAction.getName() == null ? "" : customAction.getName().toString().toLowerCase(Locale.ROOT);
                                if (action.contains("repeat") || label.contains("repeat") || label.contains("ulangi")) {
                                    controls.sendCustomAction(customAction.getAction(), null);
                                    sent = true;
                                    break;
                                }
                            }
                        }
                        if (!sent && controls != null) {
                            try {
                                controls.getClass().getMethod("setRepeatMode", int.class).invoke(controls, repeatEnabled ? 1 : 0);
                                sent = true;
                            } catch (ReflectiveOperationException ignored) {
                            }
                        }
                        break;
                    }
                }
            }
        } catch (SecurityException err) {
            Toast.makeText(this, "Izin media diperlukan", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "Repeat membutuhkan izin media", err);
        } catch (RuntimeException err) {
            Log.w(TAG, "Repeat media gagal", err);
        }
        LockScreenRenderer.toggleMediaRepeat(this, packageName);
        Toast.makeText(this, repeatEnabled ? "Ulangi lagu aktif" : "Ulangi lagu mati", Toast.LENGTH_SHORT).show();
        if (!sent) Log.d(TAG, "Media app belum membagikan kontrol repeat langsung");
    }

    private void toggleMusicMute() {
        try {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_TOGGLE_MUTE, 0);
        } catch (RuntimeException err) {
            Log.w(TAG, "Toggle mute gagal", err);
        }
    }

    private ModalPalette modalPalette(String packageName) {
        boolean light = modalLightTheme();
        int accent = LockScreenRenderer.activeDynamicAccent(light);
        if (light) {
            return new ModalPalette(
                true,
                blendLocal(0xFFF8FAFC, accent, 0.08f),
                blendLocal(0xFFFFFFFF, accent, 0.06f),
                blendLocal(0xFFF1F5F9, accent, 0.10f),
                adjustAlphaLocal(accent, 38),
                0xFF0F172A,
                0xFF64748B,
                accent,
                0xFFFFFFFF,
                adjustAlphaLocal(accent, 84),
                accent,
                blendLocal(0xFF0F172A, accent, 0.38f)
            );
        }
        return new ModalPalette(
            false,
            blendLocal(0xFF111111, accent, 0.16f),
            blendLocal(0xFF171717, accent, 0.18f),
            blendLocal(0xFF242128, accent, 0.20f),
            adjustAlphaLocal(accent, 52),
            0xFFFFFFFF,
            0xFFAAA2A0,
            accent,
            0xFFFFFFFF,
            adjustAlphaLocal(accent, 92),
            accent,
            blendLocal(0xFFFFFFFF, accent, 0.46f)
        );
    }

    private boolean modalLightTheme() {
        String mode = getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).getString("lock_theme_mode", "auto");
        if ("light".equals(mode)) return true;
        if ("dark".equals(mode)) return false;
        int mask = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mask != Configuration.UI_MODE_NIGHT_YES;
    }

    private static int blendLocal(int base, int overlay, float amount) {
        float t = Math.max(0f, Math.min(1f, amount));
        int a = Math.round(Color.alpha(base) * (1f - t) + Color.alpha(overlay) * t);
        int r = Math.round(Color.red(base) * (1f - t) + Color.red(overlay) * t);
        int g = Math.round(Color.green(base) * (1f - t) + Color.green(overlay) * t);
        int b = Math.round(Color.blue(base) * (1f - t) + Color.blue(overlay) * t);
        return Color.argb(a, r, g, b);
    }

    private static int adjustAlphaLocal(int color, int alpha) {
        return (color & 0x00ffffff) | ((Math.max(0, Math.min(255, alpha)) & 0xff) << 24);
    }

    private void showMediaDeviceDialog(String packageName) {
        MediaRouter router = (MediaRouter) getSystemService(Context.MEDIA_ROUTER_SERVICE);
        if (router == null) {
            Toast.makeText(this, "Output media belum tersedia", Toast.LENGTH_SHORT).show();
            return;
        }
        float density = getResources().getDisplayMetrics().density;
        ModalPalette palette = modalPalette(packageName);
        int routeTypes = MediaRouter.ROUTE_TYPE_LIVE_AUDIO | MediaRouter.ROUTE_TYPE_USER;
        MediaRouter.RouteInfo selectedRoute = router.getSelectedRoute(routeTypes);
        List<MediaRouter.RouteInfo> routes = new ArrayList<>();
        for (int i = 0; i < router.getRouteCount(); i++) {
            MediaRouter.RouteInfo route = router.getRouteAt(i);
            if (route == null || !route.isEnabled()) continue;
            int supported = route.getSupportedTypes() & routeTypes;
            if (supported == 0) continue;
            CharSequence name = route.getName(this);
            String label = LockScreenRenderer.normalizeMediaDeviceLabel(name == null ? "" : name.toString(), false);
            if (label.isEmpty()) continue;
            routes.add(route);
        }

        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout sheet = baseBottomSheet(density, palette);
        LinearLayout dragArea = bottomSheetHeader(dialog, sheet, "Perangkat", density, palette);
        sheet.addView(dragArea);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(Math.round(8f * density), Math.round(2f * density), Math.round(8f * density), Math.round(10f * density));
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(palette.panel);
        panelBg.setCornerRadius(14f * density);
        panelBg.setStroke(Math.round(1f * density), palette.border);
        panel.setBackground(panelBg);

        if (routes.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("Spotify belum membagikan perangkat output ke Android. Buka Spotify Connect jika perangkat lain belum muncul.");
            empty.setTextColor(palette.text);
            empty.setTextSize(14f);
            empty.setPadding(Math.round(16f * density), Math.round(18f * density), Math.round(16f * density), Math.round(18f * density));
            panel.addView(empty, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ));
        } else {
            for (int i = 0; i < routes.size(); i++) {
                MediaRouter.RouteInfo route = routes.get(i);
                boolean active = route == selectedRoute;
                panel.addView(deviceRouteRow(router, routeTypes, route, active, packageName, dialog, density, palette), new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    Math.round(72f * density)
                ));
                if (i < routes.size() - 1) {
                    View divider = new View(this);
                    divider.setBackgroundColor(palette.border);
                    panel.addView(divider, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        Math.max(1, Math.round(0.6f * density))
                    ));
                }
            }
        }

        sheet.addView(panel, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        dialog.setContentView(sheet, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        dialog.show();
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int collapsed = Math.round(screenHeight * 0.40f);
        int expanded = Math.round(screenHeight * 0.92f);
        configureBottomSheetWindow(dialog, collapsed);
        attachResizableBottomSheet(dialog, sheet, collapsed, expanded, dragArea);
    }

    private View deviceRouteRow(
        MediaRouter router,
        int routeTypes,
        MediaRouter.RouteInfo route,
        boolean active,
        String packageName,
        Dialog dialog,
        float density,
        ModalPalette palette
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Math.round(14f * density), 0, Math.round(14f * density), 0);
        CharSequence name = route.getName(this);
        String label = LockScreenRenderer.normalizeMediaDeviceLabel(name == null ? "" : name.toString(), false);
        IconButtonView device = new IconButtonView(this, routeIconType(label), active ? palette.accent : palette.text);
        row.addView(device, new LinearLayout.LayoutParams(Math.round(40f * density), Math.round(40f * density)));

        LinearLayout textColumn = new LinearLayout(this);
        textColumn.setOrientation(LinearLayout.VERTICAL);
        textColumn.setPadding(Math.round(12f * density), 0, Math.round(8f * density), 0);
        TextView title = new TextView(this);
        title.setText(label);
        title.setTextColor(palette.text);
        title.setTextSize(15.5f);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        textColumn.addView(title);
        CharSequence description = route.getDescription();
        String detail = description == null ? (active ? "Sedang digunakan" : "Tersedia") : description.toString().trim();
        if (TextUtils.isEmpty(detail)) detail = active ? "Sedang digunakan" : "Tersedia";
        TextView subtitle = new TextView(this);
        subtitle.setText(detail);
        subtitle.setTextColor(active ? palette.accent : palette.muted);
        subtitle.setTextSize(12.5f);
        subtitle.setSingleLine(true);
        subtitle.setEllipsize(TextUtils.TruncateAt.END);
        textColumn.addView(subtitle);
        row.addView(textColumn, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        if (active) {
            IconButtonView check = new IconButtonView(this, IconButtonView.TYPE_CHECK, palette.accent);
            row.addView(check, new LinearLayout.LayoutParams(Math.round(36f * density), Math.round(36f * density)));
        }

        row.setOnClickListener((v) -> {
            int supported = route.getSupportedTypes() & routeTypes;
            if (supported != 0) router.selectRoute(supported, route);
            LockScreenRenderer.setMediaDeviceLabel(this, packageName, label);
            Toast.makeText(this, "Diputar di " + label, Toast.LENGTH_SHORT).show();
            dialog.dismiss();
            invalidateLockScreen();
        });
        return row;
    }

    private static int routeIconType(String label) {
        String lower = label == null ? "" : label.toLowerCase(Locale.ROOT);
        if (lower.contains("laptop") || lower.contains("pc") || lower.contains("desktop") || lower.contains("computer")) {
            return IconButtonView.TYPE_LAPTOP;
        }
        if (lower.contains("speaker") || lower.contains("tv") || lower.contains("cast") || lower.contains("chromecast")) {
            return IconButtonView.TYPE_SPEAKER;
        }
        return IconButtonView.TYPE_DEVICE;
    }

    private void showMediaTranscriptDialog(String packageName) {
        float density = getResources().getDisplayMetrics().density;
        ModalPalette palette = modalPalette(packageName);
        MediaSummary summary = currentMediaSummary(packageName);
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int collapsedHeight = Math.round(screenHeight * 0.48f);
        int expandedHeight = Math.round(screenHeight * 0.96f);
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout sheet = baseBottomSheet(density, palette);
        LinearLayout dragArea = bottomSheetHeader(dialog, sheet, "Transkrip Lirik", density, palette);
        View handle = dragArea.getChildCount() > 0 ? dragArea.getChildAt(0) : dragArea;
        View header = dragArea.getChildCount() > 1 ? dragArea.getChildAt(1) : dragArea;
        sheet.addView(dragArea);

        TextView language = new TextView(this);
        language.setText("Bahasa: belum tersedia - Sumber: Android MediaSession (metadata)");
        language.setTextColor(palette.muted);
        language.setTextSize(13.5f);
        language.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams langParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        langParams.setMargins(0, 0, 0, Math.round(12f * density));
        sheet.addView(language, langParams);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(Math.round(14f * density), Math.round(14f * density), Math.round(14f * density), Math.round(14f * density));
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(palette.panel);
        panelBg.setCornerRadius(14f * density);
        panelBg.setStroke(Math.round(1f * density), palette.border);
        panel.setBackground(panelBg);

        TextView title = new TextView(this);
        title.setText(TextUtils.isEmpty(summary.title) ? "Media aktif" : summary.title);
        title.setTextColor(palette.text);
        title.setTextSize(17f);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        panel.addView(title);

        TextView artist = new TextView(this);
        artist.setText(TextUtils.isEmpty(summary.artist) ? "Sumber lirik resmi belum dikonfigurasi" : summary.artist);
        artist.setTextColor(palette.muted);
        artist.setTextSize(13.5f);
        artist.setPadding(0, Math.round(4f * density), 0, Math.round(16f * density));
        artist.setSingleLine(true);
        artist.setEllipsize(TextUtils.TruncateAt.END);
        panel.addView(artist);

        ListView list = new ListView(this);
        list.setDivider(null);
        list.setSelector(new ColorDrawable(Color.TRANSPARENT));
        list.setCacheColorHint(Color.TRANSPARENT);
        list.setAdapter(new TranscriptAdapter(this, transcriptLines(summary), palette));
        list.setOnItemClickListener((parent, view, position, id) -> {
            Object item = parent.getItemAtPosition(position);
            if (item instanceof TranscriptLine) {
                TranscriptLine line = (TranscriptLine) item;
                if (summary.durationMs > 0L && line.timeMs >= 0L) {
                    dispatchMediaSeek(packageName, line.timeMs / (float) summary.durationMs);
                    dialog.dismiss();
                }
            }
        });
        panel.addView(list, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        sheet.addView(panel, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
        dialog.setContentView(sheet, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        dialog.show();
        configureBottomSheetWindow(dialog, collapsedHeight);
        attachResizableBottomSheet(dialog, sheet, collapsedHeight, expandedHeight, dragArea, handle, header);
    }

    private MediaSummary currentMediaSummary(String packageName) {
        try {
            MediaSessionManager manager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager == null) return MediaSummary.empty();
            ComponentName listener = new ComponentName(this, ItsNotificationListenerService.class);
            List<MediaController> controllers = manager.getActiveSessions(listener);
            if (controllers == null) return MediaSummary.empty();
            for (MediaController controller : controllers) {
                if (controller == null) continue;
                if (packageName != null && !packageName.isEmpty() && !packageName.equals(controller.getPackageName())) continue;
                MediaMetadata metadata = controller.getMetadata();
                if (metadata == null) return MediaSummary.empty();
                String title = firstNonEmptyLocal(
                    metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
                    metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
                );
                String artist = firstNonEmptyLocal(
                    metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
                    metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
                );
                long duration = Math.max(0L, metadata.getLong(MediaMetadata.METADATA_KEY_DURATION));
                return new MediaSummary(title, artist, duration);
            }
        } catch (RuntimeException ignored) {
        }
        return MediaSummary.empty();
    }

    private static String firstNonEmptyLocal(String first, String second) {
        if (!TextUtils.isEmpty(first)) return first;
        return second == null ? "" : second;
    }

    private List<TranscriptLine> transcriptLines(MediaSummary summary) {
        List<TranscriptLine> lines = new ArrayList<>();
        lines.add(new TranscriptLine(0L, "Metadata lagu diambil dari Android MediaSession."));
        lines.add(new TranscriptLine(Math.max(0L, summary.durationMs / 3L), "Lirik sinkron belum tersedia: Spotify/Android tidak memberi endpoint lirik resmi di media session."));
        lines.add(new TranscriptLine(Math.max(0L, summary.durationMs * 2L / 3L), "Jika sumber lirik berlisensi ditambahkan, baris akan tampil realtime dan bisa ditekan untuk seek."));
        return lines;
    }

    private LinearLayout baseBottomSheet(float density) {
        return baseBottomSheet(density, modalPalette(null));
    }

    private LinearLayout baseBottomSheet(float density, ModalPalette palette) {
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(12f * density);
        sheet.setPadding(pad, Math.round(10f * density), pad, Math.round(12f * density));
        sheet.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        GradientDrawable sheetBg = new GradientDrawable();
        sheetBg.setColor(palette.sheet);
        sheetBg.setCornerRadii(new float[] {
            22f * density, 22f * density,
            22f * density, 22f * density,
            0f, 0f,
            0f, 0f
        });
        sheet.setBackground(sheetBg);
        return sheet;
    }

    private LinearLayout bottomSheetHeader(Dialog dialog, View sheet, String titleText, float density) {
        return bottomSheetHeader(dialog, sheet, titleText, density, modalPalette(null));
    }

    private LinearLayout bottomSheetHeader(Dialog dialog, View sheet, String titleText, float density, ModalPalette palette) {
        LinearLayout dragArea = new LinearLayout(this);
        dragArea.setOrientation(LinearLayout.VERTICAL);

        View handle = new View(this);
        GradientDrawable handleBg = new GradientDrawable();
        handleBg.setColor(palette.handle);
        handleBg.setCornerRadius(3f * density);
        handle.setBackground(handleBg);
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(Math.round(44f * density), Math.round(4f * density));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = Math.round(12f * density);
        dragArea.addView(handle, handleParams);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(Math.round(4f * density), 0, Math.round(4f * density), Math.round(14f * density));
        View leftSpacer = new View(this);
        header.addView(leftSpacer, new LinearLayout.LayoutParams(Math.round(44f * density), Math.round(44f * density)));

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextColor(palette.text);
        title.setTextSize(18f);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        IconButtonView close = new IconButtonView(this, IconButtonView.TYPE_CLOSE, palette.text);
        close.setContentDescription("Tutup");
        close.setOnClickListener((v) -> dialog.dismiss());
        header.addView(close, new LinearLayout.LayoutParams(Math.round(44f * density), Math.round(44f * density)));
        dragArea.addView(header);
        return dragArea;
    }

    private void configureBottomSheetWindow(Dialog dialog, int height) {
        Window window = dialog.getWindow();
        if (window == null) return;
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        window.setGravity(Gravity.BOTTOM);
        WindowManager.LayoutParams params = window.getAttributes();
        params.width = WindowManager.LayoutParams.MATCH_PARENT;
        params.height = Math.max(1, height);
        params.dimAmount = 0.45f;
        window.setAttributes(params);
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, Math.max(1, height));
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
    }

    private int currentBottomSheetHeight(Dialog dialog, int fallback) {
        Window window = dialog.getWindow();
        if (window == null) return fallback;
        int height = window.getAttributes().height;
        return height > 0 ? height : fallback;
    }

    private void setBottomSheetHeight(Dialog dialog, int height) {
        Window window = dialog.getWindow();
        if (window == null || height <= 0) return;
        WindowManager.LayoutParams params = window.getAttributes();
        params.height = height;
        window.setAttributes(params);
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, height);
    }

    private void animateBottomSheetHeight(Dialog dialog, int from, int to) {
        if (from == to || from <= 0 || to <= 0) {
            setBottomSheetHeight(dialog, to);
            return;
        }
        ValueAnimator animator = ValueAnimator.ofInt(from, to);
        animator.setDuration(180L);
        animator.addUpdateListener((value) -> setBottomSheetHeight(dialog, (int) value.getAnimatedValue()));
        animator.start();
    }

    private void attachResizableBottomSheet(Dialog dialog, View sheet, int collapsedHeight, int expandedHeight, View... dragTargets) {
        if (collapsedHeight <= 0 || expandedHeight <= 0 || expandedHeight <= collapsedHeight) return;
        final float[] startY = new float[1];
        final int[] startHeight = new int[1];
        final boolean[] dragging = new boolean[1];
        final boolean[] closing = new boolean[1];
        View.OnTouchListener listener = (view, event) -> {
            if (closing[0]) return true;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startY[0] = event.getRawY();
                    startHeight[0] = currentBottomSheetHeight(dialog, collapsedHeight);
                    dragging[0] = false;
                    sheet.animate().cancel();
                    sheet.setAlpha(1f);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dy = event.getRawY() - startY[0];
                    if (Math.abs(dy) > 5f) dragging[0] = true;
                    if (startHeight[0] <= collapsedHeight + 12 && dy > 0f) {
                        sheet.setTranslationY(Math.min(dy * 0.48f, collapsedHeight * 0.42f));
                    } else {
                        sheet.setTranslationY(0f);
                        int nextHeight = Math.max(collapsedHeight, Math.min(expandedHeight, Math.round(startHeight[0] - dy)));
                        setBottomSheetHeight(dialog, nextHeight);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    float totalDy = event.getRawY() - startY[0];
                    int current = currentBottomSheetHeight(dialog, collapsedHeight);
                    if (dragging[0] && startHeight[0] <= collapsedHeight + 12 && totalDy > 140f) {
                        closing[0] = true;
                        sheet.animate()
                            .translationY(Math.max(sheet.getHeight() * 0.45f, 220f))
                            .alpha(0f)
                            .setDuration(160L)
                            .withEndAction(dialog::dismiss)
                            .start();
                    } else {
                        int target = (totalDy < -80f || current > (collapsedHeight + expandedHeight) / 2) ? expandedHeight : collapsedHeight;
                        sheet.animate().translationY(0f).alpha(1f).setDuration(150L).start();
                        animateBottomSheetHeight(dialog, current, target);
                    }
                    dragging[0] = false;
                    return true;
                default:
                    return true;
            }
        };
        if (sheet != null) sheet.setMinimumHeight(collapsedHeight);
        for (View target : dragTargets) {
            attachTouchRecursive(target, listener);
        }
    }

    private void attachTouchRecursive(View target, View.OnTouchListener listener) {
        if (target == null) return;
        if (!target.isClickable()) target.setOnTouchListener(listener);
        if (target instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) target;
            for (int i = 0; i < group.getChildCount(); i++) {
                attachTouchRecursive(group.getChildAt(i), listener);
            }
        }
    }

    private void showMediaHistoryDialog(String packageName) {
        List<LockScreenRenderer.HistoryEntry> history = LockScreenRenderer.mediaHistoryFor(packageName);
        float density = getResources().getDisplayMetrics().density;
        ModalPalette palette = modalPalette(packageName);
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int collapsedHeight = Math.round(screenHeight * 0.40f);
        int expandedHeight = Math.round(screenHeight * 0.96f);
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout sheet = baseBottomSheet(density, palette);
        final LinearLayout[] panelRef = new LinearLayout[1];
        final LinearLayout[] skeletonRef = new LinearLayout[1];

        LinearLayout dragArea = bottomSheetHeader(dialog, sheet, "Riwayat Pemutaran", density, palette);
        View handle = dragArea.getChildCount() > 0 ? dragArea.getChildAt(0) : dragArea;
        View header = dragArea.getChildCount() > 1 ? dragArea.getChildAt(1) : dragArea;
        sheet.addView(dragArea);

        HistoryAdapter adapter = new HistoryAdapter(this, packageName, history, palette);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(palette.panel);
        panelBg.setCornerRadius(14f * density);
        panelBg.setStroke(Math.round(1f * density), palette.border);
        panel.setBackground(panelBg);

        FrameLayout listHost = new FrameLayout(this);
        ListView listView = new ListView(this);
        listView.setAdapter(adapter);
        listView.setDivider(null);
        listView.setCacheColorHint(Color.TRANSPARENT);
        listView.setSelector(new ColorDrawable(Color.TRANSPARENT));
        listHost.addView(listView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        TextView empty = new TextView(this);
        empty.setText("Belum ada riwayat lagu yang diputar di sesi ini.");
        empty.setTextColor(palette.muted);
        empty.setTextSize(15f);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(0, Math.round(42f * density), 0, Math.round(48f * density));
        listHost.addView(empty, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        listView.setEmptyView(empty);
        panel.addView(listHost, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        FrameLayout panelFrame = new FrameLayout(this);
        LinearLayout skeleton = createHistorySkeleton(this, Math.min(4, Math.max(1, history.size())), density, palette);
        panelRef[0] = panel;
        skeletonRef[0] = skeleton;
        panelFrame.addView(panel, new FrameLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        ));
        panelFrame.addView(skeleton, new FrameLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        ));
        if (history.isEmpty()) {
            skeleton.setVisibility(View.GONE);
        } else {
            panel.setAlpha(0f);
            panelFrame.postDelayed(() -> {
                panel.animate().alpha(1f).setDuration(180L).start();
                skeleton.animate()
                    .alpha(0f)
                    .setDuration(160L)
                    .withEndAction(() -> skeleton.setVisibility(View.GONE))
                    .start();
            }, 120L);
        }
        sheet.addView(panelFrame, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        LinearLayout clear = createHistoryClearButton(packageName, dialog, density, palette);
        LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            Math.round(58f * density)
        );
        clearParams.setMargins(Math.round(8f * density), Math.round(10f * density), Math.round(8f * density), Math.round(2f * density));
        sheet.addView(clear, clearParams);

        dialog.setContentView(sheet, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        dialog.show();
        configureBottomSheetWindow(dialog, collapsedHeight);
        attachResizableBottomSheet(dialog, sheet, collapsedHeight, expandedHeight, dragArea, handle, header);
        startHistoryRealtimeRefresh(dialog, sheet, packageName, adapter, panelRef[0], skeletonRef[0]);
    }

    private void startHistoryRealtimeRefresh(
        Dialog dialog,
        View host,
        String packageName,
        HistoryAdapter adapter,
        LinearLayout panel,
        LinearLayout skeleton
    ) {
        final boolean[] alive = new boolean[] { true };
        dialog.setOnDismissListener((ignored) -> alive[0] = false);
        Runnable refresh = new Runnable() {
            @Override
            public void run() {
                if (!alive[0] || host == null) return;
                List<LockScreenRenderer.HistoryEntry> next = LockScreenRenderer.mediaHistoryFor(packageName);
                boolean changed = adapter.hasDifferentItems(next);
                boolean newTop = !adapter.firstKey().equals(historyFirstKey(next));
                if (changed) {
                    if (newTop && panel != null && skeleton != null) {
                        skeleton.setVisibility(View.VISIBLE);
                        skeleton.setAlpha(1f);
                        panel.animate().cancel();
                        panel.setAlpha(0.22f);
                        host.postDelayed(() -> {
                            if (!alive[0]) return;
                            adapter.replaceAll(next);
                            panel.setAlpha(0f);
                            panel.animate().alpha(1f).setDuration(190L).start();
                            skeleton.animate()
                                .alpha(0f)
                                .setDuration(170L)
                                .withEndAction(() -> skeleton.setVisibility(View.GONE))
                                .start();
                        }, 120L);
                    } else {
                        adapter.replaceAll(next);
                    }
                }
                host.postDelayed(this, 800L);
            }
        };
        host.postDelayed(refresh, 800L);
    }

    private LinearLayout createHistoryClearButton(String packageName, Dialog dialog, float density, ModalPalette palette) {
        LinearLayout clear = new LinearLayout(this);
        clear.setGravity(Gravity.CENTER);
        clear.setOrientation(LinearLayout.HORIZONTAL);
        clear.setPadding(0, Math.round(12f * density), 0, Math.round(12f * density));
        GradientDrawable clearBg = new GradientDrawable();
        clearBg.setColor(palette.panelSoft);
        clearBg.setCornerRadius(12f * density);
        clearBg.setStroke(Math.max(1, Math.round(1f * density)), palette.border);
        clear.setBackground(clearBg);
        IconButtonView trash = new IconButtonView(this, IconButtonView.TYPE_TRASH, palette.text);
        clear.addView(trash, new LinearLayout.LayoutParams(Math.round(28f * density), Math.round(28f * density)));
        TextView clearText = new TextView(this);
        clearText.setText("Hapus riwayat");
        clearText.setTextColor(palette.text);
        clearText.setTextSize(14f);
        clearText.setPadding(Math.round(8f * density), 0, 0, 0);
        clear.addView(clearText);
        clear.setOnClickListener((v) -> {
            LockScreenRenderer.clearMediaHistory(packageName);
            Toast.makeText(this, "Riwayat dihapus", Toast.LENGTH_SHORT).show();
            dialog.dismiss();
        });
        return clear;
    }

    private LinearLayout createHistorySkeleton(Context context, int rowCount, float density, ModalPalette palette) {
        LinearLayout skeleton = new LinearLayout(context);
        skeleton.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(palette.panel);
        bg.setCornerRadius(14f * density);
        bg.setStroke(Math.round(1f * density), palette.border);
        skeleton.setBackground(bg);
        int rows = Math.max(1, rowCount);
        for (int i = 0; i < rows; i++) {
            LinearLayout row = new LinearLayout(context);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(Math.round(16f * density), Math.round(12f * density), Math.round(16f * density), Math.round(12f * density));

            View art = new View(context);
            GradientDrawable artBg = new GradientDrawable();
            artBg.setColor(palette.panelSoft);
            artBg.setCornerRadius(10f * density);
            art.setBackground(artBg);
            LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(Math.round(58f * density), Math.round(58f * density));
            artParams.rightMargin = Math.round(16f * density);
            row.addView(art, artParams);

            LinearLayout lines = new LinearLayout(context);
            lines.setOrientation(LinearLayout.VERTICAL);
            row.addView(lines, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            lines.addView(skeletonLine(context, 190f, 14f, density, palette.light ? 0xFFE2E8F0 : 0xFF302B35));
            LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(Math.round(124f * density), Math.round(11f * density));
            second.topMargin = Math.round(12f * density);
            View line2 = new View(context);
            GradientDrawable line2Bg = new GradientDrawable();
            line2Bg.setColor(palette.light ? 0xFFE8EEF6 : 0xFF29252E);
            line2Bg.setCornerRadius(6f * density);
            line2.setBackground(line2Bg);
            lines.addView(line2, second);

            LinearLayout meta = new LinearLayout(context);
            meta.setOrientation(LinearLayout.VERTICAL);
            meta.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
            row.addView(meta, new LinearLayout.LayoutParams(Math.round(92f * density), LinearLayout.LayoutParams.WRAP_CONTENT));
            meta.addView(skeletonLine(context, 54f, 11f, density, palette.light ? 0xFFE2E8F0 : 0xFF302B35));
            LinearLayout.LayoutParams durParams = new LinearLayout.LayoutParams(Math.round(48f * density), Math.round(12f * density));
            durParams.topMargin = Math.round(14f * density);
            View dur = new View(context);
            GradientDrawable durBg = new GradientDrawable();
            durBg.setColor(palette.light ? 0xFFFBE2EA : 0xFF3B2633);
            durBg.setCornerRadius(7f * density);
            dur.setBackground(durBg);
            meta.addView(dur, durParams);
            skeleton.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.round(82f * density)));
        }
        return skeleton;
    }

    private View skeletonLine(Context context, float widthDp, float heightDp, float density, int color) {
        View line = new View(context);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(heightDp * density / 2f);
        line.setBackground(bg);
        line.setLayoutParams(new LinearLayout.LayoutParams(Math.round(widthDp * density), Math.round(heightDp * density)));
        return line;
    }

    private void attachSwipeDismiss(Dialog dialog, View sheet, View... dragTargets) {
        final float[] startY = new float[1];
        final boolean[] dragging = new boolean[1];
        View.OnTouchListener listener = (view, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startY[0] = event.getRawY();
                    dragging[0] = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dy = Math.max(0f, event.getRawY() - startY[0]);
                    if (dy > 4f) dragging[0] = true;
                    sheet.setTranslationY(dy);
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    float totalDy = Math.max(0f, event.getRawY() - startY[0]);
                    if (dragging[0] && totalDy > 120f) {
                        dialog.dismiss();
                    } else {
                        sheet.animate().translationY(0f).setDuration(160L).start();
                    }
                    dragging[0] = false;
                    return true;
                default:
                    return true;
            }
        };
        for (View target : dragTargets) {
            if (target != null) target.setOnTouchListener(listener);
        }
    }

    private static String formatHistoryDuration(long durationMs) {
        long totalSec = Math.max(0L, durationMs) / 1000L;
        long minutes = totalSec / 60L;
        long seconds = totalSec % 60L;
        return String.format(java.util.Locale.ROOT, "%d:%02d", minutes, seconds);
    }

    private static String formatHistoryPlayedAt(long playedAtMs) {
        if (playedAtMs <= 0L) return "";
        return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(playedAtMs));
    }

    private static String historyFirstKey(List<LockScreenRenderer.HistoryEntry> entries) {
        if (entries == null || entries.isEmpty()) return "";
        return historyEntryKey(entries.get(0));
    }

    private static String historyListKey(List<LockScreenRenderer.HistoryEntry> entries) {
        if (entries == null || entries.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        int limit = Math.min(24, entries.size());
        for (int i = 0; i < limit; i++) {
            if (i > 0) out.append('\n');
            out.append(historyEntryKey(entries.get(i)));
        }
        return out.toString();
    }

    private static String historyEntryKey(LockScreenRenderer.HistoryEntry entry) {
        if (entry == null) return "";
        return entry.title + "\u0001" + entry.artist + "\u0001" + entry.durationMs + "\u0001" + entry.playedAtMs;
    }

    private void showHistoryItemMenu(View anchor, String packageName, LockScreenRenderer.HistoryEntry entry, HistoryAdapter adapter) {
        showHistoryItemSheet(packageName, entry, adapter);
    }

    private void showHistoryItemSheet(String packageName, LockScreenRenderer.HistoryEntry entry, HistoryAdapter adapter) {
        float density = getResources().getDisplayMetrics().density;
        ModalPalette palette = modalPalette(packageName);
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout sheet = baseBottomSheet(density, palette);
        LinearLayout dragArea = bottomSheetHeader(dialog, sheet, "Opsi Lagu", density, palette);
        sheet.addView(dragArea);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(Math.round(14f * density), Math.round(10f * density), Math.round(14f * density), Math.round(12f * density));
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(palette.panel);
        panelBg.setCornerRadius(14f * density);
        panelBg.setStroke(Math.round(1f * density), palette.border);
        panel.setBackground(panelBg);

        TextView title = new TextView(this);
        title.setText(entry == null || TextUtils.isEmpty(entry.title) ? "Lagu ini" : entry.title);
        title.setTextColor(palette.text);
        title.setTextSize(16f);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        panel.addView(title);

        TextView artist = new TextView(this);
        artist.setText(entry == null || TextUtils.isEmpty(entry.artist) ? "Riwayat pemutaran" : entry.artist);
        artist.setTextColor(palette.muted);
        artist.setTextSize(13f);
        artist.setPadding(0, Math.round(4f * density), 0, Math.round(14f * density));
        artist.setSingleLine(true);
        artist.setEllipsize(TextUtils.TruncateAt.END);
        panel.addView(artist);

        LinearLayout delete = new LinearLayout(this);
        delete.setOrientation(LinearLayout.HORIZONTAL);
        delete.setGravity(Gravity.CENTER_VERTICAL);
        delete.setPadding(Math.round(12f * density), 0, Math.round(12f * density), 0);
        GradientDrawable deleteBg = new GradientDrawable();
        deleteBg.setColor(palette.panelSoft);
        deleteBg.setCornerRadius(12f * density);
        deleteBg.setStroke(Math.max(1, Math.round(1f * density)), palette.border);
        delete.setBackground(deleteBg);
        IconButtonView trash = new IconButtonView(this, IconButtonView.TYPE_TRASH, palette.danger);
        delete.addView(trash, new LinearLayout.LayoutParams(Math.round(34f * density), Math.round(34f * density)));
        TextView deleteText = new TextView(this);
        deleteText.setText("Hapus lagu ini");
        deleteText.setTextColor(palette.dangerText);
        deleteText.setTextSize(15f);
        deleteText.setTypeface(deleteText.getTypeface(), android.graphics.Typeface.BOLD);
        deleteText.setPadding(Math.round(10f * density), 0, 0, 0);
        delete.addView(deleteText);
        delete.setOnClickListener((v) -> {
            LockScreenRenderer.removeMediaHistoryEntry(packageName, entry);
            adapter.remove(entry);
            Toast.makeText(this, "Lagu dihapus dari riwayat", Toast.LENGTH_SHORT).show();
            dialog.dismiss();
        });
        panel.addView(delete, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            Math.round(58f * density)
        ));
        sheet.addView(panel, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        dialog.setContentView(sheet, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        dialog.show();
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int collapsed = Math.round(screenHeight * 0.32f);
        int expanded = Math.round(screenHeight * 0.58f);
        configureBottomSheetWindow(dialog, collapsed);
        attachResizableBottomSheet(dialog, sheet, collapsed, expanded, dragArea);
    }

    private static final class ModalPalette {
        final boolean light;
        final int sheet;
        final int panel;
        final int panelSoft;
        final int border;
        final int text;
        final int muted;
        final int accent;
        final int accentText;
        final int handle;
        final int danger;
        final int dangerText;

        ModalPalette(
            boolean light,
            int sheet,
            int panel,
            int panelSoft,
            int border,
            int text,
            int muted,
            int accent,
            int accentText,
            int handle,
            int danger,
            int dangerText
        ) {
            this.light = light;
            this.sheet = sheet;
            this.panel = panel;
            this.panelSoft = panelSoft;
            this.border = border;
            this.text = text;
            this.muted = muted;
            this.accent = accent;
            this.accentText = accentText;
            this.handle = handle;
            this.danger = danger;
            this.dangerText = dangerText;
        }
    }

    private static final class MediaSummary {
        final String title;
        final String artist;
        final long durationMs;

        MediaSummary(String title, String artist, long durationMs) {
            this.title = title == null ? "" : title;
            this.artist = artist == null ? "" : artist;
            this.durationMs = Math.max(0L, durationMs);
        }

        static MediaSummary empty() {
            return new MediaSummary("", "", 0L);
        }
    }

    private static final class TranscriptLine {
        final long timeMs;
        final String text;

        TranscriptLine(long timeMs, String text) {
            this.timeMs = Math.max(0L, timeMs);
            this.text = text == null ? "" : text;
        }
    }

    private final class TranscriptAdapter extends BaseAdapter {
        private final Context ctx;
        private final List<TranscriptLine> lines;
        private final ModalPalette palette;

        TranscriptAdapter(Context ctx, List<TranscriptLine> lines, ModalPalette palette) {
            this.ctx = ctx;
            this.lines = lines == null ? new ArrayList<>() : new ArrayList<>(lines);
            this.palette = palette;
        }

        @Override
        public int getCount() {
            return lines.size();
        }

        @Override
        public Object getItem(int position) {
            return lines.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            float density = ctx.getResources().getDisplayMetrics().density;
            TranscriptLine line = lines.get(position);
            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.TOP);
            row.setPadding(0, Math.round(9f * density), 0, Math.round(9f * density));

            TextView time = new TextView(ctx);
            time.setText(formatHistoryDuration(line.timeMs));
            time.setTextColor(position == 0 ? palette.accentText : palette.muted);
            time.setTextSize(12f);
            time.setGravity(Gravity.CENTER);
            GradientDrawable chip = new GradientDrawable();
            chip.setColor(position == 0 ? palette.accent : palette.panelSoft);
            chip.setCornerRadius(11f * density);
            time.setBackground(chip);
            LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(Math.round(52f * density), Math.round(26f * density));
            timeParams.rightMargin = Math.round(12f * density);
            row.addView(time, timeParams);

            TextView text = new TextView(ctx);
            text.setText(line.text);
            text.setTextColor(position == 0 ? palette.text : palette.muted);
            text.setTextSize(position == 0 ? 15.5f : 14.5f);
            text.setTypeface(text.getTypeface(), position == 0 ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
            text.setLineSpacing(0f, 1.08f);
            row.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            return row;
        }
    }

    private final class HistoryAdapter extends BaseAdapter {
        private final Context ctx;
        private final String packageName;
        private final ModalPalette palette;
        private final List<LockScreenRenderer.HistoryEntry> items;

        HistoryAdapter(Context ctx, String packageName, List<LockScreenRenderer.HistoryEntry> items, ModalPalette palette) {
            this.ctx = ctx;
            this.packageName = packageName;
            this.palette = palette;
            this.items = new ArrayList<>(items);
        }

        void remove(LockScreenRenderer.HistoryEntry entry) {
            items.remove(entry);
            notifyDataSetChanged();
        }

        String firstKey() {
            return historyFirstKey(items);
        }

        boolean hasDifferentItems(List<LockScreenRenderer.HistoryEntry> next) {
            return !historyListKey(items).equals(historyListKey(next));
        }

        void replaceAll(List<LockScreenRenderer.HistoryEntry> next) {
            items.clear();
            if (next != null) items.addAll(next);
            notifyDataSetChanged();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public Object getItem(int position) {
            return items.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            LockScreenRenderer.HistoryEntry entry = items.get(position);
            float density = ctx.getResources().getDisplayMetrics().density;

            LinearLayout root = new LinearLayout(ctx);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setPadding(0, 0, 0, 0);

            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            int padH = Math.round(16f * density);
            int padV = Math.round(12f * density);
            row.setPadding(padH, padV, padH, padV);

            CoverView cover = new CoverView(ctx);
            cover.setBitmap(entry.art);
            int coverSize = Math.round(58f * density);
            LinearLayout.LayoutParams coverParams = new LinearLayout.LayoutParams(coverSize, coverSize);
            coverParams.rightMargin = Math.round(16f * density);
            cover.setLayoutParams(coverParams);
            row.addView(cover);

            LinearLayout textColumn = new LinearLayout(ctx);
            textColumn.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            textColumn.setLayoutParams(textParams);

            TextView title = new TextView(ctx);
            title.setText(entry.title);
            title.setTextColor(palette.text);
            title.setTextSize(15f);
            title.setSingleLine(true);
            title.setEllipsize(TextUtils.TruncateAt.END);
            textColumn.addView(title);

            TextView artist = new TextView(ctx);
            artist.setText(entry.artist);
            artist.setTextColor(palette.muted);
            artist.setTextSize(12.5f);
            artist.setSingleLine(true);
            artist.setEllipsize(TextUtils.TruncateAt.END);
            artist.setPadding(0, Math.round(4f * density), 0, 0);
            textColumn.addView(artist);
            row.addView(textColumn);

            LinearLayout meta = new LinearLayout(ctx);
            meta.setOrientation(LinearLayout.VERTICAL);
            meta.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
            meta.setPadding(Math.round(10f * density), 0, Math.round(6f * density), 0);
            row.addView(meta, new LinearLayout.LayoutParams(Math.round(62f * density), LinearLayout.LayoutParams.WRAP_CONTENT));

            TextView playedAt = new TextView(ctx);
            playedAt.setText(formatHistoryPlayedAt(entry.playedAtMs));
            playedAt.setTextColor(palette.muted);
            playedAt.setTextSize(11.5f);
            playedAt.setGravity(Gravity.RIGHT);
            meta.addView(playedAt, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            TextView duration = new TextView(ctx);
            duration.setText(formatHistoryDuration(entry.durationMs));
            duration.setTextColor(palette.accent);
            duration.setTextSize(12.5f);
            duration.setGravity(Gravity.RIGHT);
            duration.setPadding(0, Math.round(7f * density), 0, 0);
            meta.addView(duration, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            IconButtonView more = new IconButtonView(ctx, IconButtonView.TYPE_MORE, palette.muted);
            more.setContentDescription("Opsi riwayat");
            more.setOnClickListener((v) -> showHistoryItemMenu(v, packageName, entry, this));
            row.addView(more, new LinearLayout.LayoutParams(Math.round(38f * density), Math.round(54f * density)));

            root.addView(row, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                Math.round(82f * density)
            ));
            if (position < items.size() - 1) {
                View divider = new View(ctx);
                divider.setBackgroundColor(palette.border);
                LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    Math.max(1, Math.round(0.6f * density))
                );
                dividerParams.leftMargin = Math.round(90f * density);
                root.addView(divider, dividerParams);
            }
            root.setAlpha(0f);
            root.setTranslationY(10f * density);
            root.animate()
                .alpha(1f)
                .translationY(0f)
                .setStartDelay(Math.min(240L, position * 42L))
                .setDuration(220L)
                .start();

            return root;
        }
    }

    private static final class CoverView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private Bitmap bitmap;

        CoverView(Context context) {
            super(context);
        }

        void setBitmap(Bitmap bitmap) {
            this.bitmap = bitmap;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float density = Math.max(0.1f, getResources().getDisplayMetrics().density);
            RectF bounds = new RectF(0f, 0f, getWidth(), getHeight());
            float radius = 10f * density;
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(0xFF2A2630);
            canvas.drawRoundRect(bounds, radius, radius, paint);
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(bounds, radius, radius, Path.Direction.CW);
            canvas.clipPath(clip);
            if (bitmap != null && !bitmap.isRecycled() && bitmap.getWidth() > 0 && bitmap.getHeight() > 0) {
                int bitmapW = bitmap.getWidth();
                int bitmapH = bitmap.getHeight();
                float srcRatio = bitmapW / (float) bitmapH;
                float dstRatio = Math.max(0.1f, bounds.width() / Math.max(1f, bounds.height()));
                Rect src;
                if (srcRatio > dstRatio) {
                    int newW = Math.max(1, Math.round(bitmapH * dstRatio));
                    int left = Math.max(0, (bitmapW - newW) / 2);
                    src = new Rect(left, 0, Math.min(bitmapW, left + newW), bitmapH);
                } else {
                    int newH = Math.max(1, Math.round(bitmapW / dstRatio));
                    int top = Math.max(0, (bitmapH - newH) / 2);
                    src = new Rect(0, top, bitmapW, Math.min(bitmapH, top + newH));
                }
                canvas.drawBitmap(bitmap, src, bounds, paint);
            } else {
                paint.setColor(0xFF473840);
                canvas.drawRect(bounds, paint);
                drawMiniMusicGlyph(canvas, bounds, 0xFFD8D0D4);
            }
            canvas.restore();
        }

        private void drawMiniMusicGlyph(Canvas canvas, RectF bounds, int color) {
            Paint glyph = new Paint(Paint.ANTI_ALIAS_FLAG);
            glyph.setStyle(Paint.Style.STROKE);
            glyph.setStrokeWidth(Math.max(2f, bounds.width() * 0.055f));
            glyph.setStrokeCap(Paint.Cap.ROUND);
            glyph.setColor(color);
            float cx = bounds.centerX();
            float cy = bounds.centerY();
            float size = Math.min(bounds.width(), bounds.height());
            canvas.drawLine(cx - size * 0.04f, cy - size * 0.22f, cx - size * 0.04f, cy + size * 0.12f, glyph);
            canvas.drawLine(cx - size * 0.04f, cy - size * 0.22f, cx + size * 0.24f, cy - size * 0.12f, glyph);
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(color);
            canvas.drawCircle(cx - size * 0.14f, cy + size * 0.14f, size * 0.085f, fill);
            canvas.drawCircle(cx + size * 0.14f, cy + size * 0.24f, size * 0.085f, fill);
        }
    }

    private static final class IconButtonView extends View {
        static final int TYPE_CLOSE = 1;
        static final int TYPE_MORE = 2;
        static final int TYPE_TRASH = 3;
        static final int TYPE_DEVICE = 4;
        static final int TYPE_CHECK = 5;
        static final int TYPE_LAPTOP = 6;
        static final int TYPE_SPEAKER = 7;

        private final int type;
        private final int color;

        IconButtonView(Context context, int type, int color) {
            super(context);
            this.type = type;
            this.color = color;
            setClickable(true);
            setFocusable(true);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float density = Math.max(0.1f, getResources().getDisplayMetrics().density);
            float w = getWidth();
            float h = getHeight();
            float cx = w / 2f;
            float cy = h / 2f;
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setColor(color);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            stroke.setStrokeJoin(Paint.Join.ROUND);

            if (type == TYPE_CLOSE) {
                stroke.setStrokeWidth(2.1f * density);
                float s = Math.min(w, h) * 0.18f;
                canvas.drawLine(cx - s, cy - s, cx + s, cy + s, stroke);
                canvas.drawLine(cx + s, cy - s, cx - s, cy + s, stroke);
                return;
            }

            if (type == TYPE_MORE) {
                Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
                dot.setStyle(Paint.Style.FILL);
                dot.setColor(color);
                float r = Math.max(2f * density, Math.min(w, h) * 0.045f);
                canvas.drawCircle(cx, cy - h * 0.18f, r, dot);
                canvas.drawCircle(cx, cy, r, dot);
                canvas.drawCircle(cx, cy + h * 0.18f, r, dot);
                return;
            }

            if (type == TYPE_DEVICE) {
                stroke.setStrokeWidth(2.2f * density);
                RectF phone = new RectF(cx - w * 0.16f, cy - h * 0.28f, cx + w * 0.16f, cy + h * 0.28f);
                canvas.drawRoundRect(phone, 5f * density, 5f * density, stroke);
                canvas.drawLine(cx - w * 0.06f, cy + h * 0.18f, cx + w * 0.06f, cy + h * 0.18f, stroke);
                return;
            }

            if (type == TYPE_LAPTOP) {
                stroke.setStrokeWidth(2.2f * density);
                RectF screen = new RectF(cx - w * 0.24f, cy - h * 0.22f, cx + w * 0.24f, cy + h * 0.12f);
                canvas.drawRoundRect(screen, 4f * density, 4f * density, stroke);
                canvas.drawLine(cx - w * 0.34f, cy + h * 0.24f, cx + w * 0.34f, cy + h * 0.24f, stroke);
                canvas.drawLine(cx - w * 0.24f, cy + h * 0.12f, cx - w * 0.34f, cy + h * 0.24f, stroke);
                canvas.drawLine(cx + w * 0.24f, cy + h * 0.12f, cx + w * 0.34f, cy + h * 0.24f, stroke);
                return;
            }

            if (type == TYPE_SPEAKER) {
                stroke.setStrokeWidth(2.2f * density);
                RectF box = new RectF(cx - w * 0.20f, cy - h * 0.30f, cx + w * 0.20f, cy + h * 0.30f);
                canvas.drawRoundRect(box, 7f * density, 7f * density, stroke);
                Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
                fill.setColor(color);
                canvas.drawCircle(cx, cy - h * 0.13f, Math.max(2.5f * density, w * 0.055f), fill);
                canvas.drawCircle(cx, cy + h * 0.13f, Math.max(4f * density, w * 0.09f), stroke);
                return;
            }

            if (type == TYPE_CHECK) {
                stroke.setStrokeWidth(2.5f * density);
                Path check = new Path();
                check.moveTo(cx - w * 0.22f, cy + h * 0.02f);
                check.lineTo(cx - w * 0.06f, cy + h * 0.18f);
                check.lineTo(cx + w * 0.24f, cy - h * 0.20f);
                canvas.drawPath(check, stroke);
                return;
            }

            stroke.setStrokeWidth(2.1f * density);
            RectF body = new RectF(cx - w * 0.18f, cy - h * 0.04f, cx + w * 0.18f, cy + h * 0.26f);
            canvas.drawRoundRect(body, 3f * density, 3f * density, stroke);
            canvas.drawLine(cx - w * 0.24f, cy - h * 0.16f, cx + w * 0.24f, cy - h * 0.16f, stroke);
            canvas.drawLine(cx - w * 0.09f, cy - h * 0.26f, cx + w * 0.09f, cy - h * 0.26f, stroke);
            canvas.drawLine(cx - w * 0.07f, cy + h * 0.02f, cx - w * 0.07f, cy + h * 0.20f, stroke);
            canvas.drawLine(cx + w * 0.07f, cy + h * 0.02f, cx + w * 0.07f, cy + h * 0.20f, stroke);
        }
    }

    private void invalidateLockScreen() {
        if (dashboardView != null) {
            layoutHostedWidgets();
            dashboardView.invalidate();
        }
    }

    private boolean dispatchFallbackMediaKey(String action) {
        AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return false;
        int keyCode;
        if (LockScreenRenderer.SHEET_ACTION_MEDIA_PREVIOUS.equals(action)) {
            keyCode = KeyEvent.KEYCODE_MEDIA_PREVIOUS;
        } else if (LockScreenRenderer.SHEET_ACTION_MEDIA_NEXT.equals(action)) {
            keyCode = KeyEvent.KEYCODE_MEDIA_NEXT;
        } else {
            keyCode = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        }
        long now = android.os.SystemClock.uptimeMillis();
        audioManager.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
        audioManager.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
        return true;
    }

    private void showWidgetSearchDialog() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("Cari widget");
        input.setText(LockScreenRenderer.widgetSearchQuery(this));
        input.setSelectAllOnFocus(true);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Cari widget")
            .setView(input)
            .setNegativeButton("Batal", null)
            .setNeutralButton("Bersihkan", null)
            .setPositiveButton("Terapkan", null)
            .create();
        dialog.setOnShowListener((ignored) -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener((button) -> {
                LockScreenRenderer.setWidgetSearchQuery(this, input.getText() == null ? "" : input.getText().toString());
                if (dashboardView != null) {
                    dashboardView.notificationDetailsScrollY = 0f;
                    dashboardView.invalidate();
                }
                dialog.dismiss();
            });
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener((button) -> {
                input.setText("");
                LockScreenRenderer.setWidgetSearchQuery(this, "");
                if (dashboardView != null) {
                    dashboardView.notificationDetailsScrollY = 0f;
                    dashboardView.invalidate();
                }
                dialog.dismiss();
            });
            input.requestFocus();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
            }
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
        });
        dialog.show();
    }

    private void showNotificationReplyDialog(String notificationKey) {
        if (notificationKey == null || notificationKey.trim().isEmpty()) {
            Toast.makeText(this, "Notifikasi ini belum bisa dibalas", Toast.LENGTH_SHORT).show();
            return;
        }
        EditText input = new EditText(this);
        input.setSingleLine(false);
        input.setMinLines(1);
        input.setMaxLines(4);
        input.setHint("Ketik balasan...");
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Balas pesan")
            .setView(input)
            .setNegativeButton("Batal", null)
            .setPositiveButton("Kirim", null)
            .create();
        dialog.setOnShowListener((ignored) -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener((button) -> {
                String message = input.getText() == null ? "" : input.getText().toString().trim();
                if (message.isEmpty()) {
                    input.setError("Balasan belum diisi");
                    return;
                }
                boolean sent = ItsNotificationListenerService.replyToNotification(this, notificationKey, message);
                Toast.makeText(this, sent ? "Balasan terkirim" : "Balasan gagal, aktifkan akses notifikasi", Toast.LENGTH_SHORT).show();
                if (sent) {
                    dialog.dismiss();
                    loadSnapshotAsync();
                    layoutHostedWidgets();
                    if (dashboardView != null) dashboardView.invalidate();
                }
            });
            input.requestFocus();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
            }
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
        });
        dialog.show();
    }

    private void dismissNotification(String notificationKey) {
        boolean dismissed = ItsNotificationListenerService.dismissNotification(this, notificationKey);
        Toast.makeText(this, dismissed ? "Notifikasi dibersihkan" : "Notifikasi belum dapat dibersihkan", Toast.LENGTH_SHORT).show();
        if (dismissed) loadSnapshotAsync();
    }

    private void openNotification(String notificationKey) {
        boolean opened = ItsNotificationListenerService.openNotification(this, notificationKey);
        Toast.makeText(this, opened ? "Membuka notifikasi" : "Notifikasi belum dapat dibuka", Toast.LENGTH_SHORT).show();
        if (opened) loadSnapshotAsync();
    }

    private void syncHostedWidgets(boolean requestBindIfNeeded) {
        if (rootLayout == null || appWidgetHost == null || appWidgetManager == null) return;
        List<LockScreenRenderer.HostedWidgetSpec> specs = LockScreenRenderer.hostedWidgetSpecs(this);
        Map<String, Integer> savedIds = readHostedWidgetIds();
        Set<String> wanted = new HashSet<>();
        for (LockScreenRenderer.HostedWidgetSpec spec : specs) {
            if (spec == null || spec.provider == null || spec.id.isEmpty()) continue;
            wanted.add(spec.id);
            boolean ready = ensureHostedWidget(spec, savedIds, requestBindIfNeeded);
            LockScreenRenderer.setHostedWidgetReady(this, spec.id, ready);
        }

        List<String> stale = new ArrayList<>();
        for (String id : hostedWidgets.keySet()) {
            if (!wanted.contains(id)) stale.add(id);
        }
        for (String id : stale) {
            HostedWidget hosted = hostedWidgets.remove(id);
            if (hosted != null && hosted.view != null) rootLayout.removeView(hosted.view);
            LockScreenRenderer.setHostedWidgetReady(this, id, false);
        }
        for (String id : new ArrayList<>(savedIds.keySet())) {
            if (!wanted.contains(id)) {
                int appWidgetId = savedIds.remove(id);
                try {
                    if (appWidgetId > 0) appWidgetHost.deleteAppWidgetId(appWidgetId);
                } catch (RuntimeException ignored) {
                }
                LockScreenRenderer.setHostedWidgetReady(this, id, false);
            }
        }
        saveHostedWidgetIds(savedIds);
        layoutHostedWidgets();
    }

    private void requestHostedWidgetBind(String widgetId) {
        if (rootLayout == null || appWidgetHost == null || appWidgetManager == null) return;
        LockScreenRenderer.HostedWidgetSpec spec = LockScreenRenderer.hostedWidgetSpec(this, widgetId);
        if (spec == null || spec.provider == null) return;
        Map<String, Integer> savedIds = readHostedWidgetIds();
        boolean ready = ensureHostedWidget(spec, savedIds, true);
        LockScreenRenderer.setHostedWidgetReady(this, spec.id, ready);
        saveHostedWidgetIds(savedIds);
        layoutHostedWidgets();
    }

    private boolean ensureHostedWidget(
        LockScreenRenderer.HostedWidgetSpec spec,
        Map<String, Integer> savedIds,
        boolean requestBindIfNeeded
    ) {
        HostedWidget existing = hostedWidgets.get(spec.id);
        if (existing != null) {
            existing.spec = spec;
            return true;
        }
        int appWidgetId = savedIds.containsKey(spec.id) ? savedIds.get(spec.id) : -1;
        AppWidgetProviderInfo info = appWidgetId > 0 ? appWidgetManager.getAppWidgetInfo(appWidgetId) : null;
        if (info == null || info.provider == null || !info.provider.equals(spec.provider)) {
            if (appWidgetId > 0) {
                try {
                    appWidgetHost.deleteAppWidgetId(appWidgetId);
                } catch (RuntimeException ignored) {
                }
            }
            appWidgetId = appWidgetHost.allocateAppWidgetId();
            savedIds.put(spec.id, appWidgetId);
            boolean bound = false;
            try {
                bound = appWidgetManager.bindAppWidgetIdIfAllowed(appWidgetId, spec.provider);
            } catch (RuntimeException err) {
                Log.w(TAG, "Widget belum dapat di-bind: " + spec.title, err);
            }
            if (!bound) {
                if (requestBindIfNeeded) requestWidgetBind(appWidgetId, spec);
                return false;
            }
            info = appWidgetManager.getAppWidgetInfo(appWidgetId);
        }
        if (info == null) return false;
        try {
            AppWidgetHostView view = appWidgetHost.createView(this, appWidgetId, info);
            view.setAppWidget(appWidgetId, info);
            view.setVisibility(View.GONE);
            view.setAlpha(1f);
            view.setPadding(0, 0, 0, 0);
            view.setBackgroundColor(android.graphics.Color.TRANSPARENT);
            view.setOnTouchListener(new View.OnTouchListener() {
                private float startX;
                private float startY;
                private float lastY;
                private long downAt;
                private boolean scrolling;
                private boolean forwardingTap;

                @Override
                public boolean onTouch(View touched, MotionEvent event) {
                    if (forwardingTap) return false;
                    if (dashboardView == null) return false;
                    switch (event.getActionMasked()) {
                        case MotionEvent.ACTION_DOWN:
                            startX = event.getRawX();
                            startY = event.getRawY();
                            lastY = startY;
                            downAt = event.getEventTime();
                            scrolling = false;
                            if (touched.getParent() != null) touched.getParent().requestDisallowInterceptTouchEvent(true);
                            return true;
                        case MotionEvent.ACTION_MOVE:
                            float rawX = event.getRawX();
                            float rawY = event.getRawY();
                            float dx = rawX - startX;
                            float dy = rawY - startY;
                            if (!scrolling && Math.abs(dy) < Math.max(18f, Math.abs(dx) * 0.9f)) return true;
                            scrolling = true;
                            dashboardView.scrollMainWidgetsBy(lastY - rawY);
                            lastY = rawY;
                            return true;
                        case MotionEvent.ACTION_UP:
                        case MotionEvent.ACTION_CANCEL:
                            boolean wasScrolling = scrolling;
                            long duration = Math.max(0L, event.getEventTime() - downAt);
                            double distance = Math.hypot(event.getRawX() - startX, event.getRawY() - startY);
                            boolean tap = event.getActionMasked() == MotionEvent.ACTION_UP
                                && !wasScrolling
                                && duration < 280L
                                && distance < 14f;
                            scrolling = false;
                            if (tap) {
                                int[] touchedLocation = new int[2];
                                touched.getLocationOnScreen(touchedLocation);
                                float absoluteX = touchedLocation[0] + event.getX();
                                float absoluteY = touchedLocation[1] + event.getY();
                                if (dashboardView.handleHostedOverlayTap(absoluteX, absoluteY)) return true;
                            }
                            if (tap) forwardTapToHostedWidget(touched, event);
                            return true;
                        default:
                            return true;
                    }
                }

                private void forwardTapToHostedWidget(View touched, MotionEvent source) {
                    long now = SystemClock.uptimeMillis();
                    MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, source.getX(), source.getY(), source.getMetaState());
                    MotionEvent up = MotionEvent.obtain(now, now + 18L, MotionEvent.ACTION_UP, source.getX(), source.getY(), source.getMetaState());
                    forwardingTap = true;
                    try {
                        touched.dispatchTouchEvent(down);
                        touched.dispatchTouchEvent(up);
                    } finally {
                        forwardingTap = false;
                        down.recycle();
                        up.recycle();
                    }
                }
            });
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1);
            int index = detectorWebView == null ? rootLayout.getChildCount() : Math.max(1, rootLayout.indexOfChild(detectorWebView));
            rootLayout.addView(view, index, params);
            HostedWidget hosted = new HostedWidget(spec.id, appWidgetId, spec, view);
            hostedWidgets.put(spec.id, hosted);
            if (info.configure != null && requestBindIfNeeded) requestWidgetConfigure(appWidgetId, info);
            return true;
        } catch (RuntimeException err) {
            Log.w(TAG, "Widget host gagal dibuat: " + spec.title, err);
            return false;
        }
    }

    private void requestWidgetBind(int appWidgetId, LockScreenRenderer.HostedWidgetSpec spec) {
        try {
            Intent bindIntent = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND);
            bindIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            bindIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, spec.provider);
            startActivityForResult(bindIntent, REQUEST_BIND_APP_WIDGET);
        } catch (RuntimeException err) {
            Toast.makeText(this, "Izin widget perlu dibuka dari sistem", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "Permintaan izin widget gagal", err);
        }
    }

    private void requestWidgetConfigure(int appWidgetId, AppWidgetProviderInfo info) {
        try {
            Intent configureIntent = new Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE);
            configureIntent.setComponent(info.configure);
            configureIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            startActivityForResult(configureIntent, REQUEST_BIND_APP_WIDGET);
        } catch (RuntimeException err) {
            Log.w(TAG, "Konfigurasi widget belum dapat dibuka", err);
        }
    }

    private void layoutHostedWidgets() {
        if (dashboardView == null || rootLayout == null) return;
        boolean hidden = dashboardView.hostedWidgetsBlocked();
        float fullProgress = dashboardView.fullWidgetProgress;
        float widgetScrollY = dashboardView.mainWidgetScrollY;
        int mainLimit = LockScreenRenderer.mainHostedWidgetLimit(this);
        RectF widgetViewport = LockScreenRenderer.mainScrollViewportBaseRect();
        Map<String, LockScreenRenderer.HostedWidgetSpec> latestSpecs = new HashMap<>();
        for (LockScreenRenderer.HostedWidgetSpec spec : LockScreenRenderer.hostedWidgetSpecs(this)) {
            if (spec != null && spec.id != null && !spec.id.isEmpty()) latestSpecs.put(spec.id, spec);
        }
        for (HostedWidget hosted : hostedWidgets.values()) {
            if (hosted == null || hosted.view == null || hosted.spec == null) continue;
            LockScreenRenderer.HostedWidgetSpec latestSpec = latestSpecs.get(hosted.id);
            if (latestSpec == null) {
                hosted.view.setClipBounds(null);
                hosted.view.setVisibility(View.GONE);
                continue;
            }
            hosted.spec = latestSpec;
            RectF base = null;
            boolean visible = false;
            RectF clip = null;
            if (!hidden && fullProgress > 0.55f && hosted.spec.fullIndex == dashboardView.fullWidgetIndex) {
                base = LockScreenRenderer.hostedFullWidgetPreviewBaseRect(hosted.spec);
                base.offset(-1080f * (1f - fullProgress), 0f);
                visible = true;
            } else if (!hidden && fullProgress <= 0.55f && hosted.spec.mainIndex < mainLimit) {
                base = LockScreenRenderer.hostedWidgetCardBaseRect(hosted.spec);
                base.offset(0f, -widgetScrollY);
                visible = base.bottom > widgetViewport.top + 8f && base.top < widgetViewport.bottom - 8f;
                if (visible) {
                    clip = new RectF(
                        base.left,
                        Math.max(base.top, widgetViewport.top),
                        base.right,
                        Math.min(base.bottom, widgetViewport.bottom)
                    );
                }
            }
            if (visible && base != null) {
                applyHostedWidgetFrame(hosted, base, clip);
            } else {
                hosted.view.setClipBounds(null);
                hosted.view.setVisibility(View.GONE);
            }
        }
    }

    private void applyHostedWidgetFrame(HostedWidget hosted, RectF base, RectF visibleBase) {
        AppWidgetHostView view = hosted.view;
        float sx = rootLayout.getWidth() / 1080f;
        float sy = rootLayout.getHeight() / 1920f;
        int left = Math.round(base.left * sx);
        int top = Math.round(base.top * sy);
        int width = Math.max(1, Math.round(base.width() * sx));
        int height = Math.max(1, Math.round(base.height() * sy));
        updateHostedWidgetOptions(hosted, width, height);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) view.getLayoutParams();
        if (params.width != width || params.height != height || params.leftMargin != left || params.topMargin != top) {
            params.width = width;
            params.height = height;
            params.leftMargin = left;
            params.topMargin = top;
            view.setLayoutParams(params);
        }
        if (visibleBase != null) {
            int clipLeft = Math.max(0, Math.round((visibleBase.left - base.left) * sx));
            int clipTop = Math.max(0, Math.round((visibleBase.top - base.top) * sy));
            int clipRight = Math.min(width, Math.round((visibleBase.right - base.left) * sx));
            int clipBottom = Math.min(height, Math.round((visibleBase.bottom - base.top) * sy));
            view.setClipBounds(new android.graphics.Rect(clipLeft, clipTop, clipRight, clipBottom));
        } else {
            view.setClipBounds(null);
        }
        view.setVisibility(View.VISIBLE);
    }

    private void updateHostedWidgetOptions(HostedWidget hosted, int widthPx, int heightPx) {
        if (hosted == null || appWidgetManager == null || hosted.appWidgetId <= 0) return;
        if (hosted.lastOptionWidth == widthPx && hosted.lastOptionHeight == heightPx) return;
        hosted.lastOptionWidth = widthPx;
        hosted.lastOptionHeight = heightPx;
        float density = Math.max(0.1f, getResources().getDisplayMetrics().density);
        int widthDp = Math.max(1, Math.round(widthPx / density));
        int heightDp = Math.max(1, Math.round(heightPx / density));
        Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp);
        int hostCategory = AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN;
        try {
            AppWidgetProviderInfo info = appWidgetManager.getAppWidgetInfo(hosted.appWidgetId);
            String providerName = info == null || info.provider == null ? "" : info.provider.flattenToString().toLowerCase(java.util.Locale.ROOT);
            boolean keyguardOnly = info != null
                && (info.widgetCategory & AppWidgetProviderInfo.WIDGET_CATEGORY_KEYGUARD) != 0
                && (info.widgetCategory & AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN) == 0;
            boolean keyguardNamed = providerName.contains("cover")
                || providerName.contains("keyguard")
                || providerName.contains("lockscreen")
                || providerName.contains("lock_screen");
            if (keyguardOnly && (keyguardNamed || info.initialKeyguardLayout != 0)) {
                hostCategory = AppWidgetProviderInfo.WIDGET_CATEGORY_KEYGUARD;
            }
        } catch (RuntimeException ignored) {
        }
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_HOST_CATEGORY, hostCategory);
        try {
            appWidgetManager.updateAppWidgetOptions(hosted.appWidgetId, options);
        } catch (RuntimeException err) {
            Log.w(TAG, "Opsi ukuran widget gagal diperbarui", err);
        }
    }

    private Map<String, Integer> readHostedWidgetIds() {
        Map<String, Integer> out = new HashMap<>();
        String raw = getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).getString(PREF_HOSTED_WIDGET_IDS, "{}");
        try {
            JSONObject object = new JSONObject(raw);
            JSONArray names = object.names();
            if (names == null) return out;
            for (int i = 0; i < names.length(); i++) {
                String id = names.optString(i, "");
                int appWidgetId = object.optInt(id, -1);
                if (!id.isEmpty() && appWidgetId > 0) out.put(id, appWidgetId);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private void saveHostedWidgetIds(Map<String, Integer> ids) {
        try {
            JSONObject object = new JSONObject();
            for (Map.Entry<String, Integer> entry : ids.entrySet()) {
                if (entry.getKey() == null || entry.getKey().isEmpty() || entry.getValue() == null || entry.getValue() <= 0) continue;
                object.put(entry.getKey(), entry.getValue());
            }
            SharedPreferences.Editor editor = getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit();
            editor.putString(PREF_HOSTED_WIDGET_IDS, object.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private void clearHostedViews(boolean deleteIds) {
        if (rootLayout != null) {
            for (HostedWidget hosted : hostedWidgets.values()) {
                if (hosted != null && hosted.view != null) rootLayout.removeView(hosted.view);
                if (deleteIds && hosted != null && hosted.appWidgetId > 0 && appWidgetHost != null) {
                    try {
                        appWidgetHost.deleteAppWidgetId(hosted.appWidgetId);
                    } catch (RuntimeException ignored) {
                    }
                }
            }
        }
        hostedWidgets.clear();
    }

    private static final class HostedWidget {
        final String id;
        final int appWidgetId;
        LockScreenRenderer.HostedWidgetSpec spec;
        final AppWidgetHostView view;
        int lastOptionWidth;
        int lastOptionHeight;

        HostedWidget(String id, int appWidgetId, LockScreenRenderer.HostedWidgetSpec spec, AppWidgetHostView view) {
            this.id = id == null ? "" : id;
            this.appWidgetId = appWidgetId;
            this.spec = spec;
            this.view = view;
        }
    }

    private final class DashboardView extends View {
        private LockScreenRenderer.Snapshot snapshot = LockScreenRenderer.Snapshot.fallback();
        private boolean dragging;
        private boolean showingDetails;
        private boolean detailsTargetOpen;
        private boolean detailsDragging;
        private float detailsProgress;
        private float detailsStartY;
        private boolean showingNotificationDetails;
        private boolean notificationDetailsTargetOpen;
        private boolean notificationDetailsDragging;
        private boolean notificationDetailsHeaderDragging;
        private float notificationDetailsProgress;
        private float notificationDetailsStartY;
        private float notificationDetailsLastY;
        private float notificationDetailsScrollY;
        private long notificationDetailsOpenedAt;
        private boolean showingNotificationList;
        private boolean notificationListTargetOpen;
        private boolean notificationListDragging;
        private boolean notificationListHeaderDragging;
        private float notificationListProgress;
        private float notificationListStartY;
        private float notificationListLastY;
        private float notificationListScrollY;
        private boolean mainWidgetDragging;
        private boolean mainWidgetScrolling;
        private float mainWidgetStartX;
        private float mainWidgetStartY;
        private float mainWidgetLastY;
        private float mainWidgetScrollY;
        private float swipeProgress;
        private int shortcutDrag;
        private float shortcutStartX;
        private float shortcutProgress;
        private boolean fullWidgetPage;
        private boolean fullWidgetDragging;
        private float fullWidgetStartX;
        private float fullWidgetStartY;
        private float fullWidgetProgress;
        private int fullWidgetIndex;
        private long fingerprintPulseUntil;
        private SlotAnalysisResult slot1Result;
        private SlotAnalysisResult slot2Result;

        DashboardView(Context context) {
            super(context);
            setClickable(true);
            setFocusable(true);
            setFocusableInTouchMode(true);
        }

        @Override
        public boolean performClick() {
            super.performClick();
            return true;
        }

        void setSnapshot(LockScreenRenderer.Snapshot snapshot) {
            LockScreenRenderer.Snapshot next = snapshot == null ? LockScreenRenderer.Snapshot.fallback() : snapshot;
            if (this.snapshot.image1.equals(next.image1)) {
                next.copySlotAnalysisFrom(this.snapshot, 1);
            }
            if (this.snapshot.image2.equals(next.image2)) {
                next.copySlotAnalysisFrom(this.snapshot, 2);
            }
            next.copySelectionFrom(this.snapshot);
            this.snapshot = next;
            applyStoredResult(slot1Result);
            applyStoredResult(slot2Result);
            invalidate();
        }

        void updateAnalysis(SlotAnalysisResult result) {
            if (result == null) return;
            if (result.slot == 2) slot2Result = result;
            else slot1Result = result;
            applyStoredResult(result);
            invalidate();
        }

        private void applyStoredResult(SlotAnalysisResult result) {
            if (result == null || !snapshot.matchesImage(result.slot, result.imageLength, result.imageTail)) return;
            snapshot.updateAnalysis(
                result.slot,
                result.state,
                result.note,
                result.frameWidth,
                result.frameHeight,
                result.detections
            );
        }

        boolean hideDetails() {
            if (showingNotificationDetails) {
                notificationDetailsTargetOpen = false;
                invalidate();
                return true;
            }
            if (showingNotificationList) {
                notificationListTargetOpen = false;
                invalidate();
                return true;
            }
            if (!showingDetails) return false;
            detailsTargetOpen = false;
            invalidate();
            return true;
        }

        void startFingerprintUnlockAnimation() {
            fingerprintPulseUntil = System.currentTimeMillis() + 1_600L;
            invalidate();
        }

        void stopFingerprintUnlockAnimation() {
            fingerprintPulseUntil = 0L;
            invalidate();
        }

        void scrollMainWidgetsBy(float pixelDeltaY) {
            float deltaBase = pixelDeltaY * 1920f / Math.max(1f, getHeight());
            mainWidgetScrollY = Math.max(0f, Math.min(LockScreenRenderer.mainWidgetMaxScroll(getContext()), mainWidgetScrollY + deltaBase));
            LockScreenDashboardActivity.this.layoutHostedWidgets();
            invalidate();
        }

        boolean hostedWidgetsBlocked() {
            return showingDetails || detailsProgress > 0.01f
                || showingNotificationDetails || notificationDetailsProgress > 0.01f
                || showingNotificationList || notificationListProgress > 0.01f;
        }

        @Override
        protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
            super.onSizeChanged(width, height, oldWidth, oldHeight);
            LockScreenDashboardActivity.this.layoutHostedWidgets();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            long now = System.currentTimeMillis();
            LockScreenRenderer.draw(
                getContext(),
                canvas,
                snapshot,
                Math.max(1, getWidth()),
                Math.max(1, getHeight()),
                now,
                swipeProgress,
                shortcutDrag,
                shortcutProgress,
                fingerprintPulseUntil > now,
                true,
                mainWidgetScrollY
            );
            boolean needsNextFrame = fingerprintPulseUntil > now;
            if (fullWidgetProgress > 0.001f || fullWidgetPage) {
                LockScreenRenderer.drawFullWidgetPage(
                    getContext(),
                    canvas,
                    snapshot,
                    Math.max(1, getWidth()),
                    Math.max(1, getHeight()),
                    now,
                    fullWidgetProgress,
                    fullWidgetIndex
                );
                if (!fullWidgetDragging) {
                    float target = fullWidgetPage ? 1f : 0f;
                    fullWidgetProgress += (target - fullWidgetProgress) * 0.22f;
                    if (Math.abs(target - fullWidgetProgress) < 0.01f) fullWidgetProgress = target;
                }
                needsNextFrame = needsNextFrame
                    || fullWidgetDragging
                    || Math.abs((fullWidgetPage ? 1f : 0f) - fullWidgetProgress) > 0.001f;
            }
            if (showingDetails) {
                LockScreenRenderer.drawDetectionDetails(
                    getContext(),
                    canvas,
                    snapshot,
                    Math.max(1, getWidth()),
                    Math.max(1, getHeight()),
                    detailsProgress
                );
                if (!detailsDragging) {
                    float target = detailsTargetOpen ? 1f : 0f;
                    detailsProgress += (target - detailsProgress) * 0.22f;
                    if (Math.abs(target - detailsProgress) < 0.01f) detailsProgress = target;
                    if (!detailsTargetOpen && detailsProgress <= 0f) showingDetails = false;
                }
                needsNextFrame = needsNextFrame
                    || detailsDragging
                    || (showingDetails && Math.abs((detailsTargetOpen ? 1f : 0f) - detailsProgress) > 0.001f);
            }
            if (showingNotificationDetails) {
                LockScreenRenderer.drawSettingsSheet(
                    getContext(),
                    canvas,
                    Math.max(1, getWidth()),
                    Math.max(1, getHeight()),
                    notificationDetailsProgress,
                    notificationDetailsScrollY,
                    notificationDetailsOpenedAt
                );
                if (!notificationDetailsDragging) {
                    float target = notificationDetailsTargetOpen ? 1f : 0f;
                    notificationDetailsProgress += (target - notificationDetailsProgress) * 0.22f;
                    if (Math.abs(target - notificationDetailsProgress) < 0.01f) notificationDetailsProgress = target;
                    if (!notificationDetailsTargetOpen && notificationDetailsProgress <= 0f) showingNotificationDetails = false;
                }
                needsNextFrame = needsNextFrame
                    || notificationDetailsDragging
                    || (showingNotificationDetails && Math.abs((notificationDetailsTargetOpen ? 1f : 0f) - notificationDetailsProgress) > 0.001f);
            }
            if (showingNotificationList) {
                LockScreenRenderer.drawNotificationListDetails(
                    getContext(),
                    canvas,
                    Math.max(1, getWidth()),
                    Math.max(1, getHeight()),
                    notificationListProgress,
                    notificationListScrollY
                );
                if (!notificationListDragging) {
                    float target = notificationListTargetOpen ? 1f : 0f;
                    notificationListProgress += (target - notificationListProgress) * 0.22f;
                    if (Math.abs(target - notificationListProgress) < 0.01f) notificationListProgress = target;
                    if (!notificationListTargetOpen && notificationListProgress <= 0f) showingNotificationList = false;
                }
                needsNextFrame = needsNextFrame
                    || notificationListDragging
                    || (showingNotificationList && Math.abs((notificationListTargetOpen ? 1f : 0f) - notificationListProgress) > 0.001f);
            }
            LockScreenDashboardActivity.this.layoutHostedWidgets();
            if (needsNextFrame) postInvalidateOnAnimation();
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            RectF slider = scaledSliderRect();
            float baseX = toBaseX(event.getX());
            float baseY = toBaseY(event.getY());
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (showingNotificationList) {
                        if (scaledRect(LockScreenRenderer.notificationDetailCloseBaseRect()).contains(event.getX(), event.getY())) {
                            notificationListTargetOpen = false;
                            invalidate();
                            return true;
                        }
                        notificationListDragging = true;
                        notificationListHeaderDragging = baseY < 548f;
                        notificationListStartY = event.getY();
                        notificationListLastY = event.getY();
                        return true;
                    }
                    if (showingNotificationDetails) {
                        if (scaledRect(LockScreenRenderer.notificationDetailCloseBaseRect()).contains(event.getX(), event.getY())) {
                            notificationDetailsTargetOpen = false;
                            invalidate();
                            return true;
                        }
                        boolean headerDrag = baseY < 532f;
                        LockScreenRenderer.SheetAction action = LockScreenRenderer.settingsActionAt(getContext(), baseX, baseY, notificationDetailsScrollY);
                        if (action != null) {
                            handleSheetAction(action);
                            return true;
                        }
                        notificationDetailsDragging = true;
                        notificationDetailsHeaderDragging = headerDrag;
                        notificationDetailsStartY = event.getY();
                        notificationDetailsLastY = event.getY();
                        return true;
                    }
                    if (showingDetails) {
                        if (scaledRect(LockScreenRenderer.detailCloseBaseRect()).contains(event.getX(), event.getY())) {
                            detailsTargetOpen = false;
                            invalidate();
                            return true;
                        }
                        detailsDragging = true;
                        detailsStartY = event.getY();
                        return true;
                    }
                    if (fullWidgetProgress > 0.6f) {
                        fullWidgetDragging = true;
                        fullWidgetStartX = event.getX();
                        fullWidgetStartY = event.getY();
                        fullWidgetProgress = 1f;
                        invalidate();
                        return true;
                    }
                    LockScreenRenderer.SheetAction inlineAction = LockScreenRenderer.inlineNotificationActionAt(getContext(), baseX, baseY);
                    if (inlineAction != null) {
                        handleSheetAction(inlineAction);
                        return true;
                    }
                    if (LockScreenRenderer.hasNotifications(getContext())
                        && scaledRect(LockScreenRenderer.notificationTouchBaseRect()).contains(event.getX(), event.getY())) {
                        showingNotificationList = true;
                        notificationListTargetOpen = true;
                        notificationListDragging = false;
                        notificationListProgress = 1f;
                        notificationListScrollY = 0f;
                        invalidate();
                        return true;
                    }
                    if (scaledRect(LockScreenRenderer.themeButtonBaseRect()).contains(event.getX(), event.getY())) {
                        showingNotificationDetails = true;
                        notificationDetailsTargetOpen = true;
                        notificationDetailsDragging = false;
                        notificationDetailsProgress = 1f;
                        notificationDetailsScrollY = 0f;
                        notificationDetailsOpenedAt = System.currentTimeMillis();
                        invalidate();
                        return true;
                    }
                    if (LockScreenRenderer.mainScrollViewportBaseRect().contains(baseX, baseY)) {
                        mainWidgetDragging = true;
                        mainWidgetScrolling = false;
                        mainWidgetStartX = event.getX();
                        mainWidgetStartY = event.getY();
                        mainWidgetLastY = event.getY();
                        return true;
                    }
                    if (scaledRect(LockScreenRenderer.fingerprintBaseRect()).contains(event.getX(), event.getY())) {
                        requestFingerprintUnlock();
                        return true;
                    }
                    if (scaledRect(LockScreenRenderer.leftShortcutBaseRect()).contains(event.getX(), event.getY())) {
                        shortcutDrag = -1;
                        shortcutStartX = event.getX();
                        shortcutProgress = 0f;
                        invalidate();
                        return true;
                    }
                    if (scaledRect(LockScreenRenderer.rightShortcutBaseRect()).contains(event.getX(), event.getY())) {
                        shortcutDrag = 1;
                        shortcutStartX = event.getX();
                        shortcutProgress = 0f;
                        invalidate();
                        return true;
                    }
                    if (slider.contains(event.getX(), event.getY())) {
                        dragging = true;
                        updateProgress(event.getX(), slider);
                        return true;
                    }
                    if (LockScreenRenderer.hasFullWidget(getContext()) && baseY > 430f && baseY < 1620f) {
                        fullWidgetDragging = true;
                        fullWidgetStartX = event.getX();
                        fullWidgetStartY = event.getY();
                        if (!fullWidgetPage) fullWidgetIndex = 0;
                        fullWidgetProgress = 0f;
                        return true;
                    }
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (showingNotificationList && notificationListDragging) {
                        float totalDelta = event.getY() - notificationListStartY;
                        float dy = notificationListLastY - event.getY();
                        float maxScroll = LockScreenRenderer.notificationListMaxScroll(getContext());
                        if (!notificationListHeaderDragging && (notificationListScrollY > 0f || totalDelta < 0f)) {
                            notificationListScrollY = Math.max(0f, Math.min(maxScroll, notificationListScrollY + dy * 1920f / Math.max(1f, getHeight())));
                            notificationListProgress = 1f;
                            notificationListLastY = event.getY();
                            notificationListStartY = event.getY();
                        } else {
                            float delta = Math.max(0f, totalDelta);
                            float dismissDistance = Math.max(1f, getHeight() * 0.55f);
                            notificationListProgress = Math.max(0f, Math.min(1f, 1f - delta / dismissDistance));
                            notificationListLastY = event.getY();
                        }
                        invalidate();
                        return true;
                    }
                    if (showingNotificationDetails && notificationDetailsDragging) {
                        float totalDelta = event.getY() - notificationDetailsStartY;
                        float dy = notificationDetailsLastY - event.getY();
                        float maxScroll = LockScreenRenderer.settingsMaxScroll(getContext());
                        if (!notificationDetailsHeaderDragging && (notificationDetailsScrollY > 0f || totalDelta < 0f)) {
                            notificationDetailsScrollY = Math.max(0f, Math.min(maxScroll, notificationDetailsScrollY + dy * 1920f / Math.max(1f, getHeight())));
                            notificationDetailsProgress = 1f;
                            notificationDetailsLastY = event.getY();
                            notificationDetailsStartY = event.getY();
                        } else {
                            float delta = Math.max(0f, totalDelta);
                            float dismissDistance = Math.max(1f, getHeight() * 0.55f);
                            notificationDetailsProgress = Math.max(0f, Math.min(1f, 1f - delta / dismissDistance));
                            notificationDetailsLastY = event.getY();
                        }
                        invalidate();
                        return true;
                    }
                    if (showingDetails && detailsDragging) {
                        float delta = Math.max(0f, event.getY() - detailsStartY);
                        float dismissDistance = Math.max(1f, getHeight() * 0.55f);
                        detailsProgress = Math.max(0f, Math.min(1f, 1f - delta / dismissDistance));
                        invalidate();
                        return true;
                    }
                    if (mainWidgetDragging) {
                        updateMainWidgetDrag(event);
                        return true;
                    }
                    if (shortcutDrag != 0) {
                        updateShortcutProgress(event.getX());
                        return true;
                    }
                    if (dragging) {
                        updateProgress(event.getX(), slider);
                        return true;
                    }
                    if (fullWidgetDragging) {
                        updateFullWidgetSwipe(event);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (shortcutDrag != 0) {
                        int target = shortcutDrag;
                        float deltaX = event.getX() - shortcutStartX;
                        float progress = shortcutProgress;
                        shortcutDrag = 0;
                        shortcutProgress = 0f;
                        invalidate();
                        if (event.getActionMasked() == MotionEvent.ACTION_UP
                            && (Math.abs(deltaX) < getWidth() * 0.10f || (progress >= 0.48f && Math.signum(deltaX) == Math.signum(target)))) {
                            if (target < 0) launchDialerShortcut();
                            else launchCameraShortcut();
                        }
                        return true;
                    }
                    if (showingNotificationList && notificationListDragging) {
                        notificationListDragging = false;
                        boolean headerDrag = notificationListHeaderDragging;
                        notificationListHeaderDragging = false;
                        if (!headerDrag && notificationListScrollY > 0f) {
                            notificationListTargetOpen = true;
                            notificationListProgress = 1f;
                            invalidate();
                            return true;
                        }
                        float delta = Math.max(0f, event.getY() - notificationListStartY);
                        notificationListTargetOpen = event.getActionMasked() != MotionEvent.ACTION_UP || delta < getHeight() * 0.11f;
                        invalidate();
                        return true;
                    }
                    if (showingNotificationDetails && notificationDetailsDragging) {
                        notificationDetailsDragging = false;
                        boolean headerDrag = notificationDetailsHeaderDragging;
                        notificationDetailsHeaderDragging = false;
                        if (!headerDrag && notificationDetailsScrollY > 0f) {
                            notificationDetailsTargetOpen = true;
                            notificationDetailsProgress = 1f;
                            invalidate();
                            return true;
                        }
                        float delta = Math.max(0f, event.getY() - notificationDetailsStartY);
                        notificationDetailsTargetOpen = event.getActionMasked() != MotionEvent.ACTION_UP || delta < getHeight() * 0.11f;
                        invalidate();
                        return true;
                    }
                    if (showingDetails && detailsDragging) {
                        detailsDragging = false;
                        float delta = Math.max(0f, event.getY() - detailsStartY);
                        detailsTargetOpen = event.getActionMasked() != MotionEvent.ACTION_UP || delta < getHeight() * 0.11f;
                        invalidate();
                        return true;
                    }
                    if (mainWidgetDragging) {
                        finishMainWidgetDrag(event);
                        return true;
                    }
                    if (dragging) {
                        dragging = false;
                        updateProgress(event.getX(), slider);
                        if (swipeProgress >= 0.72f && event.getActionMasked() == MotionEvent.ACTION_UP) {
                            requestSystemUnlock();
                        } else {
                            swipeProgress = 0f;
                            invalidate();
                        }
                    } else if (fullWidgetDragging) {
                        finishFullWidgetSwipe(event);
                    } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                        performClick();
                    }
                    return true;
                default:
                    return true;
            }
        }

        private void updateProgress(float x, RectF slider) {
            float knobRadius = slider.height() * 0.49f;
            float min = slider.left + knobRadius;
            float max = slider.right - knobRadius;
            if (max <= min) {
                swipeProgress = 0f;
                return;
            }
            swipeProgress = Math.max(0f, Math.min(1f, (x - min) / (max - min)));
            invalidate();
        }

        private void updateShortcutProgress(float x) {
            float signed = shortcutDrag < 0 ? shortcutStartX - x : x - shortcutStartX;
            shortcutProgress = Math.max(0f, Math.min(1f, signed / Math.max(1f, getWidth() * 0.24f)));
            invalidate();
        }

        private void updateMainWidgetDrag(MotionEvent event) {
            float dx = event.getX() - mainWidgetStartX;
            float dy = event.getY() - mainWidgetStartY;
            if (!mainWidgetScrolling && Math.abs(dy) < Math.max(18f, Math.abs(dx) * 0.9f)) return;
            mainWidgetScrolling = true;
            float deltaBase = (mainWidgetLastY - event.getY()) * 1920f / Math.max(1f, getHeight());
            float maxScroll = LockScreenRenderer.mainWidgetMaxScroll(getContext());
            mainWidgetScrollY = Math.max(0f, Math.min(maxScroll, mainWidgetScrollY + deltaBase));
            mainWidgetLastY = event.getY();
            LockScreenDashboardActivity.this.layoutHostedWidgets();
            invalidate();
        }

        private void finishMainWidgetDrag(MotionEvent event) {
            boolean wasScrolling = mainWidgetScrolling;
            float dx = event.getX() - mainWidgetStartX;
            float dy = event.getY() - mainWidgetStartY;
            mainWidgetDragging = false;
            mainWidgetScrolling = false;
            mainWidgetScrollY = Math.max(0f, Math.min(LockScreenRenderer.mainWidgetMaxScroll(getContext()), mainWidgetScrollY));
            if (event.getActionMasked() == MotionEvent.ACTION_UP && !wasScrolling && Math.hypot(dx, dy) < 28f) {
                float baseX = toBaseX(event.getX());
                float baseY = toBaseY(event.getY());
                float scrolledY = baseY + mainWidgetScrollY;
                if (LockScreenRenderer.snapshot1TabBaseRect().contains(baseX, scrolledY)) {
                    snapshot.selectSlot(1, System.currentTimeMillis());
                    LockScreenDashboardActivity.this.layoutHostedWidgets();
                    invalidate();
                    return;
                }
                if (LockScreenRenderer.snapshot2TabBaseRect().contains(baseX, scrolledY)) {
                    snapshot.selectSlot(2, System.currentTimeMillis());
                    LockScreenDashboardActivity.this.layoutHostedWidgets();
                    invalidate();
                    return;
                }
                if (LockScreenRenderer.detailBaseRect().contains(baseX, scrolledY)) {
                    showingDetails = true;
                    detailsTargetOpen = true;
                    detailsProgress = 0f;
                    LockScreenDashboardActivity.this.layoutHostedWidgets();
                    invalidate();
                    return;
                }
                LockScreenRenderer.SheetAction action = LockScreenRenderer.mainWidgetActionAt(getContext(), baseX, baseY, mainWidgetScrollY);
                if (action != null) handleSheetAction(action);
            }
            LockScreenDashboardActivity.this.layoutHostedWidgets();
            invalidate();
        }

        private boolean handleHostedOverlayTap(float rawX, float rawY) {
            int[] location = new int[2];
            getLocationOnScreen(location);
            float localX = rawX - location[0];
            float localY = rawY - location[1];
            if (localX < 0f || localY < 0f || localX > getWidth() || localY > getHeight()) return false;
            float baseX = toBaseX(localX);
            float baseY = toBaseY(localY);
            LockScreenRenderer.SheetAction action = LockScreenRenderer.mainWidgetActionAt(getContext(), baseX, baseY, mainWidgetScrollY);
            if (action == null) return false;
            handleSheetAction(action);
            return true;
        }

        private void updateFullWidgetSwipe(MotionEvent event) {
            float dx = event.getX() - fullWidgetStartX;
            float dy = event.getY() - fullWidgetStartY;
            if (Math.abs(dx) < 18f && Math.abs(dx) < Math.abs(dy)) return;
            float width = Math.max(1f, getWidth());
            if (fullWidgetPage) {
                fullWidgetProgress = Math.max(0f, Math.min(1f, 1f + Math.min(0f, dx) / width));
            } else {
                fullWidgetProgress = Math.max(0f, Math.min(1f, Math.max(0f, dx) / width));
            }
            invalidate();
        }

        private void finishFullWidgetSwipe(MotionEvent event) {
            float dx = event.getX() - fullWidgetStartX;
            float dy = event.getY() - fullWidgetStartY;
            float threshold = Math.max(1f, getWidth() * 0.18f);
            boolean horizontal = Math.abs(dx) > Math.max(Math.abs(dy) * 1.25f, 28f);
            if (event.getActionMasked() != MotionEvent.ACTION_UP || !horizontal) {
                fullWidgetPage = fullWidgetPage && fullWidgetProgress > 0.5f;
            } else if (fullWidgetPage) {
                int count = Math.max(1, LockScreenRenderer.fullWidgetCount(getContext()));
                if (dx < -threshold) {
                    fullWidgetPage = false;
                    fullWidgetProgress = Math.min(fullWidgetProgress, 0.45f);
                } else if (dx > threshold && count > 1) {
                    fullWidgetIndex = Math.min(count - 1, fullWidgetIndex + 1);
                    fullWidgetPage = true;
                    fullWidgetProgress = 1f;
                } else {
                    fullWidgetPage = dx > -threshold;
                }
            } else {
                fullWidgetPage = dx > threshold;
            }
            if (!fullWidgetPage) fullWidgetIndex = 0;
            fullWidgetDragging = false;
            LockScreenDashboardActivity.this.layoutHostedWidgets();
            invalidate();
        }

        private void refreshMediaWidgetsSoon() {
            invalidate();
            postDelayed(() -> {
                invalidate();
            }, 650L);
        }

        private void handleSheetAction(LockScreenRenderer.SheetAction action) {
            if (action == null) return;
            if (LockScreenRenderer.SHEET_ACTION_THEME.equals(action.type)) {
                LockScreenRenderer.setThemeMode(getContext(), action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_WIDGET_SEARCH.equals(action.type)) {
                showWidgetSearchDialog();
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_WIDGET_VIEW.equals(action.type)) {
                LockScreenRenderer.setWidgetViewMode(getContext(), action.value);
                notificationDetailsScrollY = 0f;
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_WIDGET.equals(action.type)) {
                boolean enabledBefore = LockScreenRenderer.isDynamicWidgetEnabled(getContext(), action.value);
                boolean readyBefore = LockScreenRenderer.isHostedWidgetReady(getContext(), action.value);
                if (enabledBefore && !readyBefore && LockScreenRenderer.hostedWidgetSpec(getContext(), action.value) != null) {
                    requestHostedWidgetBind(action.value);
                    invalidate();
                    return;
                }
                LockScreenRenderer.toggleDynamicWidget(getContext(), action.value);
                boolean enabled = LockScreenRenderer.isDynamicWidgetEnabled(getContext(), action.value);
                if (enabled) requestHostedWidgetBind(action.value);
                else syncHostedWidgets(false);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_FULL_WIDGET.equals(action.type)) {
                fullWidgetIndex = Math.max(0, action.index);
                fullWidgetPage = true;
                fullWidgetProgress = 0f;
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_PREVIOUS.equals(action.type)) {
                dispatchMediaControl(action.value, LockScreenRenderer.SHEET_ACTION_MEDIA_PREVIOUS);
                refreshMediaWidgetsSoon();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_PLAY_PAUSE.equals(action.type)) {
                dispatchMediaControl(action.value, LockScreenRenderer.SHEET_ACTION_MEDIA_PLAY_PAUSE);
                refreshMediaWidgetsSoon();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_NEXT.equals(action.type)) {
                dispatchMediaControl(action.value, LockScreenRenderer.SHEET_ACTION_MEDIA_NEXT);
                refreshMediaWidgetsSoon();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_FAVORITE.equals(action.type)) {
                LockScreenDashboardActivity.this.dispatchMediaFavoriteReal(action.value);
                LockScreenRenderer.toggleMediaFavorite(getContext(), action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_TRANSCRIPT.equals(action.type)) {
                showMediaTranscriptDialog(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_REPEAT.equals(action.type)) {
                dispatchMediaRepeat(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_MUTE.equals(action.type)) {
                toggleMusicMute();
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_DEVICE.equals(action.type)) {
                showMediaDeviceDialog(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_QUEUE.equals(action.type)) {
                showMediaHistoryDialog(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_MEDIA_SEEK.equals(action.type)) {
                dispatchMediaSeek(action.value, action.index / 1000f);
                refreshMediaWidgetsSoon();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_NOTIFICATION.equals(action.type)) {
                LockScreenRenderer.toggleReplyableNotification(getContext(), action.value);
                layoutHostedWidgets();
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_REPLY.equals(action.type)) {
                showNotificationReplyDialog(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_READ.equals(action.type)) {
                dismissNotification(action.value);
                invalidate();
                return;
            }
            if (LockScreenRenderer.SHEET_ACTION_OPEN.equals(action.type)) {
                openNotification(action.value);
                invalidate();
            }
        }

        private float toBaseX(float x) {
            return x * 1080f / Math.max(1f, getWidth());
        }

        private float toBaseY(float y) {
            return y * 1920f / Math.max(1f, getHeight());
        }

        private RectF scaledSliderRect() {
            return scaledRect(LockScreenRenderer.sliderBaseRect());
        }

        private RectF scaledRect(RectF base) {
            float sx = getWidth() / 1080f;
            float sy = getHeight() / 1920f;
            return new RectF(base.left * sx, base.top * sy, base.right * sx, base.bottom * sy);
        }
    }
}
