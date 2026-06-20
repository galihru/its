package id.ac.telkomuniversity.its;

import android.app.Activity;
import android.app.KeyguardManager;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.RectF;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LockScreenDashboardActivity extends Activity {
    private static final String DETECTOR_URL = "file:///android_asset/public/lockscreen-detector.html?native=1";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private DashboardView dashboardView;
    private WebView detectorWebView;
    private volatile boolean destroyed;

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
        WidgetRealtimeService.start(this);
        dashboardView = new DashboardView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(dashboardView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        detectorWebView = createDetectorWebView();
        FrameLayout.LayoutParams detectorLayout = new FrameLayout.LayoutParams(2, 2);
        detectorLayout.leftMargin = 1;
        detectorLayout.topMargin = 1;
        root.addView(detectorWebView, detectorLayout);
        setContentView(root);
        loadSnapshotAsync();
    }

    @Override
    protected void onResume() {
        super.onResume();
        destroyed = false;
        hideSystemBars();
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
            dashboardView.postDelayed(refreshRunnable, 1_000L);
        }
    }

    @Override
    protected void onPause() {
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (dashboardView != null) {
            dashboardView.removeCallbacks(refreshRunnable);
        }
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
        webView.setAlpha(0.01f);
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        webView.addJavascriptInterface(new LockScreenDetectionBridge(), "LockScreenBridge");
        webView.loadUrl(DETECTOR_URL);
        return webView;
    }

    private final class LockScreenDetectionBridge {
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
                            item.optString("label", "Object"),
                            item.optDouble("confidence", 0d),
                            item.optDouble("x", 0d),
                            item.optDouble("y", 0d),
                            item.optDouble("width", 0d),
                            item.optDouble("height", 0d)
                        ));
                    }
                }
                runOnUiThread(() -> {
                    if (dashboardView != null) {
                        dashboardView.updateDetections(slot, frameWidth, frameHeight, detections);
                    }
                });
            } catch (Exception ignored) {
            }
        }
    }

    private void configureLockScreenWindow() {
        Window window = getWindow();
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
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
                        finishAfterTransition();
                    }
                });
                return;
            }
        }
        finish();
    }

    private final class DashboardView extends View {
        private LockScreenRenderer.Snapshot snapshot = LockScreenRenderer.Snapshot.fallback();
        private boolean dragging;
        private boolean showingDetails;
        private float swipeProgress;

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
                next.updateDetections(
                    1,
                    this.snapshot.frameWidthForSlot(1),
                    this.snapshot.frameHeightForSlot(1),
                    this.snapshot.detectionsForSlot(1)
                );
            }
            if (this.snapshot.image2.equals(next.image2)) {
                next.updateDetections(
                    2,
                    this.snapshot.frameWidthForSlot(2),
                    this.snapshot.frameHeightForSlot(2),
                    this.snapshot.detectionsForSlot(2)
                );
            }
            this.snapshot = next;
            invalidate();
        }

        void updateDetections(int slot, int frameWidth, int frameHeight, List<LockScreenRenderer.Detection> detections) {
            snapshot.updateDetections(slot, frameWidth, frameHeight, detections);
            invalidate();
        }

        boolean hideDetails() {
            if (!showingDetails) return false;
            showingDetails = false;
            invalidate();
            return true;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            LockScreenRenderer.draw(
                getContext(),
                canvas,
                snapshot,
                Math.max(1, getWidth()),
                Math.max(1, getHeight()),
                System.currentTimeMillis(),
                swipeProgress,
                true
            );
            if (showingDetails) {
                LockScreenRenderer.drawDetectionDetails(canvas, snapshot, Math.max(1, getWidth()), Math.max(1, getHeight()));
            }
            postInvalidateOnAnimation();
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            RectF slider = scaledSliderRect();
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (showingDetails) {
                        if (scaledRect(LockScreenRenderer.detailCloseBaseRect()).contains(event.getX(), event.getY())) {
                            showingDetails = false;
                            invalidate();
                        }
                        return true;
                    }
                    if (scaledRect(LockScreenRenderer.detailBaseRect()).contains(event.getX(), event.getY())) {
                        showingDetails = true;
                        invalidate();
                        return true;
                    }
                    if (slider.contains(event.getX(), event.getY())) {
                        dragging = true;
                        updateProgress(event.getX(), slider);
                        return true;
                    }
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (dragging) {
                        updateProgress(event.getX(), slider);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) {
                        dragging = false;
                        updateProgress(event.getX(), slider);
                        if (swipeProgress >= 0.72f && event.getActionMasked() == MotionEvent.ACTION_UP) {
                            requestSystemUnlock();
                        } else {
                            swipeProgress = 0f;
                            invalidate();
                        }
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
