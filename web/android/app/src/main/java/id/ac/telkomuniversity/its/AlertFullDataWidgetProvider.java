package id.ac.telkomuniversity.its;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver.PendingResult;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.text.TextUtils;
import android.util.Base64;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AlertFullDataWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_REFRESH_WIDGET = "id.ac.telkomuniversity.its.action.ALERT_FULL_DATA_REFRESH";
    private static final String ACTION_SELECT_SECTION = "id.ac.telkomuniversity.its.action.ALERT_FULL_DATA_SELECT";
    private static final String ACTION_NEXT_PHASE = "id.ac.telkomuniversity.its.action.ALERT_FULL_DATA_NEXT";
    private static final String ACTION_PREV_PHASE = "id.ac.telkomuniversity.its.action.ALERT_FULL_DATA_PREV";
    private static final String EXTRA_SECTION = "section";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_DATASET = "traffic_dataset_snapshot";
    private static final String PREF_DEVICE = "traffic_device_snapshot";
    private static final String PREF_APK_UPDATE = "traffic_apk_update_snapshot";
    private static final String PREF_HISTORY = "alert_full_data_history";
    private static final String PREF_PHASE_PREFIX = "alert_full_data_phase_";
    private static final String PREF_PHASE_STARTED_PREFIX = "alert_full_data_phase_started_";
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DATASET_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
    private static final String FIREBASE_DEVICE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices/raspberry-its.json";
    private static final String FIREBASE_APK_UPDATE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/apk.json";
    private static final long REFRESH_INTERVAL_MS = 10_000L;
    private static final long PHASE_DURATION_MS = 10_000L;
    private static final long STALE_AFTER_MS = 45_000L;
    private static final int CANVAS_WIDTH = 1280;
    private static final int CANVAS_HEIGHT = 640;
    private static final int PHASE_DATA_COUNTS = 0;
    private static final int PHASE_DATA_CHARTS = 1;
    private static final int PHASE_CAMERA_ONE = 2;
    private static final int PHASE_CAMERA_TWO = 3;
    private static final int PHASE_NOTICES = 4;
    private static final int PHASE_COUNT = 5;
    private static final int SECTION_DATA = 0;
    private static final int SECTION_MONITOR = 1;
    private static final int SECTION_NOTICES = 2;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_SELECT_SECTION.equals(action)) {
            int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            int section = intent.getIntExtra(EXTRA_SECTION, SECTION_DATA);
            final PendingResult result = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    savePhase(context, appWidgetId, phaseForSection(section), System.currentTimeMillis());
                    refreshWidget(context, appWidgetId);
                    scheduleRefresh(context);
                } finally {
                    result.finish();
                }
            });
            return;
        }

        if (ACTION_NEXT_PHASE.equals(action)) {
            int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            final PendingResult result = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    advancePhase(context, appWidgetId);
                    refreshWidget(context, appWidgetId);
                    scheduleRefresh(context);
                } finally {
                    result.finish();
                }
            });
            return;
        }

        if (ACTION_PREV_PHASE.equals(action)) {
            int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            final PendingResult result = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    previousPhase(context, appWidgetId);
                    refreshWidget(context, appWidgetId);
                    scheduleRefresh(context);
                } finally {
                    result.finish();
                }
            });
            return;
        }

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
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        startRealtimeServiceSafely(context);
        scheduleRefresh(context);
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

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        for (int appWidgetId : appWidgetIds) {
            editor.remove(PREF_PHASE_PREFIX + appWidgetId);
            editor.remove(PREF_PHASE_STARTED_PREFIX + appWidgetId);
        }
        editor.apply();
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

    private void refreshAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, AlertFullDataWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(provider);
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        WidgetData data = fetchData(context);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId, data);
        }
    }

    private void refreshWidget(Context context, int appWidgetId) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            refreshAllWidgets(context);
            return;
        }
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        updateWidget(context, appWidgetManager, appWidgetId, fetchData(context));
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, WidgetData data) {
        int phase = resolvePhase(context, appWidgetId, System.currentTimeMillis());
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_alert_full_data);
        views.setImageViewBitmap(R.id.widget_alert_full_data_canvas, renderWidget(context, data, phase));
        views.setOnClickPendingIntent(R.id.widget_alert_full_data_button_data, sectionPendingIntent(context, appWidgetId, SECTION_DATA));
        views.setOnClickPendingIntent(R.id.widget_alert_full_data_button_monitor, sectionPendingIntent(context, appWidgetId, SECTION_MONITOR));
        views.setOnClickPendingIntent(R.id.widget_alert_full_data_button_notice, sectionPendingIntent(context, appWidgetId, SECTION_NOTICES));
        views.setOnClickPendingIntent(R.id.widget_alert_full_data_prev, previousPendingIntent(context, appWidgetId));
        views.setOnClickPendingIntent(R.id.widget_alert_full_data_next, nextPendingIntent(context, appWidgetId));
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private WidgetData fetchData(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String datasetJson = prefs.getString(PREF_DATASET, "");
        String deviceJson = prefs.getString(PREF_DEVICE, "");
        String apkUpdateJson = prefs.getString(PREF_APK_UPDATE, "");

        try {
            datasetJson = fetchJson(FIREBASE_DATASET_URL);
            prefs.edit().putString(PREF_DATASET, datasetJson).apply();
        } catch (Exception ignored) {
        }

        try {
            deviceJson = fetchJson(FIREBASE_DEVICE_URL);
            prefs.edit().putString(PREF_DEVICE, deviceJson).apply();
        } catch (Exception ignored) {
        }

        try {
            apkUpdateJson = fetchJson(FIREBASE_APK_UPDATE_URL);
            prefs.edit().putString(PREF_APK_UPDATE, apkUpdateJson).apply();
        } catch (Exception ignored) {
        }

        TrafficSnapshot snapshot;
        try {
            snapshot = TrafficSnapshot.fromJson(datasetJson, deviceJson, apkUpdateJson, localVersionCode(context));
        } catch (Exception ignored) {
            snapshot = TrafficSnapshot.fallback();
        }
        List<HistoryPoint> history = updateHistory(prefs, snapshot, System.currentTimeMillis());
        return new WidgetData(snapshot, history);
    }

    private int localVersionCode(Context context) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                return (int) context.getPackageManager().getPackageInfo(context.getPackageName(), 0).getLongVersionCode();
            }
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (Exception ignored) {
            return 1;
        }
    }

    private String fetchJson(String url) throws Exception {
        String separator = url.contains("?") ? "&" : "?";
        HttpURLConnection connection = (HttpURLConnection) new URL(url + separator + "ts=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(8_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setUseCaches(false);
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            connection.disconnect();
            throw new IllegalStateException("Firebase HTTP " + code);
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            return body.toString();
        } finally {
            connection.disconnect();
        }
    }

    private List<HistoryPoint> updateHistory(SharedPreferences prefs, TrafficSnapshot snapshot, long now) {
        List<HistoryPoint> history = loadHistory(prefs.getString(PREF_HISTORY, ""));
        HistoryPoint point = new HistoryPoint(now, snapshot.vehicleCount(), snapshot.trafficDurationSec, snapshot.trafficColor);
        if (!history.isEmpty() && now - history.get(history.size() - 1).time < 8_000L) {
            history.set(history.size() - 1, point);
        } else {
            history.add(point);
        }
        while (history.size() > 18) history.remove(0);

        JSONArray array = new JSONArray();
        for (HistoryPoint item : history) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("time", item.time);
                obj.put("vehicle", item.vehicle);
                obj.put("duration", item.duration);
                obj.put("color", item.color);
                array.put(obj);
            } catch (JSONException ignored) {
            }
        }
        prefs.edit().putString(PREF_HISTORY, array.toString()).apply();
        return history;
    }

    private List<HistoryPoint> loadHistory(String raw) {
        List<HistoryPoint> history = new ArrayList<>();
        if (TextUtils.isEmpty(raw)) return history;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                history.add(new HistoryPoint(
                    obj.optLong("time", 0L),
                    obj.optInt("vehicle", 0),
                    obj.optInt("duration", 0),
                    obj.optString("color", "red")
                ));
            }
        } catch (JSONException ignored) {
        }
        return history;
    }

    private Bitmap renderWidget(Context context, WidgetData data, int phase) {
        Bitmap output = Bitmap.createBitmap(CANVAS_WIDTH, CANVAS_HEIGHT, Bitmap.Config.ARGB_8888);
        output.eraseColor(Color.TRANSPARENT);
        Canvas canvas = new Canvas(output);
        long now = System.currentTimeMillis();
        int activeSection = sectionForPhase(phase);

        drawBase(canvas, context, data.snapshot, activeSection, now);
        if (phase == PHASE_DATA_COUNTS) {
            drawVehicleData(canvas, data.snapshot, now);
        } else if (phase == PHASE_DATA_CHARTS) {
            drawCharts(canvas, data.history, data.snapshot);
        } else if (phase == PHASE_CAMERA_ONE || phase == PHASE_CAMERA_TWO) {
            drawCamera(canvas, context, data.snapshot, phase, now);
        } else {
            drawNotices(canvas, data.snapshot, now);
        }
        return output;
    }

    private void drawBase(Canvas canvas, Context context, TrafficSnapshot snapshot, int activeSection, long now) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 6; i++) {
            paint.setColor(Color.argb(28 - i * 3, 20, 46, 90));
            RectF shadow = new RectF(34 + i, 36 + i, 1248 + i, 612 + i);
            canvas.drawRoundRect(shadow, 42f, 42f, paint);
        }

        RectF card = new RectF(32f, 28f, 1248f, 608f);
        paint.setColor(0xFDFEFFFF);
        canvas.drawRoundRect(card, 42f, 42f, paint);

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(0xFFE7EEF8);
        line.setStrokeWidth(2f);
        canvas.drawLine(184f, 104f, 184f, 590f, line);
        canvas.drawLine(184f, 104f, 1222f, 104f, line);

        Paint title = textPaint(0xFF16233D, 38f, true);
        canvas.drawText("ITS", 72f, 76f, title);

        boolean online = snapshot.raspberryOnline(now);
        Paint statusPaint = textPaint(online ? 0xFF1D9A5B : 0xFF64748B, 23f, true);
        Paint detailPaint = textPaint(0xFF94A3B8, 17f, false);
        drawVectorIcon(context, canvas, R.drawable.ic_alert_full_data_sync, 1018f, 61f, 54f, online ? 0xFF2F80ED : 0xFF94A3B8);
        canvas.drawText(online ? "Online" : "Offline", 1060f, 56f, statusPaint);
        if (!online) {
            canvas.drawText(ellipsize(snapshot.lastOnlineShort(), detailPaint, 170f), 1060f, 80f, detailPaint);
        }

        drawSidebarButton(canvas, context, new RectF(48f, 122f, 184f, 224f), "Data", R.drawable.ic_alert_full_data_car, 0xFF2F80ED, activeSection == SECTION_DATA);
        drawSidebarButton(canvas, context, new RectF(48f, 274f, 184f, 376f), "Pemantauan", R.drawable.ic_alert_full_data_camera, 0xFF14B8A6, activeSection == SECTION_MONITOR);
        drawSidebarButton(canvas, context, new RectF(48f, 426f, 184f, 528f), "Pemberitahuan", R.drawable.ic_alert_full_data_bell, 0xFFFF8A3D, activeSection == SECTION_NOTICES);
    }

    private void drawSidebarButton(Canvas canvas, Context context, RectF rect, String label, int iconRes, int color, boolean active) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (active) {
            paint.setColor(0xFFEFF7FF);
            Path tab = leftTabPath(rect, 24f);
            canvas.drawPath(tab, paint);
            tab.reset();
            paint.setColor(color);
            canvas.drawRoundRect(new RectF(rect.left, rect.top + 18f, rect.left + 7f, rect.bottom - 18f), 5f, 5f, paint);
        }

        int iconColor = active ? color : 0xFF94A3B8;
        float cx = rect.centerX();
        float cy = rect.top + 34f;
        drawVectorIcon(context, canvas, iconRes, cx, cy, 50f, iconColor);

        float labelSize = label.length() > 11 ? 13f : (label.length() > 7 ? 15f : 22f);
        Paint labelPaint = textPaint(active ? color : 0xFF8A97AB, labelSize, true);
        labelPaint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(label, cx, rect.bottom - 16f, labelPaint);
    }

    private void drawVehicleData(Canvas canvas, TrafficSnapshot snapshot, long now) {
        Paint title = textPaint(0xFF16233D, 36f, true);
        canvas.drawText("Data kendaraan", 224f, 154f, title);
        Paint sub = textPaint(0xFF64748B, 22f, false);
        canvas.drawText(snapshot.raspberryOnline(now) ? "Realtime Raspberry Pi" : "Data terakhir saat offline", 224f, 184f, sub);
        drawDataDots(canvas, 1184f, 154f, true);

        StatCard[] cards = new StatCard[] {
            new StatCard("Mobil", snapshot.car, "car", 0xFFFF9F35),
            new StatCard("Motor", snapshot.motorcycle, "motor", 0xFF2F80ED),
            new StatCard("Bus", snapshot.bus, "bus", 0xFF22C55E),
            new StatCard("Truck", snapshot.truck, "truck", 0xFF8B5CF6),
            new StatCard("Sepeda", snapshot.bicycle, "bike", 0xFF14B8A6),
            new StatCard("Jumlah", snapshot.vehicleCount(), "total", 0xFFF43F5E)
        };
        float startX = 224f;
        float startY = 220f;
        float width = 306f;
        float height = 136f;
        float gapX = 32f;
        float gapY = 26f;
        for (int i = 0; i < cards.length; i++) {
            int col = i % 3;
            int row = i / 3;
            RectF rect = new RectF(startX + col * (width + gapX), startY + row * (height + gapY), startX + col * (width + gapX) + width, startY + row * (height + gapY) + height);
            drawStatCard(canvas, rect, cards[i]);
        }
    }

    private void drawStatCard(Canvas canvas, RectF rect, StatCard card) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFF8FBFF);
        canvas.drawRoundRect(rect, 24f, 24f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(0xFFE1EAF5);
        canvas.drawRoundRect(rect, 24f, 24f, paint);
        paint.setStyle(Paint.Style.FILL);

        paint.setColor(card.color);
        canvas.drawCircle(rect.left + 60f, rect.centerY(), 34f, paint);
        if ("car".equals(card.icon)) drawCarIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);
        if ("motor".equals(card.icon)) drawMotorIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);
        if ("bus".equals(card.icon)) drawBusIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);
        if ("truck".equals(card.icon)) drawTruckIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);
        if ("bike".equals(card.icon)) drawBikeIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);
        if ("total".equals(card.icon)) drawTotalIcon(canvas, rect.left + 60f, rect.centerY(), 0.55f, Color.WHITE);

        Paint value = textPaint(0xFF16233D, 42f, true);
        canvas.drawText(String.valueOf(card.value), rect.left + 118f, rect.top + 62f, value);
        Paint label = textPaint(0xFF64748B, 23f, false);
        canvas.drawText(card.label, rect.left + 118f, rect.top + 100f, label);
    }

    private void drawCharts(Canvas canvas, List<HistoryPoint> history, TrafficSnapshot snapshot) {
        Paint title = textPaint(0xFF16233D, 36f, true);
        canvas.drawText("Grafik realtime", 224f, 154f, title);
        Paint sub = textPaint(0xFF64748B, 22f, false);
        canvas.drawText("X jumlah kendaraan, Y durasi traffic", 224f, 184f, sub);
        drawDataDots(canvas, 1184f, 154f, false);

        List<HistoryPoint> points = new ArrayList<>(history);
        if (points.isEmpty()) {
            points.add(new HistoryPoint(System.currentTimeMillis(), snapshot.vehicleCount(), snapshot.trafficDurationSec, snapshot.trafficColor));
        }
        drawTrafficLiveChart(canvas, new RectF(224f, 214f, 1178f, 574f), points);
    }

    private void drawTrafficLiveChart(Canvas canvas, RectF rect, List<HistoryPoint> points) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFFFFFFF);
        canvas.drawRoundRect(rect, 24f, 24f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(0xFFE1EAF5);
        canvas.drawRoundRect(rect, 24f, 24f, paint);
        paint.setStyle(Paint.Style.FILL);

        Paint title = textPaint(0xFF16233D, 21f, true);
        canvas.drawText("Traffic merah / kuning / hijau", rect.left + 30f, rect.top + 38f, title);
        drawLegend(canvas, rect.right - 272f, rect.top + 32f, "Merah", 0xFFEF4444);
        drawLegend(canvas, rect.right - 174f, rect.top + 32f, "Kuning", 0xFFFACC15);
        drawLegend(canvas, rect.right - 72f, rect.top + 32f, "Hijau", 0xFF22C55E);

        float left = rect.left + 94f;
        float top = rect.top + 74f;
        float right = rect.right - 38f;
        float bottom = rect.bottom - 62f;
        int maxX = 1;
        int maxY = 10;
        for (HistoryPoint point : points) {
            maxX = Math.max(maxX, point.vehicle);
            maxY = Math.max(maxY, point.duration);
        }

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(0xFFE7EEF8);
        grid.setStrokeWidth(2f);
        for (int i = 0; i < 5; i++) {
            float y = top + (bottom - top) * i / 4f;
            canvas.drawLine(left, y, right, y, grid);
        }

        Paint axis = new Paint(Paint.ANTI_ALIAS_FLAG);
        axis.setColor(0xFF94A3B8);
        axis.setStrokeWidth(3f);
        canvas.drawLine(left, top, left, bottom, axis);
        canvas.drawLine(left, bottom, right, bottom, axis);

        Paint axisText = textPaint(0xFF64748B, 17f, false);
        canvas.drawText(String.valueOf(maxY), rect.left + 28f, top + 7f, axisText);
        canvas.drawText(String.valueOf(maxY / 2), rect.left + 28f, top + (bottom - top) / 2f + 7f, axisText);
        canvas.drawText("0", rect.left + 38f, bottom + 7f, axisText);
        canvas.drawText("Y: Durasi traffic (dtk)", left, rect.top + 62f, axisText);
        canvas.drawText("X: Jumlah kendaraan", left, rect.bottom - 18f, axisText);

        Path area = new Path();
        Path line = new Path();
        for (int i = 0; i < points.size(); i++) {
            HistoryPoint point = points.get(i);
            float x = left + (point.vehicle / (float) maxX) * (right - left);
            float y = bottom - (point.duration / (float) maxY) * (bottom - top);
            if (i == 0) {
                area.moveTo(x, bottom);
                area.lineTo(x, y);
                line.moveTo(x, y);
            } else {
                area.lineTo(x, y);
                line.lineTo(x, y);
            }
        }
        HistoryPoint last = points.get(points.size() - 1);
        float lastX = left + (last.vehicle / (float) maxX) * (right - left);
        area.lineTo(lastX, bottom);
        area.close();
        Paint areaPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        areaPaint.setColor(0x182F80ED);
        canvas.drawPath(area, areaPaint);

        Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(5f);
        linePaint.setStrokeCap(Paint.Cap.ROUND);
        linePaint.setStrokeJoin(Paint.Join.ROUND);
        if (points.size() == 1) {
            HistoryPoint point = points.get(0);
            linePaint.setColor(colorForTraffic(point.color));
            float x = left + (point.vehicle / (float) maxX) * (right - left);
            float y = bottom - (point.duration / (float) maxY) * (bottom - top);
            canvas.drawCircle(x, y, 9f, linePaint);
        } else {
            for (int i = 1; i < points.size(); i++) {
                HistoryPoint previous = points.get(i - 1);
                HistoryPoint current = points.get(i);
                float x1 = left + (previous.vehicle / (float) maxX) * (right - left);
                float y1 = bottom - (previous.duration / (float) maxY) * (bottom - top);
                float x2 = left + (current.vehicle / (float) maxX) * (right - left);
                float y2 = bottom - (current.duration / (float) maxY) * (bottom - top);
                linePaint.setColor(colorForTraffic(current.color));
                canvas.drawLine(x1, y1, x2, y2, linePaint);
            }
        }

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint dotRing = new Paint(Paint.ANTI_ALIAS_FLAG);
        dotRing.setStyle(Paint.Style.STROKE);
        dotRing.setStrokeWidth(3f);
        dotRing.setColor(0xFFFFFFFF);
        for (HistoryPoint point : points) {
            float x = left + (point.vehicle / (float) maxX) * (right - left);
            float y = bottom - (point.duration / (float) maxY) * (bottom - top);
            dot.setColor(colorForTraffic(point.color));
            canvas.drawCircle(x, y, 8f, dot);
            canvas.drawCircle(x, y, 8f, dotRing);
        }
    }

    private void drawSingleLineChart(Canvas canvas, RectF rect, String title, List<HistoryPoint> history, int color, String mode) {
        drawChartPanel(canvas, rect, title);
        float left = rect.left + 150f;
        float top = rect.top + 18f;
        float right = rect.right - 26f;
        float bottom = rect.bottom - 18f;
        int max = 1;
        for (HistoryPoint item : history) {
            int value = "duration".equals(mode) ? item.duration : item.vehicle;
            max = Math.max(max, value);
        }
        drawChartGrid(canvas, left, top, right, bottom);
        Path path = new Path();
        for (int i = 0; i < history.size(); i++) {
            int value = "duration".equals(mode) ? history.get(i).duration : history.get(i).vehicle;
            float x = history.size() == 1 ? left : left + (right - left) * i / (history.size() - 1f);
            float y = bottom - (bottom - top) * value / max;
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(color);
        canvas.drawPath(path, paint);
    }

    private void drawTrafficColorChart(Canvas canvas, RectF rect, List<HistoryPoint> history) {
        drawChartPanel(canvas, rect, "Traffic merah / kuning / hijau");
        float left = rect.left + 150f;
        float top = rect.top + 18f;
        float right = rect.right - 26f;
        float bottom = rect.bottom - 18f;
        int max = 1;
        for (HistoryPoint item : history) max = Math.max(max, item.duration);
        drawChartGrid(canvas, left, top, right, bottom);
        drawColorLine(canvas, history, left, top, right, bottom, max, "red", 0xFFEF4444);
        drawColorLine(canvas, history, left, top, right, bottom, max, "yellow", 0xFFFACC15);
        drawColorLine(canvas, history, left, top, right, bottom, max, "green", 0xFF22C55E);
        drawLegend(canvas, rect.right - 260f, rect.top + 28f, "Merah", 0xFFEF4444);
        drawLegend(canvas, rect.right - 170f, rect.top + 28f, "Kuning", 0xFFFACC15);
        drawLegend(canvas, rect.right - 70f, rect.top + 28f, "Hijau", 0xFF22C55E);
    }

    private void drawColorLine(Canvas canvas, List<HistoryPoint> history, float left, float top, float right, float bottom, int max, String colorName, int color) {
        Path path = new Path();
        for (int i = 0; i < history.size(); i++) {
            HistoryPoint item = history.get(i);
            int value = colorName.equalsIgnoreCase(item.color) ? item.duration : 0;
            float x = history.size() == 1 ? left : left + (right - left) * i / (history.size() - 1f);
            float y = bottom - (bottom - top) * value / Math.max(1, max);
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(4f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(color);
        canvas.drawPath(path, paint);
    }

    private void drawChartPanel(Canvas canvas, RectF rect, String title) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFF8FBFF);
        canvas.drawRoundRect(rect, 20f, 20f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(0xFFE1EAF5);
        canvas.drawRoundRect(rect, 20f, 20f, paint);
        paint.setStyle(Paint.Style.FILL);
        Paint titlePaint = textPaint(0xFF16233D, 20f, true);
        canvas.drawText(title, rect.left + 22f, rect.top + 38f, titlePaint);
    }

    private void drawChartGrid(Canvas canvas, float left, float top, float right, float bottom) {
        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(0xFFE7EEF8);
        grid.setStrokeWidth(1.4f);
        for (int i = 0; i < 4; i++) {
            float y = top + (bottom - top) * i / 3f;
            canvas.drawLine(left, y, right, y, grid);
        }
    }

    private void drawLegend(Canvas canvas, float x, float y, String label, int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        canvas.drawCircle(x, y, 7f, paint);
        Paint text = textPaint(0xFF334155, 17f, true);
        canvas.drawText(label, x + 12f, y + 6f, text);
    }

    private int colorForTraffic(String color) {
        if ("green".equalsIgnoreCase(color)) return 0xFF22C55E;
        if ("yellow".equalsIgnoreCase(color)) return 0xFFFACC15;
        return 0xFFEF4444;
    }

    private void drawCamera(Canvas canvas, Context context, TrafficSnapshot snapshot, int phase, long now) {
        boolean online = snapshot.raspberryOnline(now);
        int imageIndex = phase == PHASE_CAMERA_TWO ? 1 : 0;
        Bitmap image = online ? decodeImageValue(snapshot.imageForIndex(imageIndex)) : null;
        boolean hasCameraFrame = image != null;
        if (!hasCameraFrame) image = loadFallbackBitmap(context);

        RectF imageRect = new RectF(224f, 128f, 1218f, 574f);
        DrawInfo drawInfo = drawRoundedImage(canvas, image, imageRect, 28f);
        if (online && hasCameraFrame) drawDetectionBoxes(canvas, snapshot, drawInfo);

        Paint overlay = new Paint(Paint.ANTI_ALIAS_FLAG);
        overlay.setShader(new LinearGradient(0, imageRect.top, 0, imageRect.top + 140f, 0xB8000000, 0x00000000, Shader.TileMode.CLAMP));
        Path clip = roundedPath(imageRect, 28f);
        canvas.save();
        canvas.clipPath(clip);
        canvas.drawRect(imageRect, overlay);
        canvas.restore();
        clip.reset();

        Paint title = textPaint(Color.WHITE, 34f, true);
        canvas.drawText("Pemantauan", imageRect.left + 28f, imageRect.top + 54f, title);
        Paint sub = textPaint(0xFFE2E8F0, 21f, false);
        String label = "Gambar " + (imageIndex + 1) + " dari 2 - " + (online ? "kamera online" : "offline");
        canvas.drawText(label, imageRect.left + 28f, imageRect.top + 86f, sub);
        drawMonitorDots(canvas, imageRect.right - 62f, imageRect.top + 58f, imageIndex);
    }

    private DrawInfo drawRoundedImage(Canvas canvas, Bitmap image, RectF rect, float radius) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        paint.setColor(0xFFDBEAFE);
        canvas.drawRoundRect(rect, radius, radius, paint);
        if (image == null) return new DrawInfo(rect, CANVAS_WIDTH, CANVAS_HEIGHT);
        float scale = Math.max(rect.width() / image.getWidth(), rect.height() / image.getHeight());
        float width = image.getWidth() * scale;
        float height = image.getHeight() * scale;
        float left = rect.left + (rect.width() - width) / 2f;
        float top = rect.top + (rect.height() - height) / 2f;
        RectF dst = new RectF(left, top, left + width, top + height);
        Path path = roundedPath(rect, radius);
        canvas.save();
        canvas.clipPath(path);
        canvas.drawBitmap(image, null, dst, paint);
        canvas.restore();
        path.reset();
        return new DrawInfo(dst, image.getWidth(), image.getHeight());
    }

    private void drawDetectionBoxes(Canvas canvas, TrafficSnapshot snapshot, DrawInfo drawInfo) {
        if (snapshot.detections.isEmpty()) return;
        int sourceWidth = snapshot.detectorFrameWidth > 0 ? snapshot.detectorFrameWidth : drawInfo.sourceWidth;
        int sourceHeight = snapshot.detectorFrameHeight > 0 ? snapshot.detectorFrameHeight : drawInfo.sourceHeight;
        if (sourceWidth <= 0 || sourceHeight <= 0) return;
        Paint box = new Paint(Paint.ANTI_ALIAS_FLAG);
        box.setStyle(Paint.Style.STROKE);
        box.setStrokeWidth(4f);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint text = textPaint(Color.WHITE, 18f, true);
        for (Detection detection : snapshot.detections) {
            int color = colorForLabel(detection.label);
            box.setColor(color);
            fill.setColor(color);
            float left = drawInfo.rect.left + (float) (detection.x / sourceWidth) * drawInfo.rect.width();
            float top = drawInfo.rect.top + (float) (detection.y / sourceHeight) * drawInfo.rect.height();
            float right = left + (float) (detection.width / sourceWidth) * drawInfo.rect.width();
            float bottom = top + (float) (detection.height / sourceHeight) * drawInfo.rect.height();
            RectF rect = new RectF(left, top, right, bottom);
            canvas.drawRoundRect(rect, 8f, 8f, box);
            String label = detection.label + " " + Math.round(detection.confidence * 100d) + "%";
            float textWidth = text.measureText(label) + 18f;
            RectF tag = new RectF(left, Math.max(drawInfo.rect.top + 4f, top - 30f), left + textWidth, Math.max(drawInfo.rect.top + 32f, top - 2f));
            canvas.drawRoundRect(tag, 8f, 8f, fill);
            canvas.drawText(label, tag.left + 9f, tag.bottom - 8f, text);
        }
    }

    private void drawNotices(Canvas canvas, TrafficSnapshot snapshot, long now) {
        Paint title = textPaint(0xFF16233D, 36f, true);
        canvas.drawText("Pemberitahuan", 224f, 154f, title);
        Paint sub = textPaint(0xFF64748B, 22f, false);
        canvas.drawText("Log terbaru agar pengguna tidak tertinggal informasi", 224f, 184f, sub);

        List<NoticeItem> notices = buildNotices(snapshot, now);
        if (notices.isEmpty()) {
            drawEmptyNotices(canvas);
            return;
        }

        float y = 220f;
        for (int i = 0; i < notices.size() && i < 5; i++) {
            drawNoticeRow(canvas, new RectF(224f, y, 1178f, y + 74f), notices.get(i));
            y += 86f;
        }
    }

    private void drawNoticeRow(Canvas canvas, RectF rect, NoticeItem item) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFF8FBFF);
        canvas.drawRoundRect(rect, 20f, 20f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(0xFFE1EAF5);
        canvas.drawRoundRect(rect, 20f, 20f, paint);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(item.color);
        canvas.drawCircle(rect.left + 38f, rect.centerY(), 18f, paint);

        Paint title = textPaint(0xFF16233D, 24f, true);
        canvas.drawText(item.title, rect.left + 78f, rect.top + 31f, title);
        Paint desc = textPaint(0xFF64748B, 18f, false);
        canvas.drawText(ellipsize(item.message, desc, 540f), rect.left + 78f, rect.top + 57f, desc);
        Paint time = textPaint(0xFF94A3B8, 18f, true);
        time.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(item.time, rect.right - 26f, rect.centerY() + 6f, time);
    }

    private List<NoticeItem> buildNotices(TrafficSnapshot snapshot, long now) {
        List<NoticeItem> notices = new ArrayList<>(snapshot.notices);
        boolean online = snapshot.raspberryOnline(now);
        String time = online ? "sekarang" : snapshot.lastOnlineShort();
        if (!online) {
            notices.add(new NoticeItem("Device offline", "Raspberry tidak mengirim data realtime", time, 0xFFEF4444));
        }

        if (!TextUtils.isEmpty(snapshot.cameraStatus)
            && !"online".equalsIgnoreCase(snapshot.cameraStatus)
            && !"ready".equalsIgnoreCase(snapshot.cameraStatus)) {
            notices.add(new NoticeItem("Kendala kamera", "Status kamera: " + emptyAs(snapshot.cameraStatus, "tidak tersedia"), time, 0xFFFF8A3D));
        }

        if (!snapshot.detectorOnline()) {
            String detector = emptyAs(snapshot.detectorStatus, "offline");
            if (!"online".equalsIgnoreCase(detector) && !"ok".equalsIgnoreCase(detector)) {
                notices.add(new NoticeItem("Deteksi YOLO", "Status deteksi: " + detector, time, 0xFF8B5CF6));
            }
        }

        if ("red".equalsIgnoreCase(snapshot.trafficColor) && snapshot.trafficDurationSec >= 30) {
            notices.add(new NoticeItem("Macet berat", "Traffic merah selama " + snapshot.trafficDurationSec + " detik", "sekarang", 0xFFEF4444));
        }

        return notices;
    }

    private void drawEmptyNotices(Canvas canvas) {
        RectF rect = new RectF(224f, 230f, 1178f, 548f);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFF8FBFF);
        canvas.drawRoundRect(rect, 28f, 28f, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setColor(0xFFE1EAF5);
        canvas.drawRoundRect(rect, 28f, 28f, paint);
        paint.setStyle(Paint.Style.FILL);

        float cx = rect.centerX();
        float cy = rect.centerY() - 28f;
        drawBellIcon(canvas, cx, cy, 1.5f, 0xFF94A3B8);
        Paint slash = iconPaint(0xFF94A3B8, 7f);
        canvas.drawLine(cx - 46f, cy - 42f, cx + 46f, cy + 50f, slash);

        Paint title = textPaint(0xFF16233D, 34f, true);
        title.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("Belum ada notifikasi", cx, cy + 92f, title);
        Paint sub = textPaint(0xFF64748B, 21f, false);
        sub.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("Sistem tidak menerima alert baru dari RTDB", cx, cy + 124f, sub);
    }

    private void drawDataDots(Canvas canvas, float x, float y, boolean firstActive) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(firstActive ? 0xFF2F80ED : 0xFFC7D2FE);
        canvas.drawCircle(x, y, firstActive ? 9f : 6f, paint);
        paint.setColor(firstActive ? 0xFFC7D2FE : 0xFF2F80ED);
        canvas.drawCircle(x + 28f, y, firstActive ? 6f : 9f, paint);
    }

    private void drawMonitorDots(Canvas canvas, float x, float y, int index) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(index == 0 ? Color.WHITE : 0x88FFFFFF);
        canvas.drawCircle(x, y, index == 0 ? 8f : 6f, paint);
        paint.setColor(index == 1 ? Color.WHITE : 0x88FFFFFF);
        canvas.drawCircle(x + 26f, y, index == 1 ? 8f : 6f, paint);
    }

    private void drawRefreshIcon(Canvas canvas, float cx, float cy, int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(color);
        RectF arc = new RectF(cx - 18f, cy - 18f, cx + 18f, cy + 18f);
        canvas.drawArc(arc, -35f, 285f, false, paint);
        paint.setStyle(Paint.Style.FILL);
        Path arrow = new Path();
        arrow.moveTo(cx + 22f, cy - 14f);
        arrow.lineTo(cx + 10f, cy - 19f);
        arrow.lineTo(cx + 15f, cy - 6f);
        arrow.close();
        canvas.drawPath(arrow, paint);
    }

    private void drawCarIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawLine(cx - 24f * scale, cy + 8f * scale, cx + 24f * scale, cy + 8f * scale, paint);
        canvas.drawRoundRect(new RectF(cx - 18f * scale, cy - 4f * scale, cx + 18f * scale, cy + 12f * scale), 4f, 4f, paint);
        canvas.drawLine(cx - 10f * scale, cy - 4f * scale, cx - 3f * scale, cy - 16f * scale, paint);
        canvas.drawLine(cx - 3f * scale, cy - 16f * scale, cx + 11f * scale, cy - 16f * scale, paint);
        canvas.drawLine(cx + 11f * scale, cy - 16f * scale, cx + 20f * scale, cy - 4f * scale, paint);
        canvas.drawCircle(cx - 15f * scale, cy + 14f * scale, 6f * scale, paint);
        canvas.drawCircle(cx + 17f * scale, cy + 14f * scale, 6f * scale, paint);
    }

    private void drawMotorIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawCircle(cx - 20f * scale, cy + 12f * scale, 8f * scale, paint);
        canvas.drawCircle(cx + 20f * scale, cy + 12f * scale, 8f * scale, paint);
        canvas.drawLine(cx - 20f * scale, cy + 8f * scale, cx - 2f * scale, cy - 10f * scale, paint);
        canvas.drawLine(cx - 2f * scale, cy - 10f * scale, cx + 18f * scale, cy + 9f * scale, paint);
        canvas.drawLine(cx - 2f * scale, cy - 10f * scale, cx + 20f * scale, cy - 16f * scale, paint);
        canvas.drawLine(cx + 15f * scale, cy - 16f * scale, cx + 28f * scale, cy - 16f * scale, paint);
    }

    private void drawBusIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawRoundRect(new RectF(cx - 25f * scale, cy - 18f * scale, cx + 25f * scale, cy + 18f * scale), 5f, 5f, paint);
        canvas.drawLine(cx - 25f * scale, cy - 4f * scale, cx + 25f * scale, cy - 4f * scale, paint);
        canvas.drawCircle(cx - 16f * scale, cy + 22f * scale, 5f * scale, paint);
        canvas.drawCircle(cx + 16f * scale, cy + 22f * scale, 5f * scale, paint);
    }

    private void drawTruckIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawRect(cx - 28f * scale, cy - 12f * scale, cx + 6f * scale, cy + 16f * scale, paint);
        canvas.drawRect(cx + 6f * scale, cy - 2f * scale, cx + 28f * scale, cy + 16f * scale, paint);
        canvas.drawCircle(cx - 15f * scale, cy + 20f * scale, 5f * scale, paint);
        canvas.drawCircle(cx + 18f * scale, cy + 20f * scale, 5f * scale, paint);
    }

    private void drawBikeIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawCircle(cx - 22f * scale, cy + 12f * scale, 9f * scale, paint);
        canvas.drawCircle(cx + 22f * scale, cy + 12f * scale, 9f * scale, paint);
        canvas.drawLine(cx - 22f * scale, cy + 12f * scale, cx - 4f * scale, cy - 10f * scale, paint);
        canvas.drawLine(cx - 4f * scale, cy - 10f * scale, cx + 15f * scale, cy + 12f * scale, paint);
        canvas.drawLine(cx - 22f * scale, cy + 12f * scale, cx + 15f * scale, cy + 12f * scale, paint);
        canvas.drawLine(cx - 4f * scale, cy - 10f * scale, cx + 17f * scale, cy - 10f * scale, paint);
    }

    private void drawTotalIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        canvas.drawCircle(cx - 14f * scale, cy - 12f * scale, 7f * scale, paint);
        canvas.drawCircle(cx + 10f * scale, cy - 14f * scale, 8f * scale, paint);
        canvas.drawCircle(cx + 20f * scale, cy + 8f * scale, 6f * scale, paint);
        canvas.drawCircle(cx - 4f * scale, cy + 14f * scale, 9f * scale, paint);
    }

    private void drawCameraIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawRoundRect(new RectF(cx - 26f * scale, cy - 16f * scale, cx + 24f * scale, cy + 18f * scale), 7f, 7f, paint);
        canvas.drawCircle(cx, cy, 10f * scale, paint);
        canvas.drawLine(cx + 25f * scale, cy - 6f * scale, cx + 35f * scale, cy - 14f * scale, paint);
        canvas.drawLine(cx + 25f * scale, cy + 6f * scale, cx + 35f * scale, cy + 14f * scale, paint);
    }

    private void drawBellIcon(Canvas canvas, float cx, float cy, float scale, int color) {
        Paint paint = iconPaint(color, 4f * scale);
        canvas.drawArc(new RectF(cx - 18f * scale, cy - 18f * scale, cx + 18f * scale, cy + 18f * scale), 200f, 140f, false, paint);
        canvas.drawLine(cx - 18f * scale, cy + 6f * scale, cx - 25f * scale, cy + 18f * scale, paint);
        canvas.drawLine(cx + 18f * scale, cy + 6f * scale, cx + 25f * scale, cy + 18f * scale, paint);
        canvas.drawLine(cx - 25f * scale, cy + 18f * scale, cx + 25f * scale, cy + 18f * scale, paint);
        canvas.drawCircle(cx, cy + 27f * scale, 4f * scale, paint);
    }

    private void drawVectorIcon(Context context, Canvas canvas, int resId, float cx, float cy, float size, int color) {
        Drawable drawable = context.getDrawable(resId);
        if (drawable == null) return;
        Drawable icon = drawable.mutate();
        icon.setTint(color);
        int half = Math.round(size / 2f);
        icon.setBounds(
            Math.round(cx) - half,
            Math.round(cy) - half,
            Math.round(cx) + half,
            Math.round(cy) + half
        );
        icon.draw(canvas);
    }

    private Paint iconPaint(int color, float strokeWidth) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(strokeWidth);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        return paint;
    }

    private Paint textPaint(int color, float size, boolean bold) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setColor(color);
        paint.setTextSize(size);
        paint.setFakeBoldText(bold);
        return paint;
    }

    private String ellipsize(String text, Paint paint, float maxWidth) {
        if (text == null) return "";
        if (paint.measureText(text) <= maxWidth) return text;
        String suffix = "...";
        int count = paint.breakText(text, true, Math.max(1f, maxWidth - paint.measureText(suffix)), null);
        return text.substring(0, Math.max(0, count)) + suffix;
    }

    private Path roundedPath(RectF rect, float radius) {
        Path path = new Path();
        path.addRoundRect(rect, radius, radius, Path.Direction.CW);
        return path;
    }

    private Path leftTabPath(RectF rect, float radius) {
        Path path = new Path();
        path.moveTo(rect.right, rect.top);
        path.lineTo(rect.left + radius, rect.top);
        path.quadTo(rect.left, rect.top, rect.left, rect.top + radius);
        path.lineTo(rect.left, rect.bottom - radius);
        path.quadTo(rect.left, rect.bottom, rect.left + radius, rect.bottom);
        path.lineTo(rect.right, rect.bottom);
        path.close();
        return path;
    }

    private List<HistoryPoint> fallbackHistory(TrafficSnapshot snapshot) {
        List<HistoryPoint> history = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (int i = 5; i >= 0; i--) {
            history.add(new HistoryPoint(now - i * PHASE_DURATION_MS, Math.max(0, snapshot.vehicleCount() - i), snapshot.trafficDurationSec, snapshot.trafficColor));
        }
        return history;
    }

    private int colorForLabel(String label) {
        String value = label == null ? "" : label.toLowerCase(Locale.ROOT);
        if ("car".equals(value)) return 0xFF38BDF8;
        if ("motorcycle".equals(value)) return 0xFFA78BFA;
        if ("bus".equals(value)) return 0xFFFACC15;
        if ("truck".equals(value)) return 0xFFFB7185;
        if ("bicycle".equals(value)) return 0xFF34D399;
        return 0xFFFFFFFF;
    }

    private Bitmap decodeImageValue(String value) {
        if (TextUtils.isEmpty(value)) return null;
        String trimmed = value.trim();
        try {
            if (trimmed.startsWith("data:image")) {
                int comma = trimmed.indexOf(',');
                if (comma < 0) return null;
                byte[] bytes = Base64.decode(trimmed.substring(comma + 1), Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                return decodeUrlBitmap(trimmed);
            }
            byte[] bytes = Base64.decode(trimmed, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Bitmap decodeUrlBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setRequestProperty("User-Agent", "ITS-Alert-Full-Data-Widget");
            connection.setUseCaches(false);
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) return null;
            try (InputStream input = connection.getInputStream()) {
                return BitmapFactory.decodeStream(input);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Bitmap loadFallbackBitmap(Context context) {
        try (InputStream input = context.getAssets().open("public/bwits.png")) {
            byte[] bytes = readAllBytes(input);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        }
    }

    private byte[] readAllBytes(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        return output.toByteArray();
    }

    private int resolvePhase(Context context, int appWidgetId, long now) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int phase = prefs.getInt(PREF_PHASE_PREFIX + appWidgetId, PHASE_DATA_COUNTS);
        long started = prefs.getLong(PREF_PHASE_STARTED_PREFIX + appWidgetId, 0L);
        if (started <= 0L) {
            savePhase(context, appWidgetId, PHASE_DATA_COUNTS, now);
            return PHASE_DATA_COUNTS;
        }
        long elapsed = Math.max(0L, now - started);
        long steps = elapsed / PHASE_DURATION_MS;
        if (steps > 0L) {
            phase = (int) ((phase + steps) % PHASE_COUNT);
            started += steps * PHASE_DURATION_MS;
            savePhase(context, appWidgetId, phase, started);
        }
        return phase;
    }

    private void advancePhase(Context context, int appWidgetId) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int phase = prefs.getInt(PREF_PHASE_PREFIX + appWidgetId, PHASE_DATA_COUNTS);
        savePhase(context, appWidgetId, (phase + 1) % PHASE_COUNT, System.currentTimeMillis());
    }

    private void previousPhase(Context context, int appWidgetId) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int phase = prefs.getInt(PREF_PHASE_PREFIX + appWidgetId, PHASE_DATA_COUNTS);
        savePhase(context, appWidgetId, (phase + PHASE_COUNT - 1) % PHASE_COUNT, System.currentTimeMillis());
    }

    private void savePhase(Context context, int appWidgetId, int phase, long started) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(PREF_PHASE_PREFIX + appWidgetId, Math.max(0, Math.min(PHASE_COUNT - 1, phase)))
            .putLong(PREF_PHASE_STARTED_PREFIX + appWidgetId, started)
            .apply();
    }

    private int phaseForSection(int section) {
        if (section == SECTION_MONITOR) return PHASE_CAMERA_ONE;
        if (section == SECTION_NOTICES) return PHASE_NOTICES;
        return PHASE_DATA_COUNTS;
    }

    private int sectionForPhase(int phase) {
        if (phase == PHASE_CAMERA_ONE || phase == PHASE_CAMERA_TWO) return SECTION_MONITOR;
        if (phase == PHASE_NOTICES) return SECTION_NOTICES;
        return SECTION_DATA;
    }

    private PendingIntent sectionPendingIntent(Context context, int appWidgetId, int section) {
        Intent intent = new Intent(context, AlertFullDataWidgetProvider.class);
        intent.setAction(ACTION_SELECT_SECTION);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.putExtra(EXTRA_SECTION, section);
        intent.setData(Uri.parse("its://alert-full-data/select/" + appWidgetId + "/" + section));
        return PendingIntent.getBroadcast(
            context,
            6100 + appWidgetId * 10 + section,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent nextPendingIntent(Context context, int appWidgetId) {
        Intent intent = new Intent(context, AlertFullDataWidgetProvider.class);
        intent.setAction(ACTION_NEXT_PHASE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.setData(Uri.parse("its://alert-full-data/next/" + appWidgetId));
        return PendingIntent.getBroadcast(
            context,
            6200 + appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent previousPendingIntent(Context context, int appWidgetId) {
        Intent intent = new Intent(context, AlertFullDataWidgetProvider.class);
        intent.setAction(ACTION_PREV_PHASE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.setData(Uri.parse("its://alert-full-data/prev/" + appWidgetId));
        return PendingIntent.getBroadcast(
            context,
            6250 + appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, AlertFullDataWidgetProvider.class);
        intent.setAction(ACTION_REFRESH_WIDGET);
        intent.setData(Uri.parse("its://alert-full-data/refresh"));
        return PendingIntent.getBroadcast(
            context,
            6301,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void scheduleRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        long triggerAt = System.currentTimeMillis() + REFRESH_INTERVAL_MS;
        try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, refreshPendingIntent(context));
        } catch (SecurityException se) {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, refreshPendingIntent(context));
        }
    }

    private void cancelRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        alarmManager.cancel(refreshPendingIntent(context));
    }

    private void startRealtimeServiceSafely(Context context) {
        try {
            WidgetRealtimeService.start(context);
        } catch (RuntimeException err) {
            System.out.println("[ITS] Alert Full Data widget realtime service skipped: " + err.getMessage());
        }
    }

    private String emptyAs(String value, String fallback) {
        return TextUtils.isEmpty(value) ? fallback : value;
    }

    private static final class WidgetData {
        final TrafficSnapshot snapshot;
        final List<HistoryPoint> history;

        WidgetData(TrafficSnapshot snapshot, List<HistoryPoint> history) {
            this.snapshot = snapshot;
            this.history = history == null ? new ArrayList<>() : history;
        }
    }

    private static final class DrawInfo {
        final RectF rect;
        final int sourceWidth;
        final int sourceHeight;

        DrawInfo(RectF rect, int sourceWidth, int sourceHeight) {
            this.rect = rect;
            this.sourceWidth = sourceWidth;
            this.sourceHeight = sourceHeight;
        }
    }

    private static final class HistoryPoint {
        final long time;
        final int vehicle;
        final int duration;
        final String color;

        HistoryPoint(long time, int vehicle, int duration, String color) {
            this.time = time;
            this.vehicle = Math.max(0, vehicle);
            this.duration = Math.max(0, duration);
            this.color = TextUtils.isEmpty(color) ? "red" : color;
        }
    }

    private static final class NoticeItem {
        final String title;
        final String message;
        final String time;
        final int color;

        NoticeItem(String title, String message, String time, int color) {
            this.title = title;
            this.message = message;
            this.time = time;
            this.color = color;
        }
    }

    private static final class StatCard {
        final String label;
        final int value;
        final String icon;
        final int color;

        StatCard(String label, int value, String icon, int color) {
            this.label = label;
            this.value = Math.max(0, value);
            this.icon = icon;
            this.color = color;
        }
    }

    private static final class Detection {
        final String label;
        final double confidence;
        final double x;
        final double y;
        final double width;
        final double height;

        Detection(String label, double confidence, double x, double y, double width, double height) {
            this.label = TextUtils.isEmpty(label) ? "object" : label;
            this.confidence = confidence;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
    }

    private static final class TrafficSnapshot {
        final String nama1;
        final String nama2;
        final String status;
        final String cameraStatus;
        final String detectorStatus;
        final String trafficColor;
        final int trafficDurationSec;
        final String locationLabel;
        final String source;
        final long updatedAt;
        final String lastSeenText;
        final int detectorFrameWidth;
        final int detectorFrameHeight;
        final int car;
        final int motorcycle;
        final int bus;
        final int truck;
        final int bicycle;
        final int total;
        final List<Detection> detections;
        final List<NoticeItem> notices;

        TrafficSnapshot(
            String nama1,
            String nama2,
            String status,
            String cameraStatus,
            String detectorStatus,
            String trafficColor,
            int trafficDurationSec,
            String locationLabel,
            String source,
            long updatedAt,
            String lastSeenText,
            int detectorFrameWidth,
            int detectorFrameHeight,
            int car,
            int motorcycle,
            int bus,
            int truck,
            int bicycle,
            int total,
            List<Detection> detections,
            List<NoticeItem> notices
        ) {
            this.nama1 = nama1;
            this.nama2 = nama2;
            this.status = status;
            this.cameraStatus = cameraStatus;
            this.detectorStatus = detectorStatus;
            this.trafficColor = trafficColor;
            this.trafficDurationSec = Math.max(0, trafficDurationSec);
            this.locationLabel = locationLabel;
            this.source = source;
            this.updatedAt = updatedAt;
            this.lastSeenText = lastSeenText;
            this.detectorFrameWidth = detectorFrameWidth;
            this.detectorFrameHeight = detectorFrameHeight;
            this.car = Math.max(0, car);
            this.motorcycle = Math.max(0, motorcycle);
            this.bus = Math.max(0, bus);
            this.truck = Math.max(0, truck);
            this.bicycle = Math.max(0, bicycle);
            this.total = Math.max(0, total);
            this.detections = detections == null ? new ArrayList<>() : detections;
            this.notices = notices == null ? new ArrayList<>() : notices;
        }

        static TrafficSnapshot fallback() {
            return new TrafficSnapshot("", "", "offline", "offline", "offline", "red", 0, "Sistem offline", "fallback", 0L, "", 0, 0, 0, 0, 0, 0, 0, 0, new ArrayList<>(), new ArrayList<>());
        }

        static TrafficSnapshot fromJson(String datasetRaw, String deviceRaw, String apkUpdateRaw, int localVersionCode) throws JSONException {
            JSONObject dataset = parseObject(datasetRaw);
            JSONObject device = selectDevice(parseObject(deviceRaw));
            JSONObject apkUpdate = parseObject(apkUpdateRaw);
            if (dataset == null) dataset = new JSONObject();
            if (device == null) device = new JSONObject();

            JSONObject datasetBreakdown = dataset.optJSONObject("vehicleBreakdown");
            JSONObject deviceBreakdown = device.optJSONObject("vehicleBreakdown");
            JSONObject breakdown = datasetBreakdown != null ? datasetBreakdown : deviceBreakdown;
            int car = optInt(breakdown, "car", 0);
            int motorcycle = optInt(breakdown, "motorcycle", 0);
            int bus = optInt(breakdown, "bus", 0);
            int truck = optInt(breakdown, "truck", 0);
            int bicycle = optInt(breakdown, "bicycle", 0);
            int total = dataset.optInt("vehicleCount", device.optInt("vehicleCount", car + motorcycle + bus + truck + bicycle));

            JSONArray detectionArray = dataset.optJSONArray("detections");
            if (detectionArray == null || detectionArray.length() == 0) detectionArray = device.optJSONArray("detections");

            List<NoticeItem> notices = parseNoticeItems(dataset, device);
            appendApkUpdateNotice(notices, apkUpdate, localVersionCode);

            return new TrafficSnapshot(
                firstNonEmpty(dataset.optString("image1", ""), firstNonEmpty(dataset.optString("gambar1", ""), firstNonEmpty(dataset.optString("nama1", ""), dataset.optString("snapshot1Url", "")))),
                firstNonEmpty(dataset.optString("image2", ""), firstNonEmpty(dataset.optString("gambar2", ""), firstNonEmpty(dataset.optString("nama2", ""), dataset.optString("snapshot2Url", "")))),
                firstNonEmpty(device.optString("status", ""), "offline"),
                firstNonEmpty(device.optString("cameraStatus", ""), dataset.optString("cameraStatus", "")),
                firstNonEmpty(dataset.optString("detectorStatus", ""), device.optString("detectorStatus", "")),
                firstNonEmpty(dataset.optString("trafficColor", ""), device.optString("trafficColor", "red")),
                dataset.optInt("trafficDurationSec", device.optInt("trafficDurationSec", 0)),
                firstNonEmpty(dataset.optString("locationLabel", ""), firstNonEmpty(device.optString("locationLabel", ""), device.optString("roadName", "Lokasi sistem"))),
                firstNonEmpty(dataset.optString("source", ""), "raspberry-camera"),
                normalizeEpoch(dataset.optLong("updatedAt", device.optLong("lastSeen", 0L))),
                device.optString("lastSeenText", ""),
                dataset.optInt("detectorFrameWidth", device.optInt("detectorFrameWidth", 0)),
                dataset.optInt("detectorFrameHeight", device.optInt("detectorFrameHeight", 0)),
                car,
                motorcycle,
                bus,
                truck,
                bicycle,
                total,
                parseDetections(detectionArray),
                notices
            );
        }

        String imageForIndex(int index) {
            String selected = index == 1 ? nama2 : nama1;
            if (!TextUtils.isEmpty(selected)) return selected;
            return index == 1 ? nama1 : nama2;
        }

        int vehicleCount() {
            return total > 0 ? total : car + motorcycle + bus + truck + bicycle;
        }

        boolean isFresh(long now) {
            return updatedAt > 0L && now - updatedAt <= STALE_AFTER_MS && updatedAt - now <= 300_000L;
        }

        boolean detectorOnline() {
            return "online".equalsIgnoreCase(detectorStatus)
                || "ok".equalsIgnoreCase(detectorStatus)
                || detectorStatus.toLowerCase(Locale.ROOT).startsWith("browser-yolo");
        }

        boolean raspberryOnline(long now) {
            return isFresh(now)
                && ("online".equalsIgnoreCase(status)
                    || "online".equalsIgnoreCase(cameraStatus)
                    || detectorOnline());
        }

        String locationLabel() {
            return TextUtils.isEmpty(locationLabel) ? "Lokasi sistem" : locationLabel;
        }

        String lastOnlineShort() {
            if (!TextUtils.isEmpty(lastSeenText)) return lastSeenText;
            if (updatedAt <= 0L) return "belum ada data";
            SimpleDateFormat format = new SimpleDateFormat("dd MMM HH:mm", new Locale("id", "ID"));
            return format.format(new Date(updatedAt));
        }

        private static JSONObject parseObject(String raw) {
            if (TextUtils.isEmpty(raw) || "null".equals(raw.trim())) return null;
            try {
                return new JSONObject(raw);
            } catch (JSONException ignored) {
                return null;
            }
        }

        private static JSONObject selectDevice(JSONObject root) {
            if (root == null) return null;
            if (isDevice(root)) return root;
            JSONObject byId = root.optJSONObject(PRIMARY_DEVICE_ID);
            if (byId != null) return byId;
            JSONObject devices = root.optJSONObject("devices");
            if (devices != null) {
                JSONObject nested = devices.optJSONObject(PRIMARY_DEVICE_ID);
                if (nested != null) return nested;
            }
            Iterator<String> keys = root.keys();
            while (keys.hasNext()) {
                JSONObject candidate = root.optJSONObject(keys.next());
                if (candidate != null && isDevice(candidate)) return candidate;
            }
            return root;
        }

        private static boolean isDevice(JSONObject obj) {
            return obj.has("vehicleCount") || obj.has("trafficColor") || obj.has("cameraStatus") || obj.has("position");
        }

        private static List<Detection> parseDetections(JSONArray array) {
            List<Detection> detections = new ArrayList<>();
            if (array == null) return detections;
            for (int i = 0; i < array.length() && detections.size() < 40; i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                double width = obj.optDouble("width", 0d);
                double height = obj.optDouble("height", 0d);
                if (width <= 0d || height <= 0d) continue;
                detections.add(new Detection(
                    obj.optString("label", "object"),
                    obj.optDouble("confidence", 0d),
                    obj.optDouble("x", 0d),
                    obj.optDouble("y", 0d),
                    width,
                    height
                ));
            }
            return detections;
        }

        private static List<NoticeItem> parseNoticeItems(JSONObject dataset, JSONObject device) {
            List<NoticeItem> notices = new ArrayList<>();
            for (JSONObject source : new JSONObject[] { dataset, device }) {
                if (source == null) continue;
                for (String key : new String[] { "notifications", "alerts", "events", "logs", "notices" }) {
                    JSONArray array = source.optJSONArray(key);
                    if (array == null) continue;
                    for (int i = 0; i < array.length() && notices.size() < 5; i++) {
                        JSONObject item = array.optJSONObject(i);
                        if (item == null) continue;
                        String title = firstNonEmpty(item.optString("title", ""), item.optString("type", ""));
                        String message = firstNonEmpty(item.optString("message", ""), item.optString("note", ""));
                        if (TextUtils.isEmpty(title) && TextUtils.isEmpty(message)) continue;
                        String time = firstNonEmpty(item.optString("time", ""), firstNonEmpty(item.optString("createdAtText", ""), item.optString("lastSeenText", "")));
                        if (TextUtils.isEmpty(time)) {
                            long millis = item.optLong("timestamp", item.optLong("createdAt", item.optLong("updatedAt", 0L)));
                            if (millis > 0L) {
                                time = new SimpleDateFormat("dd MMM HH:mm", new Locale("id", "ID")).format(new Date(millis));
                            } else {
                                time = "sekarang";
                            }
                        }
                        notices.add(new NoticeItem(
                            TextUtils.isEmpty(title) ? "Notifikasi" : title,
                            message,
                            time,
                            noticeColorFor(firstNonEmpty(item.optString("level", ""), item.optString("color", "")))
                        ));
                    }
                }
            }
            return notices;
        }

        private static void appendApkUpdateNotice(List<NoticeItem> notices, JSONObject apkUpdate, int localVersionCode) {
            if (apkUpdate == null) return;
            int remoteCode = apkUpdate.optInt("versionCode", 0);
            if (remoteCode <= Math.max(1, localVersionCode)) return;
            String versionName = apkUpdate.optString("versionName", "");
            String version = TextUtils.isEmpty(versionName) ? String.valueOf(remoteCode) : versionName;
            String message = "APK ITS versi " + version + " siap diinstall";
            JSONArray notes = apkUpdate.optJSONArray("releaseNotes");
            if (notes != null && notes.length() > 0 && !TextUtils.isEmpty(notes.optString(0, ""))) {
                message = notes.optString(0);
            }
            String time = "sekarang";
            String updatedAt = apkUpdate.optString("updatedAt", "");
            if (!TextUtils.isEmpty(updatedAt)) {
                time = updatedAt.replace('T', ' ');
                int dot = time.indexOf('.');
                if (dot > 0) time = time.substring(0, dot);
                if (time.endsWith("Z")) time = time.substring(0, time.length() - 1);
            }
            notices.add(0, new NoticeItem("Update APK " + version, message, time, 0xFF2F80ED));
        }

        private static int noticeColorFor(String value) {
            String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
            if (normalized.contains("green") || normalized.contains("success") || normalized.contains("online")) return 0xFF22C55E;
            if (normalized.contains("yellow") || normalized.contains("warning")) return 0xFFF59E0B;
            if (normalized.contains("purple") || normalized.contains("info")) return 0xFF8B5CF6;
            if (normalized.contains("blue")) return 0xFF2F80ED;
            return 0xFFEF4444;
        }

        private static int optInt(JSONObject object, String key, int fallback) {
            return object == null ? fallback : object.optInt(key, fallback);
        }

        private static String firstNonEmpty(String first, String fallback) {
            if (first != null && !first.trim().isEmpty()) return first.trim();
            return fallback == null ? "" : fallback.trim();
        }

        private static long normalizeEpoch(long value) {
            if (value <= 0L) return 0L;
            return value < 100_000_000_000L ? value * 1000L : value;
        }
    }
}
