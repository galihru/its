package id.ac.telkomuniversity.its;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.KeyguardManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class WidgetRealtimeService extends Service {
    private static final String TAG = "ITS-WidgetService";
    private static final String ACTION_LOCK_SCREEN_CHANGED = "id.ac.telkomuniversity.its.action.LOCK_SCREEN_CHANGED";
    private static final String EXTRA_SKIP_LOCK_SCREEN_LAUNCH = "id.ac.telkomuniversity.its.extra.SKIP_LOCK_SCREEN_LAUNCH";
    private static final String CHANNEL_ID = "its_widget_realtime";
    private static final String LOCK_CHANNEL_ID = "its_lock_screen_ai";
    private static final int NOTIFICATION_ID = 7201;
    private static final int LOCK_NOTIFICATION_ID = 7202;
    private static final String[] FIREBASE_STREAM_URLS = new String[] {
        "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json",
        "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json"
    };
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_USER_LAT = "user_lat";
    private static final String PREF_USER_LNG = "user_lng";
    private static final String PREF_USER_TIME = "user_time";
    private static final long RECONNECT_DELAY_MS = 3_000L;
    private static final long LOCK_SCREEN_LAUNCH_COOLDOWN_MS = 2_000L;

    private volatile boolean running;
    private final List<Thread> listenerThreads = new ArrayList<>();
    private HttpURLConnection activeConnection;
    private volatile String lastEventFingerprint = "";
    private LocationManager locationManager;
    private BroadcastReceiver lockScreenReceiver;
    private long lastLockScreenLaunchAt;
    private final Handler lockScreenHandler = new Handler(Looper.getMainLooper());
    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            saveUserLocation(location);
            broadcastWidgetRefresh();
        }

        @Override
        public void onProviderEnabled(String provider) {
        }

        @Override
        public void onProviderDisabled(String provider) {
        }

        @Override
        public void onStatusChanged(String provider, int status, android.os.Bundle extras) {
        }
    };

    public static void start(Context context) {
        start(context, false);
    }

    static void startFromLockScreen(Context context) {
        start(context, true);
    }

    private static void start(Context context, boolean skipLockScreenLaunch) {
        Intent intent = new Intent(context, WidgetRealtimeService.class);
        intent.putExtra(EXTRA_SKIP_LOCK_SCREEN_LAUNCH, skipLockScreenLaunch);
		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				context.startForegroundService(intent);
			} else {
				context.startService(intent);
			}
		} catch (RuntimeException ignored) {
			// Ignore background-service start restrictions so the app stays open.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startLocationUpdates();
        syncLockScreenMonitor();
        running = true;
        for (String streamUrl : FIREBASE_STREAM_URLS) {
            Thread listenerThread = new Thread(() -> listenLoop(streamUrl), "its-widget-realtime");
            listenerThread.start();
            listenerThreads.add(listenerThread);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        syncLockScreenMonitor();
        if (intent == null || !intent.getBooleanExtra(EXTRA_SKIP_LOCK_SCREEN_LAUNCH, false)) {
            scheduleLockScreenLaunches();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopLocationUpdates();
        stopLockScreenMonitor();
        lockScreenHandler.removeCallbacksAndMessages(null);
        closeConnection();
        for (Thread listenerThread : listenerThreads) {
            if (listenerThread != null) {
                listenerThread.interrupt();
            }
        }
        listenerThreads.clear();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void listenLoop(String streamUrl) {
        while (running) {
            HttpURLConnection connection = null;
            try {
                connection = openStreamConnection(streamUrl);
                activeConnection = connection;
                drainStream(connection);
            } catch (Exception err) {
                if (running) {
                    broadcastWidgetRefresh();
                    try {
                        Thread.sleep(RECONNECT_DELAY_MS);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
                activeConnection = null;
            }
        }
    }

    private HttpURLConnection openStreamConnection(String streamUrl) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(streamUrl + "?ts=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(0);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "text/event-stream");
        connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setRequestProperty("Connection", "keep-alive");
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("Firebase stream HTTP " + code);
        }
        return connection;
    }

    private void drainStream(HttpURLConnection connection) throws Exception {
        try (InputStream inputStream = connection.getInputStream();
             BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String currentEvent = null;
            StringBuilder data = new StringBuilder();
            String line;
            while (running && (line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    if (data.length() > 0) {
                        handleEvent(currentEvent, data.toString());
                    }
                    currentEvent = null;
                    data.setLength(0);
                    continue;
                }
                if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    if (data.length() > 0) {
                        data.append('\n');
                    }
                    data.append(line.substring(5).trim());
                }
            }
        }
    }

    private void handleEvent(String event, String data) {
        String fingerprint = event + "|" + data;
        if (fingerprint.equals(lastEventFingerprint)) {
            return;
        }
        lastEventFingerprint = fingerprint;
        broadcastWidgetRefresh();
    }

    private void broadcastWidgetRefresh() {
        Intent chartUpdate = new Intent(this, ChartWidgetProvider.class);
        chartUpdate.setAction("id.ac.telkomuniversity.its.action.REFRESH_WIDGET");
        sendBroadcast(chartUpdate);

        Intent mapsUpdate = new Intent(this, MapsWidgetProvider.class);
        mapsUpdate.setAction("id.ac.telkomuniversity.its.action.MAPS_REFRESH_WIDGET");
        sendBroadcast(mapsUpdate);

        Intent trafficUpdate = new Intent(this, TrafficDetectionWidgetProvider.class);
        trafficUpdate.setAction("id.ac.telkomuniversity.its.action.TRAFFIC_DETECTION_REFRESH");
        sendBroadcast(trafficUpdate);

        Intent alertFullDataUpdate = new Intent(this, AlertFullDataWidgetProvider.class);
        alertFullDataUpdate.setAction("id.ac.telkomuniversity.its.action.ALERT_FULL_DATA_REFRESH");
        sendBroadcast(alertFullDataUpdate);
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            return;
        }

        try {
            Location lastKnown = null;
            for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER }) {
                Location candidate = locationManager.getLastKnownLocation(provider);
                if (candidate != null && (lastKnown == null || candidate.getTime() > lastKnown.getTime())) {
                    lastKnown = candidate;
                }
            }
            if (lastKnown != null) {
                saveUserLocation(lastKnown);
            }
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5_000L, 5f, locationListener, Looper.getMainLooper());
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5_000L, 5f, locationListener, Looper.getMainLooper());
        } catch (SecurityException ignored) {
        }
    }

    private void stopLocationUpdates() {
        if (locationManager == null) {
            return;
        }
        try {
            locationManager.removeUpdates(locationListener);
        } catch (SecurityException ignored) {
        }
    }

    private void saveUserLocation(Location location) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(PREF_USER_LAT, Double.doubleToRawLongBits(location.getLatitude()))
            .putLong(PREF_USER_LNG, Double.doubleToRawLongBits(location.getLongitude()))
            .putLong(PREF_USER_TIME, System.currentTimeMillis())
            .commit();
    }

    private void closeConnection() {
        HttpURLConnection connection = activeConnection;
        if (connection != null) {
            connection.disconnect();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "ITS widget realtime",
            NotificationManager.IMPORTANCE_LOW
        );
        manager.createNotificationChannel(channel);

        NotificationChannel lockChannel = new NotificationChannel(
            LOCK_CHANNEL_ID,
            "AI Layar Kunci ITS",
            NotificationManager.IMPORTANCE_HIGH
        );
        lockChannel.setDescription("Menampilkan panel AI saat layar Android terkunci");
        lockChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(lockChannel);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ITS widget berjalan")
            .setContentText("Mendengar perubahan RTDB untuk update widget")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void startLockScreenMonitor() {
        if (lockScreenReceiver != null) return;
        lockScreenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent == null ? "" : intent.getAction();
                if (Intent.ACTION_USER_PRESENT.equals(action)) {
                    cancelLockScreenNotification();
                    return;
                }
                if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                    lastLockScreenLaunchAt = 0L;
                    lockScreenHandler.removeCallbacksAndMessages(null);
                    return;
                }
                if (Intent.ACTION_SCREEN_ON.equals(action)) {
                    Log.i(TAG, "Screen ON diterima, cek panel lock screen");
                    scheduleLockScreenLaunches();
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(lockScreenReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(lockScreenReceiver, filter);
        }
    }

    public static void setLockScreenMonitoringEnabled(Context context, boolean enabled) {
        LockScreenPreferences.setEnabled(context, enabled);
        Intent intent = new Intent(context, WidgetRealtimeService.class);
        intent.setAction(ACTION_LOCK_SCREEN_CHANGED);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException ignored) {
        }
    }

    private void syncLockScreenMonitor() {
        if (LockScreenPreferences.isEnabled(this)) {
            startLockScreenMonitor();
        } else {
            stopLockScreenMonitor();
            cancelLockScreenNotification();
        }
    }

    private void stopLockScreenMonitor() {
        if (lockScreenReceiver == null) return;
        try {
            unregisterReceiver(lockScreenReceiver);
        } catch (RuntimeException ignored) {
        }
        lockScreenReceiver = null;
    }

    private void scheduleLockScreenLaunches() {
        if (!LockScreenPreferences.isEnabled(this)) return;
        lockScreenHandler.removeCallbacksAndMessages(null);
        long[] delays = new long[] { 0L, 120L, 360L, 760L, 1_300L };
        for (long delay : delays) {
            if (delay <= 0L) {
                showLockScreenIfLocked();
            } else {
                lockScreenHandler.postDelayed(this::showLockScreenIfLocked, delay);
            }
        }
    }

    private void showLockScreenIfLocked() {
        if (!LockScreenPreferences.isEnabled(this)) {
            Log.i(TAG, "Panel lock screen dilewati: fitur belum aktif");
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastLockScreenLaunchAt < LOCK_SCREEN_LAUNCH_COOLDOWN_MS) {
            Log.i(TAG, "Panel lock screen dilewati: cooldown");
            return;
        }
        KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguardManager == null || !keyguardManager.isKeyguardLocked()) {
            Log.i(TAG, "Panel lock screen dilewati: perangkat tidak sedang terkunci");
            return;
        }
        lastLockScreenLaunchAt = now;

        Intent intent = new Intent(this, LockScreenDashboardActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        try {
            startActivity(intent);
            Log.i(TAG, "Panel lock screen dibuka langsung");
        } catch (RuntimeException err) {
            Log.w(TAG, "Start activity lock screen diblokir, menunggu full-screen intent", err);
            showLockScreenNotification(intent);
        }
    }

    private void showLockScreenNotification(Intent intent) {
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            LOCK_NOTIFICATION_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification notification = new NotificationCompat.Builder(this, LOCK_CHANNEL_ID)
            .setContentTitle("AI Layar Kunci ITS")
            .setContentText("Membuka panel realtime AI di layar terkunci")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingIntent, true)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(LOCK_NOTIFICATION_ID, notification);
        }
    }

    private void cancelLockScreenNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(LOCK_NOTIFICATION_ID);
        }
    }
}
