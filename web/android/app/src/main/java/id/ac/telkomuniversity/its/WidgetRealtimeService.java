package id.ac.telkomuniversity.its;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class WidgetRealtimeService extends Service {
    private static final String CHANNEL_ID = "its_widget_realtime";
    private static final int NOTIFICATION_ID = 7201;
    private static final String FIREBASE_STREAM_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_USER_LAT = "user_lat";
    private static final String PREF_USER_LNG = "user_lng";
    private static final String PREF_USER_TIME = "user_time";
    private static final long RECONNECT_DELAY_MS = 3_000L;

    private volatile boolean running;
    private Thread listenerThread;
    private HttpURLConnection activeConnection;
    private volatile String lastEventFingerprint = "";
    private LocationManager locationManager;
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
        Intent intent = new Intent(context, WidgetRealtimeService.class);
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
        running = true;
        listenerThread = new Thread(this::listenLoop, "its-widget-realtime");
        listenerThread.start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopLocationUpdates();
        closeConnection();
        if (listenerThread != null) {
            listenerThread.interrupt();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void listenLoop() {
        while (running) {
            HttpURLConnection connection = null;
            try {
                connection = openStreamConnection();
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

    private HttpURLConnection openStreamConnection() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(FIREBASE_STREAM_URL + "?ts=" + System.currentTimeMillis()).openConnection();
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
        chartUpdate.setAction(android.appwidget.AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        sendBroadcast(chartUpdate);

        Intent mapsUpdate = new Intent(this, MapsWidgetProvider.class);
        mapsUpdate.setAction(android.appwidget.AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        sendBroadcast(mapsUpdate);
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
}
