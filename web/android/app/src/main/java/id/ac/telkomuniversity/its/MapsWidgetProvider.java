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
import android.graphics.RectF;
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
    private static final String ACTION_ZOOM_TOGGLE = "id.ac.telkomuniversity.its.action.MAPS_ZOOM_TOGGLE";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_LOCATION = "maps_location";
    private static final String PREF_ZOOM = "maps_zoom";
    private static final String DEFAULT_LOCATION = "raspi";
    private static final int DEFAULT_ZOOM = 17;
    private static final int PREVIEW_WIDTH = 640;
    private static final int PREVIEW_HEIGHT = 360;
    private static final double TILE_PIXEL_RATIO = 2.0;
    private static final int RETINA_TILE_SIZE = 512;
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DEVICES_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String STATE_SNAPSHOT_URL = "https://itstelkom.web.app/data/its-state.json";
    private static final long REFRESH_INTERVAL_MS = 10_000L;
    private static final long STALE_AFTER_MS = 90_000L;
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

        if (ACTION_SET_LOCATION.equals(action) || ACTION_ZOOM_TOGGLE.equals(action)) {
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

        views.setImageViewResource(R.id.widget_maps_location_user, R.drawable.ic_widget_location_user);
        views.setImageViewResource(R.id.widget_maps_location_raspi, R.drawable.ic_widget_location_raspi);
        views.setImageViewResource(R.id.widget_maps_zoom_toggle, R.drawable.ic_widget_map_zoom);

        int activeBlue = ContextCompat.getColor(context, R.color.its_widget_blue);
        int activeGreen = ContextCompat.getColor(context, R.color.its_widget_green);
        int muted = ContextCompat.getColor(context, R.color.its_widget_muted);
        views.setInt(R.id.widget_maps_location_user, "setColorFilter", "user".equals(state.location) ? activeBlue : muted);
        views.setInt(R.id.widget_maps_location_raspi, "setColorFilter", "raspi".equals(state.location) ? activeGreen : muted);
        views.setInt(R.id.widget_maps_zoom_toggle, "setColorFilter", muted);

        views.setOnClickPendingIntent(R.id.widget_maps_root, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_preview, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_hint, refreshPendingIntent(context));
        views.setOnClickPendingIntent(R.id.widget_maps_location_user, openActionIntent(context, ACTION_SET_LOCATION, "value", "user", 4102));
        views.setOnClickPendingIntent(R.id.widget_maps_location_raspi, openActionIntent(context, ACTION_SET_LOCATION, "value", "raspi", 4103));
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
        state.zoom = clampZoom(prefs.getInt(PREF_ZOOM, DEFAULT_ZOOM));
        return state;
    }

    private void writeWidgetState(Context context, WidgetState state) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_LOCATION, state.location)
            .putInt(PREF_ZOOM, clampZoom(state.zoom))
            .commit();
    }

    private String normalizeLocation(String value) {
        return "user".equalsIgnoreCase(value) ? "user" : "raspi";
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

        Bitmap map = buildDynamicTileMap(active, clampZoom(state.zoom));
        if (map == null) {
            return createFallbackBitmap(context, snapshot, state, active, raspi, user);
        }

        int width = PREVIEW_WIDTH;
        int height = PREVIEW_HEIGHT;
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        canvas.drawColor(0xFF0F172A);

        canvas.drawBitmap(map, new Rect(0, 0, map.getWidth(), map.getHeight()), new Rect(0, 0, width, height), null);

        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setShader(new LinearGradient(0, 0, 0, height, 0x08000000, 0x8A000000, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, width, height, shadow);

        drawMapMarkers(
            canvas,
            active,
            raspi,
            user,
            state,
            width,
            height,
            trafficColor,
            ContextCompat.getColor(context, R.color.its_widget_blue),
            pulsePhase
        );

        return output;
    }

    private Bitmap createFallbackBitmap(Context context, WidgetSnapshot snapshot, WidgetState state, WidgetLocation active, WidgetLocation raspi, WidgetLocation user) {
        int width = PREVIEW_WIDTH;
        int height = PREVIEW_HEIGHT;
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        // Light fallback map when live map tiles are unavailable.
        canvas.drawColor(0xFFF8FBFF);
        Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
        base.setShader(new LinearGradient(0, 0, width, height, 0xFFFFFFFF, 0xFFE8F2F8, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, width, height, base);

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(0xFFE1EAF5);
        grid.setStrokeWidth(3f);
        for (int i = -5; i <= 5; i++) {
            float y = height / 2f + i * 34f;
            canvas.drawLine(0, y, width, y, grid);
        }
        for (int i = -7; i <= 7; i++) {
            float x = width / 2f + i * 46f;
            canvas.drawLine(x, 0, x, height, grid);
        }

        Path path = new Path();
        Paint river = new Paint(Paint.ANTI_ALIAS_FLAG);
        river.setColor(0xFFBDEBFF);
        river.setStyle(Paint.Style.STROKE);
        river.setStrokeCap(Paint.Cap.ROUND);
        river.setStrokeWidth(22f);
        path.moveTo(width * 0.08f, height * 0.82f);
        path.cubicTo(width * 0.35f, height * 0.62f, width * 0.36f, height * 0.22f, width * 0.72f, height * 0.16f);
        canvas.drawPath(path, river);

        Paint road = new Paint(Paint.ANTI_ALIAS_FLAG);
        road.setColor(0xFFFFE3B5);
        road.setStyle(Paint.Style.STROKE);
        road.setStrokeCap(Paint.Cap.ROUND);
        road.setStrokeWidth(16f);
        path.reset();
        path.moveTo(12f, height * 0.28f);
        path.cubicTo(88f, height * 0.18f, 160f, height * 0.6f, width - 12f, height * 0.46f);
        canvas.drawPath(path, road);
        path.reset();
        path.moveTo(8f, height * 0.72f);
        path.cubicTo(80f, height * 0.86f, 200f, height * 0.54f, width - 8f, height * 0.76f);
        canvas.drawPath(path, road);

        Paint roadCore = new Paint(Paint.ANTI_ALIAS_FLAG);
        roadCore.setColor(0xFFFFFFFF);
        roadCore.setStyle(Paint.Style.STROKE);
        roadCore.setStrokeCap(Paint.Cap.ROUND);
        roadCore.setStrokeWidth(8f);
        path.reset();
        path.moveTo(12f, height * 0.28f);
        path.cubicTo(88f, height * 0.18f, 160f, height * 0.6f, width - 12f, height * 0.46f);
        canvas.drawPath(path, roadCore);
        path.reset();
        path.moveTo(8f, height * 0.72f);
        path.cubicTo(80f, height * 0.86f, 200f, height * 0.54f, width - 8f, height * 0.76f);
        canvas.drawPath(path, roadCore);

        drawMapMarkers(
            canvas,
            active,
            raspi,
            user,
            state,
            width,
            height,
            trafficColorFor(snapshot),
            ContextCompat.getColor(context, R.color.its_widget_blue),
            (System.currentTimeMillis() / 650L) % 3L
        );

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

    private void drawMapMarkers(Canvas canvas, WidgetLocation center, WidgetLocation raspi, WidgetLocation user, WidgetState state, int width, int height, int trafficColor, int userColor, long pulsePhase) {
        boolean userActive = "user".equals(state.location) && user != null;
        if (user != null && raspi.distanceMetersTo(user) > 20.0) {
            drawLocationMarker(canvas, raspi, center, state.zoom, width, height, trafficColor, !userActive, false, pulsePhase);
            drawLocationMarker(canvas, user, center, state.zoom, width, height, userColor, userActive, true, pulsePhase);
        } else {
            drawLocationMarker(canvas, center, center, state.zoom, width, height, userActive ? userColor : trafficColor, true, userActive, pulsePhase);
        }
    }

    private Bitmap buildDynamicTileMap(WidgetLocation center, int zoom) {
        for (String style : new String[] { "voyager", "light_all" }) {
            Bitmap composed = composeTileMap(center, zoom, style);
            if (composed != null) return composed;
        }
        return null;
    }

    private Bitmap composeTileMap(WidgetLocation center, int zoom, String style) {
        int worldTiles = 1 << zoom;
        double centerPixelX = lonToWorldPixelX(center.lng, zoom) * TILE_PIXEL_RATIO;
        double centerPixelY = latToWorldPixelY(center.lat, zoom) * TILE_PIXEL_RATIO;
        double leftPixel = centerPixelX - PREVIEW_WIDTH / 2.0;
        double topPixel = centerPixelY - PREVIEW_HEIGHT / 2.0;
        int startTileX = (int) Math.floor(leftPixel / RETINA_TILE_SIZE);
        int endTileX = (int) Math.floor((leftPixel + PREVIEW_WIDTH) / RETINA_TILE_SIZE);
        int startTileY = (int) Math.floor(topPixel / RETINA_TILE_SIZE);
        int endTileY = (int) Math.floor((topPixel + PREVIEW_HEIGHT) / RETINA_TILE_SIZE);

        Bitmap output = Bitmap.createBitmap(PREVIEW_WIDTH, PREVIEW_HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        canvas.drawColor(0xFFE8EEF3);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        int loaded = 0;
        for (int tileY = startTileY; tileY <= endTileY; tileY++) {
            if (tileY < 0 || tileY >= worldTiles) continue;
            for (int tileX = startTileX; tileX <= endTileX; tileX++) {
                int wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
                String url = String.format(Locale.US,
                    "https://basemaps.cartocdn.com/rastertiles/%s/%d/%d/%d@2x.png",
                    style, zoom, wrappedX, tileY);
                Bitmap tile = fetchBitmap(url);
                if (tile == null) continue;
                float drawX = (float) (tileX * RETINA_TILE_SIZE - leftPixel);
                float drawY = (float) (tileY * RETINA_TILE_SIZE - topPixel);
                canvas.drawBitmap(tile, null, new RectF(drawX, drawY, drawX + RETINA_TILE_SIZE, drawY + RETINA_TILE_SIZE), paint);
                loaded += 1;
            }
        }

        return loaded > 0 ? output : null;
    }

    private Bitmap fetchBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            String requestUrl = shouldBustBitmapCache(url)
                ? url + (url.contains("?") ? "&" : "?") + "ts=" + System.currentTimeMillis()
                : url;
            connection = (HttpURLConnection) new URL(requestUrl).openConnection();
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

    private boolean shouldBustBitmapCache(String url) {
        return !url.contains("basemaps.cartocdn.com") && !url.contains("tile.openstreetmap.org");
    }

    private double lonToWorldPixelX(double lon, int zoom) {
        return (lon + 180.0) / 360.0 * 256.0 * (1 << zoom);
    }

    private double latToWorldPixelY(double lat, int zoom) {
        double sinLat = Math.sin(Math.toRadians(Math.max(-85.05112878, Math.min(85.05112878, lat))));
        return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * 256.0 * (1 << zoom);
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
        if (x < -60 || x > width + 60 || y < -80 || y > height + 60) return;

        Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        halo.setColor(active ? 0x66FFFFFF : 0x38FFFFFF);
        float scale = Math.max(0.88f, Math.min(1.32f, width / 520f));
        float pulseBoost = (pulsePhase == 0 ? 0f : pulsePhase == 1 ? 3f : 6f) * scale;
        canvas.drawCircle(x, y, (active ? 14f : 10f) * scale + pulseBoost, halo);

        if (userMarker) {
            drawMapPinMarker(canvas, x, y, fillColor, active, scale);
        } else {
            drawTrafficLightMarker(canvas, x, y, fillColor, active, scale);
        }
    }

    private void drawMapPinMarker(Canvas canvas, float tipX, float tipY, int color, boolean active, float scale) {
        float topY = tipY - 54f * scale;
        float centerY = tipY - 32f * scale;
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(0x66000000);
        canvas.drawOval(new RectF(tipX - 13f * scale, tipY - 4f * scale, tipX + 13f * scale, tipY + 5f * scale), shadow);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(color);
        Path pin = new Path();
        pin.moveTo(tipX, tipY);
        pin.cubicTo(tipX - 28f * scale, tipY - 24f * scale, tipX - 23f * scale, topY, tipX, topY);
        pin.cubicTo(tipX + 23f * scale, topY, tipX + 28f * scale, tipY - 24f * scale, tipX, tipY);
        pin.close();
        canvas.drawPath(pin, fill);

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setColor(Color.WHITE);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth((active ? 3.2f : 2.2f) * scale);
        canvas.drawPath(pin, stroke);

        Paint center = new Paint(Paint.ANTI_ALIAS_FLAG);
        center.setColor(Color.WHITE);
        canvas.drawCircle(tipX, centerY, 9f * scale, center);
        center.setColor(color);
        canvas.drawCircle(tipX, centerY, 5f * scale, center);
    }

    private void drawTrafficLightMarker(Canvas canvas, float tipX, float tipY, int activeColor, boolean active, float scale) {
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(0x66000000);
        canvas.drawOval(new RectF(tipX - 14f * scale, tipY - 4f * scale, tipX + 14f * scale, tipY + 5f * scale), shadow);

        Path pointer = new Path();
        pointer.moveTo(tipX, tipY);
        pointer.lineTo(tipX - 10f * scale, tipY - 18f * scale);
        pointer.lineTo(tipX + 10f * scale, tipY - 18f * scale);
        pointer.close();
        Paint pointerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        pointerPaint.setColor(0xFF0F172A);
        canvas.drawPath(pointer, pointerPaint);

        RectF body = new RectF(tipX - 17f * scale, tipY - 68f * scale, tipX + 17f * scale, tipY - 16f * scale);
        Paint bodyPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bodyPaint.setColor(0xF2111827);
        canvas.drawRoundRect(body, 9f * scale, 9f * scale, bodyPaint);

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth((active ? 3f : 2f) * scale);
        stroke.setColor(activeColor);
        canvas.drawRoundRect(body, 9f * scale, 9f * scale, stroke);

        drawTrafficDot(canvas, tipX, tipY - 56f * scale, 0xFFEF4444, activeColor == 0xFFEF4444, scale);
        drawTrafficDot(canvas, tipX, tipY - 42f * scale, 0xFFFACC15, activeColor == 0xFFFACC15, scale);
        drawTrafficDot(canvas, tipX, tipY - 28f * scale, 0xFF22C55E, activeColor == 0xFF22C55E, scale);
    }

    private void drawTrafficDot(Canvas canvas, float cx, float cy, int color, boolean active, float scale) {
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(active ? color : (color & 0x55FFFFFF));
        canvas.drawCircle(cx, cy, (active ? 5.2f : 4.2f) * scale, dot);
        if (active) {
            dot.setStyle(Paint.Style.STROKE);
            dot.setStrokeWidth(1.8f * scale);
            dot.setColor(0xDDFFFFFF);
            canvas.drawCircle(cx, cy, 7.2f * scale, dot);
        }
    }

    private int trafficColorFor(WidgetSnapshot snapshot) {
        if ("red".equalsIgnoreCase(snapshot.trafficColor)) return 0xFFEF4444;
        if ("yellow".equalsIgnoreCase(snapshot.trafficColor)) return 0xFFFACC15;
        if ("green".equalsIgnoreCase(snapshot.trafficColor)) return 0xFF22C55E;
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
        double worldX = lonToWorldPixelX(lng, zoom) * TILE_PIXEL_RATIO;
        double worldY = latToWorldPixelY(lat, zoom) * TILE_PIXEL_RATIO;
        double centerWorldX = lonToWorldPixelX(centerLng, zoom) * TILE_PIXEL_RATIO;
        double centerWorldY = latToWorldPixelY(centerLat, zoom) * TILE_PIXEL_RATIO;

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
        final String trafficColor;

        private WidgetSnapshot(String deviceId, String deviceLabel, String status, long lastSeen, double latitude, double longitude, int vehicleCount, String trafficColor) {
            this.deviceId = deviceId;
            this.deviceLabel = deviceLabel;
            this.status = status;
            this.lastSeen = lastSeen;
            this.latitude = latitude;
            this.longitude = longitude;
            this.vehicleCount = vehicleCount;
            this.trafficColor = trafficColor == null ? "" : trafficColor;
        }

        static WidgetSnapshot fallback() {
            return new WidgetSnapshot(PRIMARY_DEVICE_ID, "Raspberry Pi ITS", "unknown", 0L, -6.287297, 106.753997, 0, "");
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
            if ("online".equalsIgnoreCase(device.optString("cameraStatus", ""))) status = "online";
            long lastSeen = latestTelemetryAt(device, root);
            JSONObject coordinates = firstCoordinateObject(device, root);
            double latitude = coordinates != null
                ? coordinates.optDouble("lat", coordinates.optDouble("latitude", -6.287297))
                : device.optDouble("lat", device.optDouble("latitude", -6.287297));
            double longitude = coordinates != null
                ? coordinates.optDouble("lng", coordinates.optDouble("lon", coordinates.optDouble("longitude", 106.753997)))
                : device.optDouble("lng", device.optDouble("lon", device.optDouble("longitude", 106.753997)));
            if (!validCoordinate(latitude, longitude)) {
                latitude = -6.287297;
                longitude = 106.753997;
            }
            int vehicleCount = device.optInt("vehicleCount", device.optInt("objectCount", 0));
            String trafficColor = device.optString("trafficColor", "");

            return new WidgetSnapshot(deviceId, label, status, lastSeen, latitude, longitude, vehicleCount, trafficColor);
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
                JSONObject best = firstDeviceValue(devices);
                if (best != null) {
                    return best;
                }
            }

            JSONObject best = firstDeviceValue(root);
            if (best != null) {
                return best;
            }
            JSONObject first = firstObjectValue(root);
            if (first != null && !looksLikeCoordinateOnly(first)) {
                return first;
            }
            return null;
        }

        private static JSONObject firstDeviceValue(JSONObject root) {
            Iterator<String> keys = root.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = root.opt(key);
                if (value instanceof JSONObject && isDevice((JSONObject) value)) {
                    return withId((JSONObject) value, key);
                }
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

        private static JSONObject firstCoordinateObject(JSONObject device, JSONObject root) {
            for (JSONObject source : new JSONObject[] { device, root }) {
                if (source == null) continue;
                for (String key : new String[] { "location", "currentLocation", "lastLocation", "coordinates", "gps", "position" }) {
                    JSONObject nested = source.optJSONObject(key);
                    if (nested != null && hasUsableCoordinate(nested)) return nested;
                }
                if (hasUsableCoordinate(source)) return source;
            }
            return null;
        }

        private static boolean isDevice(JSONObject object) {
            return object != null && (
                object.has("vehicleCount")
                    || object.has("trafficColor")
                    || object.has("cameraStatus")
                    || object.has("detectorStatus")
                    || object.has("status")
                    || object.has("position")
                    || object.has("gps")
                    || object.has("currentLocation")
            );
        }

        private static boolean hasCoordinate(JSONObject object) {
            if (object == null) return false;
            boolean hasLat = object.has("lat") || object.has("latitude");
            boolean hasLng = object.has("lng") || object.has("lon") || object.has("longitude");
            return hasLat && hasLng;
        }

        private static boolean hasUsableCoordinate(JSONObject object) {
            if (!hasCoordinate(object)) return false;
            double lat = object.optDouble("lat", object.optDouble("latitude", Double.NaN));
            double lng = object.optDouble("lng", object.optDouble("lon", object.optDouble("longitude", Double.NaN)));
            return validCoordinate(lat, lng);
        }

        private static boolean validCoordinate(double latitude, double longitude) {
            if (Double.isNaN(latitude) || Double.isNaN(longitude)) return false;
            if (latitude < -90d || latitude > 90d || longitude < -180d || longitude > 180d) return false;
            return Math.abs(latitude) > 0.000001d || Math.abs(longitude) > 0.000001d;
        }

        private static boolean looksLikeCoordinateOnly(JSONObject object) {
            if (!hasCoordinate(object)) return false;
            return !object.has("status")
                && !object.has("cameraStatus")
                && !object.has("vehicleCount")
                && !object.has("trafficColor");
        }

        private static long latestTelemetryAt(JSONObject device, JSONObject root) {
            long latest = Math.max(
                device.optLong("lastSeen", 0L),
                Math.max(device.optLong("updatedAt", 0L), device.optLong("cameraUpdatedAt", 0L))
            );
            latest = Math.max(latest, device.optLong("detectorUpdatedAt", 0L));
            JSONObject camera = device.optJSONObject("camera");
            if (camera != null) {
                latest = Math.max(latest, camera.optLong("updatedAt", camera.optLong("heartbeatAt", 0L)));
            }
            JSONObject runtime = device.optJSONObject("runtime");
            if (runtime != null) {
                latest = Math.max(latest, runtime.optLong("heartbeatAt", runtime.optLong("updatedAt", 0L)));
            }
            latest = Math.max(latest, root.optLong("updatedAt", 0L));
            return normalizeEpoch(latest);
        }

        boolean isOnline() {
            long now = System.currentTimeMillis();
            boolean fresh = lastSeen > 0L && now - lastSeen <= STALE_AFTER_MS && lastSeen - now <= 300_000L;
            return "online".equalsIgnoreCase(status) || "degraded".equalsIgnoreCase(status) || fresh;
        }

        WidgetLocation deviceLocation() {
            return new WidgetLocation(latitude, longitude);
        }

        String statusLine() {
            return deviceLabel + " · " + (isOnline() ? "online" : status);
        }

        private static long normalizeEpoch(long value) {
            if (value <= 0L) return 0L;
            return value < 100_000_000_000L ? value * 1000L : value;
        }
    }
}
