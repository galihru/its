package id.ac.telkomuniversity.its;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver.PendingResult;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.Uri;
import android.text.TextUtils;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ChartWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_REFRESH_WIDGET = "id.ac.telkomuniversity.its.action.REFRESH_WIDGET";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_POINTS = "chart_points";
    private static final String PREF_SNAPSHOT = "latest_snapshot";
    private static final String PREF_LAST_GREEN = "last_green_duration";
    private static final String FIREBASE_ROOT_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String FIREBASE_DEVICE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices/raspberry-its.json";
    private static final String STATE_SNAPSHOT_URL = "https://itstelkom.web.app/data/its-state.json";
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final long REFRESH_INTERVAL_MS = 15_000L;
    private static final int POINT_LIMIT = 20;
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
        super.onReceive(context, intent);
    }

    @Override
    public void onEnabled(Context context) {
        startRealtimeServiceSafely(context);
        scheduleRefresh(context);
        final PendingResult result = goAsync();
        EXECUTOR.execute(() -> {
            try {
                refreshAllWidgets(context);
            } finally {
                result.finish();
            }
        });
    }

    @Override
    public void onDisabled(Context context) {
        cancelRefresh(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        startRealtimeServiceSafely(context);
        super.onUpdate(context, appWidgetManager, appWidgetIds);
    }

    private void startRealtimeServiceSafely(Context context) {
        try {
            WidgetRealtimeService.start(context);
        } catch (RuntimeException err) {
            System.out.println("[ITS] Widget realtime service start skipped: " + err.getMessage());
        }
    }

    private void refreshAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, ChartWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(provider);
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        WidgetSnapshot snapshot;
        try {
            snapshot = fetchSnapshot(context);
        } catch (Exception err) {
            WidgetSnapshot cached = readCachedSnapshot(context);
            snapshot = cached != null ? cached : WidgetSnapshot.fallback();
        }

        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId, snapshot);
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, WidgetSnapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_chart);
        views.setOnClickPendingIntent(R.id.widget_chart_root, openIntent(context, "its://chart", 1102));

        views.setTextViewText(R.id.widget_chart_title, "ITS Live");
        views.setTextViewText(R.id.widget_chart_subtitle, snapshot.deviceLine());
        views.setTextViewText(R.id.widget_chart_status, snapshot.statusChip());
        views.setTextViewText(R.id.widget_chart_status_detail, snapshot.statusDetailLine());

        views.setTextViewText(R.id.widget_chart_total, String.valueOf(snapshot.vehicleCount));
        views.setTextViewText(R.id.widget_chart_traffic, snapshot.trafficLine());
        views.setTextViewText(R.id.widget_chart_road, snapshot.roadLine());
        views.setTextViewText(R.id.widget_chart_value_car, String.valueOf(snapshot.car));
        views.setTextViewText(R.id.widget_chart_value_motorcycle, String.valueOf(snapshot.motorcycle));
        views.setTextViewText(R.id.widget_chart_value_bus, String.valueOf(snapshot.bus));
        views.setTextViewText(R.id.widget_chart_value_truck, String.valueOf(snapshot.truck));
        views.setTextViewText(R.id.widget_chart_value_bicycle, String.valueOf(snapshot.bicycle));
        views.setTextViewText(R.id.widget_chart_value_detector, snapshot.detectorStatus.toUpperCase(Locale.ROOT));

        int statusColor = snapshot.isOnline()
            ? ContextCompat.getColor(context, R.color.its_widget_green)
            : ContextCompat.getColor(context, R.color.its_widget_red);
        int trafficColor = colorForTraffic(context, snapshot.trafficColor);
        int aiColor = snapshot.detectorOnline()
            ? ContextCompat.getColor(context, R.color.its_widget_green)
            : ContextCompat.getColor(context, R.color.its_widget_red);
        views.setTextColor(R.id.widget_chart_status, statusColor);
        views.setTextColor(R.id.widget_chart_traffic, trafficColor);
        views.setTextColor(R.id.widget_chart_value_detector, aiColor);

        List<ChartPoint> points = loadAndAppendPoints(context, snapshot.vehicleCount, snapshot.greenDurationSec());
        Bitmap chart = createVehicleVsGreenChart(context, points, trafficColor);
        views.setImageViewBitmap(R.id.widget_chart_sparkline, chart);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private void scheduleRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        PendingIntent pendingIntent = refreshPendingIntent(context);
        long firstTriggerAt = System.currentTimeMillis() + REFRESH_INTERVAL_MS;
        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                firstTriggerAt,
                pendingIntent
            );
        } catch (SecurityException se) {
            // Fall back to non-exact alarm when exact alarm permission is not available.
            alarmManager.set(AlarmManager.RTC_WAKEUP, firstTriggerAt, pendingIntent);
        }
    }

    private void cancelRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        alarmManager.cancel(refreshPendingIntent(context));
    }

    private PendingIntent openIntent(Context context, String uri, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, ChartWidgetProvider.class);
        intent.setAction(ACTION_REFRESH_WIDGET);
        return PendingIntent.getBroadcast(
            context,
            2102,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void scheduleRefresh(Context context, long delayMs) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        PendingIntent pendingIntent = refreshPendingIntent(context);
        long triggerAt = System.currentTimeMillis() + Math.max(5_000L, delayMs);
        try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } catch (SecurityException se) {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }
    }

    private WidgetSnapshot fetchSnapshot(Context context) throws Exception {
        WidgetSnapshot cached = readCachedSnapshot(context);
        Exception lastError = null;

        for (String url : new String[] { FIREBASE_ROOT_URL, FIREBASE_DEVICE_URL, STATE_SNAPSHOT_URL }) {
            try {
                String rawJson = fetchJson(url);
                WidgetSnapshot snapshot = WidgetSnapshot.fromFirebase(rawJson);
                saveCachedSnapshot(context, rawJson);
                return snapshot;
            } catch (Exception err) {
                lastError = err;
            }
        }

        if (cached != null) return cached;
        if (lastError != null) throw lastError;
        throw new IllegalStateException("Firebase snapshot unavailable");
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
            throw new IllegalStateException("Firebase HTTP " + code + " for " + url);
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
        String raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_SNAPSHOT, "");
        if (TextUtils.isEmpty(raw)) return null;
        try {
            return WidgetSnapshot.fromFirebase(raw);
        } catch (Exception err) {
            return null;
        }
    }

    private void saveCachedSnapshot(Context context, String rawJson) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_SNAPSHOT, rawJson)
            .apply();
    }

    private List<ChartPoint> loadAndAppendPoints(Context context, int vehicleCount, int currentGreenDuration) {
        List<ChartPoint> points = new ArrayList<>();
        String raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_POINTS, "");
        if (!TextUtils.isEmpty(raw)) {
            try {
                JSONArray array = new JSONArray(raw);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject obj = array.optJSONObject(i);
                    if (obj == null) continue;
                    points.add(new ChartPoint(
                        Math.max(0, obj.optInt("x", 0)),
                        Math.max(0, obj.optInt("y", 0))
                    ));
                }
            } catch (JSONException ignored) {
            }
        }

        int greenDuration = currentGreenDuration;
        if (greenDuration <= 0) {
            greenDuration = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getInt(PREF_LAST_GREEN, 0);
        } else {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putInt(PREF_LAST_GREEN, greenDuration)
                .apply();
        }

        points.add(new ChartPoint(Math.max(0, vehicleCount), Math.max(0, greenDuration)));
        while (points.size() > POINT_LIMIT) points.remove(0);

        JSONArray saveArray = new JSONArray();
        for (ChartPoint point : points) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("x", point.vehicleCount);
                obj.put("y", point.greenDurationSec);
            } catch (JSONException ignored) {
            }
            saveArray.put(obj);
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_POINTS, saveArray.toString())
            .apply();

        return points;
    }

    private Bitmap createVehicleVsGreenChart(Context context, List<ChartPoint> points, int lineColor) {
        int width = 1100;
        int height = 360;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(colorFromHex("#162033"));
        canvas.drawRoundRect(new RectF(0, 0, width, height), 26, 26, bg);

        float left = 92f;
        float top = 42f;
        float right = width - 26f;
        float bottom = height - 66f;
        float usableWidth = right - left;
        float usableHeight = bottom - top;

        int maxX = 1;
        int maxY = 1;
        for (ChartPoint point : points) {
            if (point.vehicleCount > maxX) maxX = point.vehicleCount;
            if (point.greenDurationSec > maxY) maxY = point.greenDurationSec;
        }
        maxX = alignUp(maxX);
        maxY = alignUp(maxY);

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(colorFromHex("#2b3a55"));
        grid.setStrokeWidth(2f);
        grid.setAlpha(120);
        for (int i = 0; i <= 4; i++) {
            float y = top + (usableHeight * i / 4f);
            canvas.drawLine(left, y, right, y, grid);
        }

        Paint axis = new Paint(Paint.ANTI_ALIAS_FLAG);
        axis.setColor(colorFromHex("#7386a5"));
        axis.setStrokeWidth(2.5f);
        canvas.drawLine(left, top, left, bottom, axis);
        canvas.drawLine(left, bottom, right, bottom, axis);

        if (points.size() >= 2) {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(adjustAlpha(lineColor, 46));
            fill.setStyle(Paint.Style.FILL);

            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setColor(lineColor);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(7f);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            stroke.setStrokeJoin(Paint.Join.ROUND);

            Path line = new Path();
            Path area = new Path();
            for (int i = 0; i < points.size(); i++) {
                ChartPoint p = points.get(i);
                float x = left + ((p.vehicleCount / (float) maxX) * usableWidth);
                float y = bottom - ((p.greenDurationSec / (float) maxY) * usableHeight * 0.9f);
                if (i == 0) {
                    line.moveTo(x, y);
                    area.moveTo(x, bottom);
                    area.lineTo(x, y);
                } else {
                    line.lineTo(x, y);
                    area.lineTo(x, y);
                }
            }
            ChartPoint last = points.get(points.size() - 1);
            float lastX = left + ((last.vehicleCount / (float) maxX) * usableWidth);
            area.lineTo(lastX, bottom);
            area.close();

            canvas.drawPath(area, fill);
            canvas.drawPath(line, stroke);

            Paint dots = new Paint(Paint.ANTI_ALIAS_FLAG);
            dots.setColor(lineColor);
            for (ChartPoint p : points) {
                float x = left + ((p.vehicleCount / (float) maxX) * usableWidth);
                float y = bottom - ((p.greenDurationSec / (float) maxY) * usableHeight * 0.9f);
                canvas.drawCircle(x, y, 5f, dots);
            }
        }

        Paint axisText = new Paint(Paint.ANTI_ALIAS_FLAG);
        axisText.setColor(colorFromHex("#9fb0cc"));
        axisText.setTextSize(24f);
        canvas.drawText(String.valueOf(maxY), 22f, top + 8f, axisText);
        canvas.drawText(String.valueOf(maxY / 2), 22f, top + (usableHeight / 2f) + 8f, axisText);
        canvas.drawText("0", 22f, bottom + 8f, axisText);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(colorFromHex("#9fb0cc"));
        title.setTextSize(22f);
        title.setFakeBoldText(true);
        canvas.drawText("Y: Durasi hijau (dtk)", left, 26f, title);
        canvas.drawText("X: Jumlah kendaraan", left, height - 18f, title);

        Paint legendDot = new Paint(Paint.ANTI_ALIAS_FLAG);
        legendDot.setColor(lineColor);
        canvas.drawCircle(right - 160f, 22f, 6f, legendDot);
        canvas.drawText("Data realtime", right - 142f, 28f, axisText);

        return bitmap;
    }

    private int alignUp(int value) {
        if (value <= 10) return 10;
        if (value <= 20) return 20;
        if (value <= 40) return 40;
        if (value <= 60) return 60;
        if (value <= 100) return 100;
        return ((value + 49) / 50) * 50;
    }

    private int colorForTraffic(Context context, String trafficColor) {
        String value = trafficColor == null ? "" : trafficColor.trim().toLowerCase(Locale.ROOT);
        if ("red".equals(value)) return ContextCompat.getColor(context, R.color.its_widget_red);
        if ("yellow".equals(value)) return ContextCompat.getColor(context, R.color.its_widget_yellow);
        return ContextCompat.getColor(context, R.color.its_widget_green);
    }

    private int adjustAlpha(int color, int alpha) {
        return (color & 0x00ffffff) | ((Math.max(0, Math.min(255, alpha)) & 0xff) << 24);
    }

    private int colorFromHex(String hex) {
        return (int) Long.parseLong(hex.replace("#", "ff"), 16);
    }

    private static final class ChartPoint {
        final int vehicleCount;
        final int greenDurationSec;

        ChartPoint(int vehicleCount, int greenDurationSec) {
            this.vehicleCount = vehicleCount;
            this.greenDurationSec = greenDurationSec;
        }
    }

    private static final class WidgetSnapshot {
        final String id;
        final String label;
        final String roadName;
        final String status;
        final String detectorStatus;
        final String trafficColor;
        final int trafficDurationSec;
        final String lastSeenText;
        final int vehicleCount;
        final int car;
        final int motorcycle;
        final int bus;
        final int truck;
        final int bicycle;

        WidgetSnapshot(
            String id,
            String label,
            String roadName,
            String status,
            String detectorStatus,
            String trafficColor,
            int trafficDurationSec,
            String lastSeenText,
            int vehicleCount,
            int car,
            int motorcycle,
            int bus,
            int truck,
            int bicycle
        ) {
            this.id = id;
            this.label = label;
            this.roadName = roadName;
            this.status = status;
            this.detectorStatus = detectorStatus;
            this.trafficColor = trafficColor;
            this.trafficDurationSec = trafficDurationSec;
            this.lastSeenText = lastSeenText;
            this.vehicleCount = vehicleCount;
            this.car = car;
            this.motorcycle = motorcycle;
            this.bus = bus;
            this.truck = truck;
            this.bicycle = bicycle;
        }

        static WidgetSnapshot fallback() {
            return new WidgetSnapshot(
                PRIMARY_DEVICE_ID,
                "Raspberry Pi 5 Controller",
                "Jalan -",
                "offline",
                "error",
                "red",
                0,
                "Update -",
                0,
                0,
                0,
                0,
                0,
                0
            );
        }

        static WidgetSnapshot fromFirebase(String rawJson) throws JSONException {
            JSONObject root = new JSONObject(rawJson);
            JSONObject device = selectDevice(root);

            JSONObject breakdown = device.optJSONObject("vehicleBreakdown");
            int car = breakdown != null ? breakdown.optInt("car", 0) : 0;
            int motorcycle = breakdown != null ? breakdown.optInt("motorcycle", 0) : 0;
            int bus = breakdown != null ? breakdown.optInt("bus", 0) : 0;
            int truck = breakdown != null ? breakdown.optInt("truck", 0) : 0;
            int bicycle = breakdown != null ? breakdown.optInt("bicycle", 0) : 0;
            int total = Math.max(0, device.optInt("vehicleCount", car + motorcycle + bus + truck + bicycle));

            String id = device.optString("id", PRIMARY_DEVICE_ID);
            String label = firstNonEmpty(device.optString("label", ""), "Raspberry Pi 5 Controller");
            String roadName = firstNonEmpty(device.optString("roadName", ""), firstNonEmpty(device.optString("locationLabel", ""), "Jalan -"));
            String status = firstNonEmpty(device.optString("status", ""), "offline");
            String detectorStatus = firstNonEmpty(device.optString("detectorStatus", ""), "-");
            String trafficColor = firstNonEmpty(device.optString("trafficColor", ""), "-");
            int trafficDurationSec = Math.max(0, device.optInt("trafficDurationSec", 0));
            String lastSeenText = device.optString("lastSeenText", "");
            if (TextUtils.isEmpty(lastSeenText)) {
                long lastSeen = device.optLong("lastSeen", root.optLong("updatedAt", 0L));
                if (lastSeen > 0) {
                    lastSeenText = String.format(Locale.getDefault(), "%tA, %td %<tb %<tY %<tH:%<tM:%<tS", lastSeen);
                } else {
                    lastSeenText = "Update -";
                }
            }

            return new WidgetSnapshot(
                id,
                label,
                roadName,
                status,
                detectorStatus,
                trafficColor,
                trafficDurationSec,
                lastSeenText,
                total,
                car,
                motorcycle,
                bus,
                truck,
                bicycle
            );
        }

        private static JSONObject selectDevice(JSONObject root) throws JSONException {
            if (isDeviceRecord(root)) return root;

            JSONObject byIdTop = root.optJSONObject(PRIMARY_DEVICE_ID);
            if (byIdTop != null && isDeviceRecord(byIdTop)) return byIdTop;

            JSONObject devicesObj = root.optJSONObject("devices");
            if (devicesObj != null) {
                JSONObject byId = devicesObj.optJSONObject(PRIMARY_DEVICE_ID);
                if (byId != null && isDeviceRecord(byId)) return byId;
                JSONObject best = pickMostRecentDevice(devicesObj);
                if (best != null) return best;
            }

            JSONArray devicesArray = root.optJSONArray("devices");
            if (devicesArray != null) {
                JSONObject best = pickMostRecentDevice(devicesArray);
                if (best != null) return best;
            }

            JSONObject recursive = pickMostRecentDevice(root);
            return recursive != null ? recursive : root;
        }

        private static JSONObject pickMostRecentDevice(JSONObject object) throws JSONException {
            List<JSONObject> candidates = new ArrayList<>();
            collectCandidates(object, candidates);
            if (candidates.isEmpty()) return null;

            JSONObject best = null;
            long bestLastSeen = Long.MIN_VALUE;
            int bestScore = Integer.MIN_VALUE;
            for (JSONObject candidate : candidates) {
                long lastSeen = candidate.optLong("lastSeen", 0L);
                int score = scoreCandidate(candidate);
                if (lastSeen > bestLastSeen || (lastSeen == bestLastSeen && score > bestScore)) {
                    best = candidate;
                    bestLastSeen = lastSeen;
                    bestScore = score;
                }
            }
            return best;
        }

        private static JSONObject pickMostRecentDevice(JSONArray array) throws JSONException {
            List<JSONObject> candidates = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                collectCandidates(array.opt(i), candidates);
            }
            if (candidates.isEmpty()) return null;

            JSONObject best = null;
            long bestLastSeen = Long.MIN_VALUE;
            int bestScore = Integer.MIN_VALUE;
            for (JSONObject candidate : candidates) {
                long lastSeen = candidate.optLong("lastSeen", 0L);
                int score = scoreCandidate(candidate);
                if (lastSeen > bestLastSeen || (lastSeen == bestLastSeen && score > bestScore)) {
                    best = candidate;
                    bestLastSeen = lastSeen;
                    bestScore = score;
                }
            }
            return best;
        }

        private static void collectCandidates(Object value, List<JSONObject> out) throws JSONException {
            if (value instanceof JSONObject) {
                JSONObject obj = (JSONObject) value;
                if (isDeviceRecord(obj)) out.add(obj);
                Iterator<String> keys = obj.keys();
                while (keys.hasNext()) {
                    collectCandidates(obj.opt(keys.next()), out);
                }
            } else if (value instanceof JSONArray) {
                JSONArray array = (JSONArray) value;
                for (int i = 0; i < array.length(); i++) {
                    collectCandidates(array.opt(i), out);
                }
            }
        }

        private static boolean isDeviceRecord(JSONObject object) {
            return object.has("vehicleCount") || object.has("trafficColor") || object.has("detectorStatus") || object.has("status");
        }

        private static int scoreCandidate(JSONObject object) {
            int score = 0;
            if (PRIMARY_DEVICE_ID.equals(object.optString("id"))) score += 100;
            String label = object.optString("label", "").toLowerCase(Locale.ROOT);
            if (label.contains("raspberry pi")) score += 30;
            if (object.has("vehicleCount")) score += 10;
            if (object.has("trafficColor")) score += 8;
            if (object.has("status")) score += 8;
            if (object.has("detectorStatus")) score += 8;
            return score;
        }

        boolean isOnline() {
            return "online".equalsIgnoreCase(status);
        }

        boolean detectorOnline() {
            return "online".equalsIgnoreCase(detectorStatus) || "ok".equalsIgnoreCase(detectorStatus);
        }

        String statusChip() {
            return isOnline() ? "ONLINE" : "OFFLINE";
        }

        String statusDetailLine() {
            if (TextUtils.isEmpty(lastSeenText) || "Update -".equalsIgnoreCase(lastSeenText)) {
                return isOnline() ? "Update realtime tersedia" : "Terakhir online: data belum tersedia";
            }
            return isOnline() ? "Terakhir update: " + lastSeenText : "Terakhir online: " + lastSeenText;
        }

        String deviceLine() {
            return label + " • " + roadLine();
        }

        String trafficLine() {
            return "Lampu " + trafficLabel(trafficColor) + " • " + trafficDurationSec + " dtk";
        }

        String roadLine() {
            return TextUtils.isEmpty(roadName) ? "Jalan -" : roadName;
        }

        int greenDurationSec() {
            return "green".equalsIgnoreCase(trafficColor) ? trafficDurationSec : 0;
        }

        private static String trafficLabel(String color) {
            if ("red".equalsIgnoreCase(color)) return "Merah";
            if ("yellow".equalsIgnoreCase(color)) return "Kuning";
            if ("green".equalsIgnoreCase(color)) return "Hijau";
            return "-";
        }

        private static String firstNonEmpty(String first, String fallback) {
            if (first != null && !first.trim().isEmpty()) return first.trim();
            return fallback;
        }
    }
}
