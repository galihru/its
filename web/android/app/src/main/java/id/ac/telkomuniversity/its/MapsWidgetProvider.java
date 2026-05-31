package id.ac.telkomuniversity.its;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver.PendingResult;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.Matrix;
import android.graphics.Shader;
import android.net.Uri;
import android.text.TextUtils;
import android.widget.RemoteViews;
import android.view.View;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MapsWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_REFRESH_WIDGET = "id.ac.telkomuniversity.its.action.MAPS_REFRESH_WIDGET";
    private static final String ACTION_SET_LOCATION = "id.ac.telkomuniversity.its.action.MAPS_SET_LOCATION";
    private static final String ACTION_SET_MODE = "id.ac.telkomuniversity.its.action.MAPS_SET_MODE";
    private static final String ACTION_ZOOM_TOGGLE = "id.ac.telkomuniversity.its.action.MAPS_ZOOM_TOGGLE";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_LOCATION = "maps_location";
    private static final String PREF_MODE = "maps_mode";
    private static final String PREF_ZOOM = "maps_zoom";
    private static final String DEFAULT_LOCATION = "raspi";
    private static final String DEFAULT_MODE = "street";
    private static final int DEFAULT_ZOOM = 17;
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DEVICES_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String STATE_SNAPSHOT_URL = "https://itstelkom.web.app/data/its-state.json";
    private static final long REFRESH_INTERVAL_MS = 15_000L;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH_WIDGET.equals(action) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            final PendingResult result = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    refreshAllWidgets(context);
                    scheduleRefresh(context);
                } finally {
                    result.finish();
                }
            });
            return;
        }

        if (ACTION_SET_LOCATION.equals(action) || ACTION_SET_MODE.equals(action) || ACTION_ZOOM_TOGGLE.equals(action)) {
            final PendingResult result = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    handleSelectionAction(context, intent);
                } finally {
                    refreshAllWidgets(context);
                    result.finish();
                }
            });
            return;
        }

        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        startRealtimeServiceSafely(context);
        refreshAllWidgetsAsync(context);
    }

    @Override
    public void onEnabled(Context context) {
        startRealtimeServiceSafely(context);
        scheduleRefresh(context);
        refreshAllWidgetsAsync(context);
    }

    @Override
    public void onDisabled(Context context) {
        cancelRefresh(context);
    }

    private void handleSelectionAction(Context context, Intent intent) {
        WidgetState state = readWidgetState(context);
        String action = intent.getAction();
        if (ACTION_SET_LOCATION.equals(action)) {
            state.location = normalizeLocation(intent.getStringExtra("value"));
            writeWidgetState(context, state);
        } else if (ACTION_SET_MODE.equals(action)) {
            state.mode = normalizeMode(intent.getStringExtra("value"));
            writeWidgetState(context, state);
        } else if (ACTION_ZOOM_TOGGLE.equals(action)) {
            state.zoom = state.zoom > DEFAULT_ZOOM ? DEFAULT_ZOOM : clampZoom(DEFAULT_ZOOM + 1);
            writeWidgetState(context, state);
        }
    }

    private void refreshAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, MapsWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(provider);
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        WidgetSnapshot snapshot;
        try {
            snapshot = fetchSnapshot(context);
        } catch (Exception err) {
            snapshot = WidgetSnapshot.fallback();
        }

        WidgetState state = readWidgetState(context);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId, snapshot, state);
        }
    }

    private void refreshAllWidgetsAsync(Context context) {
        final PendingResult result = goAsync();
        EXECUTOR.execute(() -> {
            try {
                refreshAllWidgets(context);
            } finally {
                result.finish();
            }
        });
    }

    private void startRealtimeServiceSafely(Context context) {
        try {
            WidgetRealtimeService.start(context);
        } catch (RuntimeException err) {
            System.out.println("[ITS] Widget realtime service start skipped: " + err.getMessage());
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, WidgetSnapshot snapshot, WidgetState state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_maps);

        views.setTextViewText(R.id.widget_maps_title, "Peta");
        views.setTextViewText(R.id.widget_maps_location_user, "Lokasi saya");
        views.setTextViewText(R.id.widget_maps_location_raspi, "Raspberry Pi");
        views.setTextViewText(R.id.widget_maps_mode_2d, "2D");
        views.setTextViewText(R.id.widget_maps_mode_3d, "3D");
        views.setTextViewText(R.id.widget_maps_mode_sat, "Sat");
        views.setTextViewText(R.id.widget_maps_zoom_toggle, state.zoom > DEFAULT_ZOOM ? "-" : "+");

        int activeBlue = ContextCompat.getColor(context, R.color.its_widget_blue);
        int activeGreen = ContextCompat.getColor(context, R.color.its_widget_green);
        int muted = ContextCompat.getColor(context, R.color.its_widget_muted);
        views.setTextColor(R.id.widget_maps_location_user, "user".equals(state.location) ? activeBlue : muted);
        views.setTextColor(R.id.widget_maps_location_raspi, "raspi".equals(state.location) ? activeGreen : muted);
        views.setTextColor(R.id.widget_maps_mode_2d, "street".equals(state.mode) ? activeBlue : muted);
        views.setTextColor(R.id.widget_maps_mode_3d, "3d".equals(state.mode) ? activeBlue : muted);
        views.setTextColor(R.id.widget_maps_mode_sat, "satellite".equals(state.mode) ? activeBlue : muted);
        views.setTextColor(R.id.widget_maps_zoom_toggle, muted);

        views.setOnClickPendingIntent(R.id.widget_maps_root, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_preview, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_hint, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_location_user, openActionIntent(context, ACTION_SET_LOCATION, "value", "user", 4102));
        views.setOnClickPendingIntent(R.id.widget_maps_location_raspi, openActionIntent(context, ACTION_SET_LOCATION, "value", "raspi", 4103));
        views.setOnClickPendingIntent(R.id.widget_maps_mode_2d, openActionIntent(context, ACTION_SET_MODE, "value", "street", 4104));
        views.setOnClickPendingIntent(R.id.widget_maps_mode_3d, openActionIntent(context, ACTION_SET_MODE, "value", "3d", 4105));
        views.setOnClickPendingIntent(R.id.widget_maps_mode_sat, openActionIntent(context, ACTION_SET_MODE, "value", "satellite", 4106));
        views.setOnClickPendingIntent(R.id.widget_maps_zoom_toggle, openActionIntent(context, ACTION_ZOOM_TOGGLE, null, null, 4107));

        try {
            Bitmap preview = buildPreviewBitmap(context, snapshot, state);
            if (preview != null) {
                views.setImageViewBitmap(R.id.widget_maps_preview, preview);
                views.setViewVisibility(R.id.widget_maps_hint, View.GONE);
            }
        } catch (Throwable ignored) {
            views.setImageViewResource(R.id.widget_maps_preview, R.drawable.widget_panel);
            views.setViewVisibility(R.id.widget_maps_hint, View.VISIBLE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private PendingIntent openActionIntent(Context context, String action, String extraKey, String extraValue, int requestCode) {
        Intent intent = new Intent(context, MapsWidgetProvider.class);
        intent.setAction(action);
        if (!TextUtils.isEmpty(extraKey) && extraValue != null) {
            intent.putExtra(extraKey, extraValue);
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void scheduleRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + REFRESH_INTERVAL_MS,
                refreshPendingIntent(context)
            );
        } catch (SecurityException se) {
            // Devices may require SCHEDULE_EXACT_ALARM; fall back to inexact alarm.
            alarmManager.set(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + REFRESH_INTERVAL_MS,
                refreshPendingIntent(context)
            );
        }
    }

    private void cancelRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        alarmManager.cancel(refreshPendingIntent(context));
    }

    private PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, MapsWidgetProvider.class);
        intent.setAction(ACTION_REFRESH_WIDGET);
        return PendingIntent.getBroadcast(
            context,
            4100,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private WidgetState readWidgetState(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        WidgetState state = new WidgetState();
        state.location = normalizeLocation(prefs.getString(PREF_LOCATION, DEFAULT_LOCATION));
        state.mode = normalizeMode(prefs.getString(PREF_MODE, DEFAULT_MODE));
        state.zoom = clampZoom(prefs.getInt(PREF_ZOOM, DEFAULT_ZOOM));
        return state;
    }

    private void writeWidgetState(Context context, WidgetState state) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_LOCATION, state.location)
            .putString(PREF_MODE, state.mode)
            .putInt(PREF_ZOOM, clampZoom(state.zoom))
            .commit();
    }

    private String normalizeLocation(String value) {
        return "user".equalsIgnoreCase(value) ? "user" : "raspi";
    }

    private String normalizeMode(String value) {
        if ("3d".equalsIgnoreCase(value)) return "3d";
        if ("satellite".equalsIgnoreCase(value) || "sat".equalsIgnoreCase(value)) return "satellite";
        return "street";
    }

    private String modeLabel(String mode) {
        if ("3d".equals(mode)) return "3D";
        if ("satellite".equals(mode)) return "Satelit";
        return "2D";
    }

    private int clampZoom(int zoom) {
        if (zoom < 14) return 14;
        if (zoom > 19) return 19;
        return zoom;
    }

    private WidgetSnapshot fetchSnapshot(Context context) throws Exception {
        WidgetSnapshot cached = readCachedSnapshot(context);
        Exception lastError = null;

        for (String url : new String[] { FIREBASE_DEVICES_URL, STATE_SNAPSHOT_URL }) {
            try {
                String rawJson = fetchJson(url);
                WidgetSnapshot snapshot = WidgetSnapshot.fromJson(rawJson);
                saveCachedSnapshot(context, rawJson);
                return snapshot;
            } catch (Exception err) {
                lastError = err;
            }
        }

        if (cached != null) return cached;
        if (lastError != null) throw lastError;
        return WidgetSnapshot.fallback();
    }

    private String fetchJson(String url) throws Exception {
        String separator = url.contains("?") ? "&" : "?";
        HttpURLConnection connection = (HttpURLConnection) new URL(url + separator + "ts=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setUseCaches(false);

        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            connection.disconnect();
            throw new IllegalStateException("HTTP " + code + " from " + url);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            return body.toString();
        } finally {
            connection.disconnect();
        }
    }

    private WidgetSnapshot readCachedSnapshot(Context context) {
        String raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString("maps_snapshot", "");
        if (TextUtils.isEmpty(raw)) return null;
        try {
            return WidgetSnapshot.fromJson(raw);
        } catch (Exception err) {
            return null;
        }
    }

    private void saveCachedSnapshot(Context context, String rawJson) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString("maps_snapshot", rawJson)
            .apply();
    }

    private Bitmap buildPreviewBitmap(Context context, WidgetSnapshot snapshot, WidgetState state) {
        WidgetLocation raspi = snapshot.deviceLocation();
        WidgetLocation user = resolveUserLocation(context);
        WidgetLocation active = "user".equals(state.location) && user != null ? user : raspi;
        int trafficColor = trafficColorFor(snapshot);
        long pulsePhase = (System.currentTimeMillis() / 650L) % 3L;

        Bitmap tile = fetchBitmapAny(tileUrlsFor(active, state.mode, clampZoom(state.zoom)));
        if (tile == null) {
            return createFallbackBitmap(context, snapshot, state, active, raspi, user);
        }

        int width = 320;
        int height = 180;
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(output);
        canvas.drawColor(0xFF0F172A);

        canvas.save();
        if ("3d".equals(state.mode)) {
            Matrix matrix = new Matrix();
            matrix.setPolyToPoly(
                new float[] { 0, 0, width, 0, 0, height, width, height },
                0,
                new float[] { 28, 28, width - 28, 6, 0, height, width, height - 18 },
                0,
                4
            );
            canvas.concat(matrix);
        }
        canvas.drawBitmap(tile, new Rect(0, 0, tile.getWidth(), tile.getHeight()), new Rect(0, 0, width, height), null);
        canvas.restore();

        if ("3d".equals(state.mode)) {
            Paint tint = new Paint(Paint.ANTI_ALIAS_FLAG);
            tint.setShader(new LinearGradient(0, 0, 0, height, 0x30FFFFFF, 0xC40B1220, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, width, height, tint);
        }

        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setShader(new LinearGradient(0, 0, 0, height, Color.TRANSPARENT, "3d".equals(state.mode) ? 0xD00B1220 : 0xAA000000, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, width, height, shadow);

        drawLocationMarker(canvas, active, active, state.zoom, width, height,
            "user".equals(state.location) ? ContextCompat.getColor(context, R.color.its_widget_blue) : trafficColor,
            true,
            "user".equals(state.location),
            pulsePhase);
        if (user != null && raspi.distanceMetersTo(user) > 20.0) {
            drawLocationMarker(canvas, raspi, active, state.zoom, width, height, trafficColor, false, false, pulsePhase);
            drawLocationMarker(canvas, user, active, state.zoom, width, height, ContextCompat.getColor(context, R.color.its_widget_blue), false, true, pulsePhase);
        }

        return output;
    }

    private Bitmap createFallbackBitmap(Context context, WidgetSnapshot snapshot, WidgetState state, WidgetLocation active, WidgetLocation raspi, WidgetLocation user) {
        int width = 320;
        int height = 180;
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(output);
        // base gradient
        canvas.drawColor(0xFF0F172A);
        Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
        base.setShader(new LinearGradient(0, 0, width, height, 0xFF0B1220, 0xFF111827, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, width, height, base);

        // faint grid to simulate map texture
        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(0x2234475A);
        grid.setStrokeWidth(1.5f);
        for (int i = -1; i <= 1; i++) {
            float y = height / 2f + i * 28f;
            canvas.drawLine(0, y, width, y, grid);
        }
        for (int i = -2; i <= 2; i++) {
            float x = width / 2f + i * 40f;
            canvas.drawLine(x, 0, x, height, grid);
        }

        // curved road hints
        Paint road = new Paint(Paint.ANTI_ALIAS_FLAG);
        road.setColor(0x334A6578);
        road.setStyle(Paint.Style.STROKE);
        road.setStrokeWidth(3f);
        Path path = new Path();
        path.moveTo(12f, height * 0.28f);
        path.cubicTo(88f, height * 0.18f, 160f, height * 0.6f, width - 12f, height * 0.46f);
        canvas.drawPath(path, road);
        path.reset();
        path.moveTo(8f, height * 0.72f);
        path.cubicTo(80f, height * 0.86f, 200f, height * 0.54f, width - 8f, height * 0.76f);
        canvas.drawPath(path, road);

        // pulsing marker in center to indicate realtime
        long phase = (System.currentTimeMillis() / 500L) % 4L;
        float pulse = 1.0f + (phase == 0 ? 0f : phase == 1 ? 0.25f : phase == 2 ? 0.5f : 0.25f);
        int markerColor = "user".equals(state.location) ? ContextCompat.getColor(context, R.color.its_widget_blue) : trafficColorFor(snapshot);
        drawPulsingMarker(canvas, width / 2f, height / 2f, markerColor, pulse);

        if (user != null && raspi.distanceMetersTo(user) > 20.0) {
            drawLocationMarker(canvas, raspi, active, state.zoom, width, height, trafficColorFor(snapshot), false, false, (System.currentTimeMillis() / 650L) % 3L);
            drawLocationMarker(canvas, user, active, state.zoom, width, height, ContextCompat.getColor(context, R.color.its_widget_blue), false, true, (System.currentTimeMillis() / 650L) % 3L);
        } else {
            Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
            label.setColor(0x66FFFFFF);
            label.setTextSize(16f);
            canvas.drawText(snapshot.deviceLabel, 12f, height - 12f, label);
        }

        return output;
    }

    private void drawPulsingMarker(Canvas canvas, float cx, float cy, int color, float pulse) {
        Paint outer = new Paint(Paint.ANTI_ALIAS_FLAG);
        outer.setColor((color & 0x00FFFFFF) | 0x1E000000);
        float rOuter = 28f * pulse;
        canvas.drawCircle(cx, cy, rOuter, outer);

        Paint mid = new Paint(Paint.ANTI_ALIAS_FLAG);
        mid.setColor((color & 0x00FFFFFF) | 0x33FFFFFF);
        float rMid = 18f * pulse;
        canvas.drawCircle(cx, cy, rMid, mid);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(color);
        canvas.drawCircle(cx, cy, 9f, fill);

        Paint core = new Paint(Paint.ANTI_ALIAS_FLAG);
        core.setColor(Color.WHITE);
        canvas.drawCircle(cx, cy, 4f, core);
    }

    private Bitmap fetchBitmapAny(String[] urls) {
        for (String url : urls) {
            Bitmap bitmap = fetchBitmap(url);
            if (bitmap != null) return bitmap;
        }
        return null;
    }

    private Bitmap fetchBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            String separator = url.contains("?") ? "&" : "?";
            connection = (HttpURLConnection) new URL(url + separator + "ts=" + System.currentTimeMillis()).openConnection();
            connection.setConnectTimeout(9000);
            connection.setReadTimeout(9000);
            connection.setRequestProperty("User-Agent", "ITS-Maps-Widget");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
            connection.setRequestProperty("Pragma", "no-cache");
            connection.setUseCaches(false);
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                return null;
            }
            try (InputStream stream = connection.getInputStream()) {
                return BitmapFactory.decodeStream(stream);
            }
        } catch (Exception err) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String[] tileUrlsFor(WidgetLocation center, String mode, int zoom) {
        int x = lonToTileX(center.lng, zoom);
        int y = latToTileY(center.lat, zoom);
        if ("satellite".equals(mode)) {
            return new String[] {
                String.format(Locale.US,
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d",
                    zoom, y, x),
                String.format(Locale.US,
                    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d",
                    zoom, y, x)
            };
        }
        return new String[] {
                String.format(Locale.US,
                    "https://staticmap.openstreetmap.de/staticmap.php?center=%f,%f&zoom=%d&size=640x360&maptype=mapnik&markers=%f,%f,lightblue1",
                    center.lat, center.lng, Math.max(zoom - 1, 10), center.lat, center.lng),
            String.format(Locale.US,
                "https://basemaps.cartocdn.com/rastertiles/voyager/%d/%d/%d@2x.png",
                zoom, x, y),
            String.format(Locale.US,
                "https://basemaps.cartocdn.com/rastertiles/light_all/%d/%d/%d@2x.png",
                zoom, x, y),
            String.format(Locale.US,
                "https://tile.openstreetmap.org/%d/%d/%d.png",
                zoom, x, y)
        };
    }

    private String modeBadge(String mode) {
        if ("3d".equals(mode)) return "3D";
        if ("satellite".equals(mode)) return "SAT";
        return "2D";
    }

    private int lonToTileX(double lon, int zoom) {
        return (int) Math.floor((lon + 180.0) / 360.0 * (1 << zoom));
    }

    private int latToTileY(double lat, int zoom) {
        double latRad = Math.toRadians(lat);
        return (int) Math.floor((1.0 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0 * (1 << zoom));
    }

    private void drawLocationMarker(Canvas canvas, WidgetLocation location, WidgetLocation center, int zoom, int width, int height, int fillColor, boolean active, boolean userMarker, long pulsePhase) {
        float[] point = projectToCanvas(location.lat, location.lng, center.lat, center.lng, zoom, width, height);
        float x = point[0];
        float y = point[1];
        if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

        Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        halo.setColor(active ? 0x80FFFFFF : 0x40FFFFFF);
        float pulseBoost = pulsePhase == 0 ? 0f : pulsePhase == 1 ? 3f : 6f;
        canvas.drawCircle(x, y, active ? 22f + pulseBoost : 16f + pulseBoost * 0.5f, halo);

        if (userMarker) {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(fillColor);
            Path pin = new Path();
            pin.moveTo(x, y + (active ? 18f : 14f));
            pin.cubicTo(x - 13f, y + 6f, x - 14f, y - 8f, x, y - 12f);
            pin.cubicTo(x + 14f, y - 8f, x + 13f, y + 6f, x, y + (active ? 18f : 14f));
            pin.close();
            canvas.drawPath(pin, fill);

            Paint core = new Paint(Paint.ANTI_ALIAS_FLAG);
            core.setColor(Color.WHITE);
            canvas.drawCircle(x, y - 2f, active ? 6f : 5f, core);
            core.setColor(fillColor);
            canvas.drawCircle(x, y - 2f, active ? 3f : 2.5f, core);
        } else {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(fillColor);
            Path body = new Path();
            body.moveTo(x, y + (active ? 18f : 14f));
            body.lineTo(x - 8f, y + 4f);
            body.lineTo(x - 6f, y - 8f);
            body.lineTo(x + 6f, y - 8f);
            body.lineTo(x + 8f, y + 4f);
            body.close();
            canvas.drawPath(body, fill);

            Paint pane = new Paint(Paint.ANTI_ALIAS_FLAG);
            pane.setColor(Color.WHITE);
            canvas.drawRoundRect(x - 5f, y - 6f, x + 5f, y + 5f, 4f, 4f, pane);

            Paint signal = new Paint(Paint.ANTI_ALIAS_FLAG);
            signal.setColor(0xFFE11D48);
            canvas.drawCircle(x, y - 2f, 1.8f, signal);
            signal.setColor(0xFFF59E0B);
            canvas.drawCircle(x, y + 2f, 1.8f, signal);
            signal.setColor(0xFF22C55E);
            canvas.drawCircle(x, y + 6f, 1.8f, signal);
        }

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(active ? 3.5f : 2.5f);
        stroke.setColor(Color.WHITE);
        canvas.drawCircle(x, y - 2f, active ? 13f : 10f, stroke);
    }

    private int trafficColorFor(WidgetSnapshot snapshot) {
        if (!snapshot.isOnline()) {
            return 0xFF64748B;
        }
        if (snapshot.vehicleCount >= 10) {
            return 0xFFEF4444;
        }
        if (snapshot.vehicleCount >= 5) {
            return 0xFFF59E0B;
        }
        return 0xFF22C55E;
    }

    private float[] projectToCanvas(double lat, double lng, double centerLat, double centerLng, int zoom, int width, int height) {
        double scale = 256d * (1 << zoom);
        double worldX = (lng + 180.0) / 360.0 * scale;
        double sinLat = Math.sin(Math.toRadians(lat));
        double worldY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;

        double centerWorldX = (centerLng + 180.0) / 360.0 * scale;
        double centerSinLat = Math.sin(Math.toRadians(centerLat));
        double centerWorldY = (0.5 - Math.log((1 + centerSinLat) / (1 - centerSinLat)) / (4 * Math.PI)) * scale;

        return new float[] {
            (float) (width / 2.0 + (worldX - centerWorldX)),
            (float) (height / 2.0 + (worldY - centerWorldY))
        };
    }

    private WidgetLocation resolveUserLocation(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long savedAt = prefs.getLong("user_time", 0L);
        if (savedAt > 0L && System.currentTimeMillis() - savedAt <= 120_000L) {
            long savedLatBits = prefs.getLong("user_lat", Long.MIN_VALUE);
            long savedLngBits = prefs.getLong("user_lng", Long.MIN_VALUE);
            if (savedLatBits != Long.MIN_VALUE && savedLngBits != Long.MIN_VALUE) {
                return new WidgetLocation(Double.longBitsToDouble(savedLatBits), Double.longBitsToDouble(savedLngBits));
            }
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }

        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return null;

        Location best = null;
        for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER }) {
            try {
                Location location = manager.getLastKnownLocation(provider);
                if (location == null) continue;
                if (best == null || location.getTime() > best.getTime()) {
                    best = location;
                }
            } catch (SecurityException ignored) {
                return null;
            }
        }

        if (best == null) return null;
        return new WidgetLocation(best.getLatitude(), best.getLongitude());
    }

    private static final class WidgetState {
        String location = DEFAULT_LOCATION;
        String mode = DEFAULT_MODE;
        int zoom = DEFAULT_ZOOM;
    }

    private static final class WidgetLocation {
        final double lat;
        final double lng;

        WidgetLocation(double lat, double lng) {
            this.lat = lat;
            this.lng = lng;
        }

        double distanceMetersTo(WidgetLocation other) {
            double dx = lat - other.lat;
            double dy = lng - other.lng;
            return Math.sqrt(dx * dx + dy * dy) * 111_000d;
        }
    }

    private static final class WidgetSnapshot {
        final String deviceId;
        final String deviceLabel;
        final String status;
        final long lastSeen;
        final double latitude;
        final double longitude;
        final int vehicleCount;

        private WidgetSnapshot(String deviceId, String deviceLabel, String status, long lastSeen, double latitude, double longitude, int vehicleCount) {
            this.deviceId = deviceId;
            this.deviceLabel = deviceLabel;
            this.status = status;
            this.lastSeen = lastSeen;
            this.latitude = latitude;
            this.longitude = longitude;
            this.vehicleCount = vehicleCount;
        }

        static WidgetSnapshot fallback() {
            return new WidgetSnapshot(PRIMARY_DEVICE_ID, "Raspberry Pi ITS", "unknown", 0L, -6.9727, 107.6316, 0);
        }

        static WidgetSnapshot fromJson(String rawJson) throws JSONException {
            JSONObject root = new JSONObject(rawJson);
            JSONObject device = selectPrimaryDevice(root);
            if (device == null) {
                return fallback();
            }

            String deviceId = device.optString("id", PRIMARY_DEVICE_ID);
            String label = device.optString("label", device.optString("name", "Raspberry Pi ITS"));
            String status = device.optString("status", "unknown");
            long lastSeen = device.optLong("lastSeen", device.optLong("updatedAt", 0L));
            JSONObject position = device.optJSONObject("position");
            double latitude = position != null
                ? position.optDouble("lat", position.optDouble("latitude", -6.9727))
                : device.optDouble("lat", device.optDouble("latitude", -6.9727));
            double longitude = position != null
                ? position.optDouble("lng", position.optDouble("lon", position.optDouble("longitude", 107.6316)))
                : device.optDouble("lng", device.optDouble("lon", device.optDouble("longitude", 107.6316)));
            int vehicleCount = device.optInt("vehicleCount", device.optInt("objectCount", 0));

            return new WidgetSnapshot(deviceId, label, status, lastSeen, latitude, longitude, vehicleCount);
        }

        private static JSONObject selectPrimaryDevice(JSONObject root) {
            JSONObject direct = root.optJSONObject(PRIMARY_DEVICE_ID);
            if (direct != null) {
                return withId(direct, PRIMARY_DEVICE_ID);
            }

            JSONObject devices = root.optJSONObject("devices");
            if (devices != null) {
                JSONObject keyed = devices.optJSONObject(PRIMARY_DEVICE_ID);
                if (keyed != null) {
                    return withId(keyed, PRIMARY_DEVICE_ID);
                }
                JSONObject first = firstObjectValue(devices);
                if (first != null) {
                    return first;
                }
            }

            JSONObject first = firstObjectValue(root);
            if (first != null) {
                return first;
            }
            return null;
        }

        private static JSONObject firstObjectValue(JSONObject root) {
            Iterator<String> keys = root.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = root.opt(key);
                if (value instanceof JSONObject) {
                    return withId((JSONObject) value, key);
                }
            }
            return null;
        }

        private static JSONObject withId(JSONObject device, String id) {
            if (!device.has("id")) {
                try {
                    device.put("id", id);
                } catch (JSONException ignored) {
                }
            }
            return device;
        }

        boolean isOnline() {
            return "online".equalsIgnoreCase(status) || "degraded".equalsIgnoreCase(status);
        }

        WidgetLocation deviceLocation() {
            return new WidgetLocation(latitude, longitude);
        }

        String statusLine() {
            return deviceLabel + " · " + (isOnline() ? "online" : status);
        }
    }
}
