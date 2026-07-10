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
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
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

public class TrafficDetectionWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_REFRESH_WIDGET = "id.ac.telkomuniversity.its.action.TRAFFIC_DETECTION_REFRESH";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_DATASET = "traffic_dataset_snapshot";
    private static final String PREF_DEVICE = "traffic_device_snapshot";
    private static final String PREF_LOCAL_AI_SLOT_PREFIX = "local_ai_slot_";
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DATASET_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
    private static final String FIREBASE_DEVICES_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String FIREBASE_DEVICE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices/raspberry-its.json";
    private static final long REFRESH_INTERVAL_MS = 10_000L;
    private static final long CAROUSEL_INTERVAL_MS = 10_000L;
    private static final long STALE_AFTER_MS = 45_000L;
    private static final int CANVAS_WIDTH = 1280;
    private static final int CANVAS_HEIGHT = 640;
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
        ComponentName provider = new ComponentName(context, TrafficDetectionWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(provider);
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        TrafficSnapshot snapshot = fetchSnapshot(context);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId, snapshot);
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId, TrafficSnapshot snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_traffic_detection);
        views.setOnClickPendingIntent(R.id.widget_traffic_root, openIntent(context, "its://traffic", 5102));
        views.setOnClickPendingIntent(R.id.widget_traffic_canvas, refreshPendingIntent(context));

        Bitmap bitmap = renderWidget(context, snapshot);
        views.setImageViewBitmap(R.id.widget_traffic_canvas, bitmap);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private TrafficSnapshot fetchSnapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String datasetJson = prefs.getString(PREF_DATASET, "");
        String deviceJson = prefs.getString(PREF_DEVICE, "");

        try {
            datasetJson = fetchJson(FIREBASE_DATASET_URL);
            prefs.edit().putString(PREF_DATASET, datasetJson).apply();
        } catch (Exception ignored) {
        }

        try {
            deviceJson = fetchJson(FIREBASE_DEVICES_URL);
            prefs.edit().putString(PREF_DEVICE, deviceJson).apply();
        } catch (Exception ignored) {
            try {
                deviceJson = fetchJson(FIREBASE_DEVICE_URL);
                prefs.edit().putString(PREF_DEVICE, deviceJson).apply();
            } catch (Exception secondIgnored) {
            }
        }

        try {
            TrafficSnapshot snapshot = TrafficSnapshot.fromJson(datasetJson, deviceJson);
            long now = System.currentTimeMillis();
            int slot = ((now / CAROUSEL_INTERVAL_MS) % 2L) == 0L ? 1 : 2;
            String localAnalysis = prefs.getString(PREF_LOCAL_AI_SLOT_PREFIX + slot, "");
            return snapshot.withLocalAnalysis(localAnalysis, snapshot.imageForCarousel(now));
        } catch (Exception ignored) {
            return TrafficSnapshot.fallback();
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
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            return body.toString();
        } finally {
            connection.disconnect();
        }
    }

    private Bitmap renderWidget(Context context, TrafficSnapshot snapshot) {
        int canvasHeight = CANVAS_HEIGHT;
        Bitmap output = Bitmap.createBitmap(CANVAS_WIDTH, canvasHeight, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        long now = System.currentTimeMillis();
        boolean online = snapshot.raspberryOnline(now);

        Bitmap camera = decodeImageValue(snapshot.imageForCarousel(now));
        boolean hasCameraFrame = camera != null;
        if (!hasCameraFrame) {
            camera = loadFallbackBitmap(context);
        }

        DrawInfo drawInfo = drawBackground(canvas, camera, canvasHeight);
        if (hasCameraFrame) {
            List<Detection> detections = snapshot.detections.isEmpty()
                ? quickDetectObjects(camera)
                : snapshot.detections;
            drawDetectionBoxes(canvas, detections, snapshot, drawInfo, canvasHeight, now);
            if (detections.isEmpty()) {
                drawSearchReticle(canvas, drawInfo.rect, canvasHeight, now);
            }
        }
        drawShade(canvas, canvasHeight);
        drawHeader(canvas, snapshot, now);
        drawCards(canvas, output, snapshot, canvasHeight, online);
        return output;
    }

    private DrawInfo drawBackground(Canvas canvas, Bitmap image, int canvasHeight) {
        canvas.drawColor(0xFF0B1220);
        if (image == null) {
            Paint gradient = new Paint(Paint.ANTI_ALIAS_FLAG);
            gradient.setShader(new LinearGradient(0, 0, CANVAS_WIDTH, canvasHeight, 0xFF172033, 0xFF0B1220, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, CANVAS_WIDTH, canvasHeight, gradient);
            return new DrawInfo(new RectF(0, 0, CANVAS_WIDTH, canvasHeight), CANVAS_WIDTH, canvasHeight);
        }

        float scale = Math.max(CANVAS_WIDTH / (float) image.getWidth(), canvasHeight / (float) image.getHeight());
        float drawWidth = image.getWidth() * scale;
        float drawHeight = image.getHeight() * scale;
        float left = (CANVAS_WIDTH - drawWidth) / 2f;
        float top = (canvasHeight - drawHeight) / 2f;
        RectF dst = new RectF(left, top, left + drawWidth, top + drawHeight);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.drawBitmap(image, null, dst, paint);
        return new DrawInfo(dst, image.getWidth(), image.getHeight());
    }

    private void drawShade(Canvas canvas, int canvasHeight) {
        Paint top = new Paint(Paint.ANTI_ALIAS_FLAG);
        top.setShader(new LinearGradient(0, 0, 0, 210, 0xD5000000, 0x00000000, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, CANVAS_WIDTH, 210, top);

        Paint bottom = new Paint(Paint.ANTI_ALIAS_FLAG);
        float bottomStart = Math.max(220f, canvasHeight * 0.58f);
        bottom.setShader(new LinearGradient(0, bottomStart, 0, canvasHeight, 0x00000000, 0xE6000000, Shader.TileMode.CLAMP));
        canvas.drawRect(0, bottomStart, CANVAS_WIDTH, canvasHeight, bottom);
    }

    private void drawHeader(Canvas canvas, TrafficSnapshot snapshot, long now) {
        boolean online = snapshot.raspberryOnline(now);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setFakeBoldText(true);
        text.setTextSize(42f);
        canvas.drawText("ITS", 40f, 66f, text);

        drawTrafficStatus(canvas, snapshot, online, now);
        drawRaspberryInfo(canvas, snapshot, online);
    }

    private void drawTrafficStatus(Canvas canvas, TrafficSnapshot snapshot, boolean online, long now) {
        String label = online ? snapshot.trafficLabel() + " " + snapshot.trafficDurationSec + " dtk" : "Traffic offline";
        int accent = online ? snapshot.trafficColorInt() : 0xFF94A3B8;

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(24f);
        text.setFakeBoldText(true);
        float chipWidth = Math.max(190f, text.measureText(label) + 72f);
        RectF chip = new RectF(CANVAS_WIDTH - chipWidth - 40f, 34f, CANVAS_WIDTH - 40f, 86f);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(0xAA111827);
        canvas.drawRoundRect(chip, 26f, 26f, bg);

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(accent);
        canvas.drawCircle(chip.left + 27f, chip.centerY(), 11f, dot);

        text.setColor(Color.WHITE);
        canvas.drawText(label, chip.left + 50f, chip.top + 35f, text);

        drawCarouselDots(canvas, chip.centerX(), chip.bottom + 22f, online && snapshot.hasCarouselImages(), now);
    }

    private void drawCarouselDots(Canvas canvas, float centerX, float cy, boolean active, long now) {
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        float spacing = 24f;
        int selected = (int) ((now / CAROUSEL_INTERVAL_MS) % 2L);
        for (int i = 0; i < 2; i++) {
            boolean on = active && i == selected;
            dot.setColor(on ? 0xFFFFFFFF : (active ? 0x99FFFFFF : 0x6694A3B8));
            canvas.drawCircle(centerX + (i == 0 ? -spacing / 2f : spacing / 2f), cy, on ? 6.5f : 5f, dot);
        }
    }

    private void drawRaspberryInfo(Canvas canvas, TrafficSnapshot snapshot, boolean online) {
        float left = 46f;
        float centerY = CANVAS_HEIGHT * 0.50f;
        drawMapMarkerIcon(canvas, left + 30f, centerY - 5f, online ? 0xFF38BDF8 : 0xFFCBD5E1);

        Paint location = new Paint(Paint.ANTI_ALIAS_FLAG);
        location.setColor(Color.WHITE);
        location.setFakeBoldText(true);
        location.setTextSize(30f);
        canvas.drawText(ellipsize(snapshot.locationLabel(), location, 440f), left + 72f, centerY - 10f, location);

        Paint detail = new Paint(Paint.ANTI_ALIAS_FLAG);
        detail.setColor(online ? 0xFFBBF7D0 : 0xFFFFD2D2);
        detail.setFakeBoldText(true);
        detail.setTextSize(22f);
        String detailText = online ? "Raspberry online" : "Offline - " + snapshot.lastOnlineText();
        canvas.drawText(ellipsize(detailText, detail, 440f), left + 72f, centerY + 25f, detail);
    }

    private void drawMapMarkerIcon(Canvas canvas, float cx, float cy, int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        Path pin = new Path();
        pin.moveTo(cx, cy + 30f);
        pin.cubicTo(cx - 24f, cy + 5f, cx - 24f, cy - 27f, cx, cy - 27f);
        pin.cubicTo(cx + 24f, cy - 27f, cx + 24f, cy + 5f, cx, cy + 30f);
        pin.close();
        canvas.drawPath(pin, paint);

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(4f);
        stroke.setColor(0xDD0F172A);
        canvas.drawPath(pin, stroke);

        Paint hole = new Paint(Paint.ANTI_ALIAS_FLAG);
        hole.setColor(0xFF0F172A);
        canvas.drawCircle(cx, cy - 9f, 8f, hole);
    }

    private void drawDetectionBoxes(Canvas canvas, List<Detection> detections, TrafficSnapshot snapshot, DrawInfo drawInfo, int canvasHeight, long now) {
        if (detections.isEmpty()) return;

        int sourceWidth = snapshot.detectorFrameWidth > 0 ? snapshot.detectorFrameWidth : drawInfo.sourceWidth;
        int sourceHeight = snapshot.detectorFrameHeight > 0 ? snapshot.detectorFrameHeight : drawInfo.sourceHeight;
        if (sourceWidth <= 0 || sourceHeight <= 0) return;

        canvas.save();
        canvas.clipRect(0, 0, CANVAS_WIDTH, canvasHeight);
        for (Detection detection : detections) {
            double x = detection.x;
            double y = detection.y;
            double boxWidth = detection.width;
            double boxHeight = detection.height;
            if (detection.normalized()) {
                x *= sourceWidth;
                y *= sourceHeight;
                boxWidth *= sourceWidth;
                boxHeight *= sourceHeight;
            }
            RectF box = new RectF(
                drawInfo.rect.left + (float) (x / sourceWidth) * drawInfo.rect.width(),
                drawInfo.rect.top + (float) (y / sourceHeight) * drawInfo.rect.height(),
                drawInfo.rect.left + (float) ((x + boxWidth) / sourceWidth) * drawInfo.rect.width(),
                drawInfo.rect.top + (float) ((y + boxHeight) / sourceHeight) * drawInfo.rect.height()
            );
            box.intersect(new RectF(0, 0, CANVAS_WIDTH, canvasHeight));
            if (box.width() < 8f || box.height() < 8f) continue;

            int color = colorForLabel(detection.label);
            float phase = 0.55f + 0.45f * (float) Math.sin((now + countSeed(detection)) / 310d);
            RectF growBox = growFromCenter(box, 0.76f + phase * 0.24f);
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(4.5f + phase * 1.4f);
            stroke.setColor(adjustAlpha(color, 178 + Math.round(phase * 68f)));
            canvas.drawRoundRect(growBox, 8f, 8f, stroke);

            Paint scan = new Paint(Paint.ANTI_ALIAS_FLAG);
            scan.setStyle(Paint.Style.STROKE);
            scan.setStrokeWidth(2.2f);
            scan.setColor(adjustAlpha(color, 118));
            float scanY = growBox.top + ((now / 18f + countSeed(detection)) % Math.max(1f, growBox.height()));
            canvas.drawLine(growBox.left + 8f, scanY, growBox.right - 8f, scanY, scan);

            Paint corner = new Paint(Paint.ANTI_ALIAS_FLAG);
            corner.setStyle(Paint.Style.STROKE);
            corner.setStrokeWidth(7f);
            corner.setStrokeCap(Paint.Cap.ROUND);
            corner.setColor(color);
            float len = Math.min(46f, Math.max(22f, Math.min(growBox.width(), growBox.height()) * 0.24f));
            drawBoxCorners(canvas, growBox, len, corner);

            String label = displayLabelFor(detection.label) + " " + Math.round(detection.confidence * 100d) + "%";
            Paint labelText = new Paint(Paint.ANTI_ALIAS_FLAG);
            labelText.setTextSize(20f);
            labelText.setFakeBoldText(true);
            float labelWidth = labelText.measureText(label) + 18f;
            float labelTop = growBox.top - 31f;
            if (labelTop < 0f) labelTop = growBox.top + 5f;
            RectF labelBg = new RectF(growBox.left, labelTop, Math.min(CANVAS_WIDTH, growBox.left + labelWidth), labelTop + 31f);
            Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            labelPaint.setColor(color);
            canvas.drawRoundRect(labelBg, 9f, 9f, labelPaint);
            labelText.setColor(0xFF07111F);
            canvas.drawText(label, labelBg.left + 9f, labelBg.top + 22f, labelText);
        }
        canvas.restore();
    }

    private RectF growFromCenter(RectF box, float scale) {
        scale = Math.max(0.1f, Math.min(1f, scale));
        float halfW = box.width() * scale / 2f;
        float halfH = box.height() * scale / 2f;
        return new RectF(box.centerX() - halfW, box.centerY() - halfH, box.centerX() + halfW, box.centerY() + halfH);
    }

    private void drawBoxCorners(Canvas canvas, RectF box, float len, Paint paint) {
        canvas.drawLine(box.left, box.top, box.left + len, box.top, paint);
        canvas.drawLine(box.left, box.top, box.left, box.top + len, paint);
        canvas.drawLine(box.right, box.top, box.right - len, box.top, paint);
        canvas.drawLine(box.right, box.top, box.right, box.top + len, paint);
        canvas.drawLine(box.left, box.bottom, box.left + len, box.bottom, paint);
        canvas.drawLine(box.left, box.bottom, box.left, box.bottom - len, paint);
        canvas.drawLine(box.right, box.bottom, box.right - len, box.bottom, paint);
        canvas.drawLine(box.right, box.bottom, box.right, box.bottom - len, paint);
    }

    private int countSeed(Detection detection) {
        String key = (detection == null ? "object" : detection.label) + ":" + Math.round(detection == null ? 0d : detection.x) + ":" + Math.round(detection == null ? 0d : detection.y);
        return Math.abs(key.hashCode() % 997);
    }

    private List<Detection> quickDetectObjects(Bitmap source) {
        List<Detection> detections = new ArrayList<>();
        if (source == null || source.isRecycled() || source.getWidth() <= 0 || source.getHeight() <= 0) return detections;
        int sourceWidth = source.getWidth();
        int sourceHeight = source.getHeight();
        int maxEdge = 280;
        float scale = Math.min(1f, maxEdge / (float) Math.max(sourceWidth, sourceHeight));
        int width = Math.max(1, Math.round(sourceWidth * scale));
        int height = Math.max(1, Math.round(sourceHeight * scale));
        Bitmap sample = scale < 1f ? Bitmap.createScaledBitmap(source, width, height, true) : source;
        int[] pixels = new int[width * height];
        sample.getPixels(pixels, 0, width, 0, 0, width, height);
        if (sample != source) sample.recycle();

        float[] gray = new float[width * height];
        float[] edge = new float[width * height];
        for (int i = 0; i < pixels.length; i++) {
            int color = pixels[i];
            gray[i] = Color.red(color) * 0.299f + Color.green(color) * 0.587f + Color.blue(color) * 0.114f;
        }
        double sum = 0d;
        double sumSq = 0d;
        int samples = 0;
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int index = y * width + x;
                float value = Math.abs(gray[index + 1] - gray[index - 1]) + Math.abs(gray[index + width] - gray[index - width]);
                edge[index] = value;
                sum += value;
                sumSq += value * value;
                samples++;
            }
        }
        double mean = samples == 0 ? 0d : sum / samples;
        double variance = samples == 0 ? 0d : Math.max(0d, sumSq / samples - mean * mean);
        float threshold = (float) Math.max(24d, mean + Math.sqrt(variance) * 1.08d);
        byte[] mask = new byte[width * height];
        int radius = Math.max(1, Math.round(Math.min(width, height) / 115f));
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int index = y * width + x;
                if (edge[index] < threshold) continue;
                int color = pixels[index];
                int r = Color.red(color);
                int g = Color.green(color);
                int b = Color.blue(color);
                int chroma = Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b));
                if (edge[index] < threshold * 1.35f && chroma < 14) continue;
                for (int dy = -radius; dy <= radius; dy++) {
                    int yy = y + dy;
                    if (yy < 0 || yy >= height) continue;
                    for (int dx = -radius; dx <= radius; dx++) {
                        int xx = x + dx;
                        if (xx < 0 || xx >= width) continue;
                        mask[yy * width + xx] = 1;
                    }
                }
            }
        }

        byte[] visited = new byte[width * height];
        int[] queue = new int[width * height];
        List<QuickComponent> components = new ArrayList<>();
        for (int start = 0; start < mask.length; start++) {
            if (mask[start] == 0 || visited[start] != 0) continue;
            int head = 0;
            int tail = 0;
            queue[tail++] = start;
            visited[start] = 1;
            int minX = width;
            int minY = height;
            int maxX = 0;
            int maxY = 0;
            int count = 0;
            float score = 0f;
            while (head < tail) {
                int index = queue[head++];
                int x = index % width;
                int y = index / width;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                count++;
                score += edge[index] > 0 ? edge[index] : threshold;
                if (x > 0) tail = enqueue(mask, visited, queue, tail, index - 1);
                if (x < width - 1) tail = enqueue(mask, visited, queue, tail, index + 1);
                if (y > 0) tail = enqueue(mask, visited, queue, tail, index - width);
                if (y < height - 1) tail = enqueue(mask, visited, queue, tail, index + width);
            }
            int boxWidth = maxX - minX + 1;
            int boxHeight = maxY - minY + 1;
            float areaRatio = (boxWidth * boxHeight) / (float) Math.max(1, width * height);
            float fillRatio = count / (float) Math.max(1, boxWidth * boxHeight);
            if (boxWidth < 13 || boxHeight < 13 || areaRatio < 0.004f || areaRatio > 0.36f || fillRatio < 0.018f) continue;
            components.add(new QuickComponent(minX, minY, boxWidth, boxHeight, score / Math.max(1, count)));
        }

        components.sort((a, b) -> Float.compare(b.rank(), a.rank()));
        List<QuickComponent> kept = new ArrayList<>();
        for (QuickComponent component : components) {
            boolean overlaps = false;
            for (QuickComponent other : kept) {
                if (quickOverlap(component, other) > 0.42f || quickContained(component, other)) {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) continue;
            kept.add(component);
            if (kept.size() >= 3) break;
        }

        int index = 0;
        for (QuickComponent component : kept) {
            String label = classifyQuickComponent(component, pixels, width, height);
            if ("object".equals(label) && component.areaRatio(width, height) > 0.22f) continue;
            double confidence = Math.max(0.52d, Math.min(0.88d, 0.74d + (!"object".equals(label) ? 0.06d : -0.05d) - index * 0.035d));
            detections.add(new Detection(
                label,
                confidence,
                component.x / scale,
                component.y / scale,
                component.width / scale,
                component.height / scale
            ));
            index++;
        }
        return detections;
    }

    private int enqueue(byte[] mask, byte[] visited, int[] queue, int tail, int index) {
        if (mask[index] == 0 || visited[index] != 0 || tail >= queue.length) return tail;
        visited[index] = 1;
        queue[tail++] = index;
        return tail;
    }

    private String classifyQuickComponent(QuickComponent box, int[] pixels, int width, int height) {
        QuickStats stats = quickStats(box, pixels, width, height);
        float aspect = box.width / (float) Math.max(1, box.height);
        float areaRatio = box.areaRatio(width, height);
        if (areaRatio < 0.24f && aspect > 1.35f && aspect < 4.8f && (stats.grayRatio > 0.30f || stats.darkRatio > 0.30f) && stats.saturation < 0.40f) return "cell phone";
        if (areaRatio < 0.28f && aspect > 1.35f && aspect < 4.2f && (stats.greenRatio + stats.blueRatio + stats.redRatio > 0.16f || stats.darkRatio > 0.42f)) return "car";
        if (box.height > box.width * 1.18f && stats.skinRatio > 0.07f) return "person";
        if (areaRatio < 0.20f && aspect > 1.12f && (stats.whiteRatio > 0.20f || stats.grayRatio > 0.44f)) return "book";
        if (areaRatio < 0.24f && aspect > 0.50f && aspect < 1.36f && (stats.yellowRatio > 0.12f || stats.redRatio > 0.14f || stats.blueRatio > 0.18f)) return "bottle";
        if (areaRatio < 0.12f && stats.greenRatio > 0.24f && stats.saturation > 0.20f && stats.whiteRatio < 0.18f) return "potted plant";
        if (areaRatio < 0.22f && aspect > 1.15f && aspect < 4.6f && stats.saturation > 0.20f) return "toy vehicle";
        if (areaRatio > 0.18f && stats.grayRatio + stats.whiteRatio > 0.48f && stats.saturation < 0.22f) return "floor";
        return "unknown object";
    }

    private QuickStats quickStats(QuickComponent box, int[] pixels, int frameWidth, int frameHeight) {
        int left = Math.max(0, box.x);
        int top = Math.max(0, box.y);
        int right = Math.min(frameWidth - 1, box.x + box.width);
        int bottom = Math.min(frameHeight - 1, box.y + box.height);
        int step = Math.max(1, Math.min(box.width, box.height) / 30);
        int samples = 0;
        float saturation = 0f;
        int dark = 0;
        int white = 0;
        int gray = 0;
        int red = 0;
        int green = 0;
        int blue = 0;
        int yellow = 0;
        int skin = 0;
        for (int y = top; y <= bottom; y += step) {
            for (int x = left; x <= right; x += step) {
                int color = pixels[y * frameWidth + x];
                int r = Color.red(color);
                int g = Color.green(color);
                int b = Color.blue(color);
                int max = Math.max(r, Math.max(g, b));
                int min = Math.min(r, Math.min(g, b));
                int chroma = max - min;
                int bright = (r + g + b) / 3;
                samples++;
                saturation += max <= 0 ? 0f : chroma / (float) max;
                if (bright < 66) dark++;
                if (bright > 204 && chroma < 42) white++;
                if (chroma < 28 && bright > 34 && bright < 224) gray++;
                if (r > 82 && r > g * 1.2f && r > b * 1.22f) red++;
                if (g > 76 && g > r * 1.12f && g > b * 1.06f) green++;
                if (b > 68 && b > r * 1.12f && b > g * 1.04f) blue++;
                if (r > 132 && g > 108 && b < 118 && Math.abs(r - g) < 88) yellow++;
                if (r > 74 && g > 42 && b > 24 && r > g && g > b && r - b > 26 && r - g < 92) skin++;
            }
        }
        float total = Math.max(1, samples);
        return new QuickStats(
            saturation / total,
            dark / total,
            white / total,
            gray / total,
            red / total,
            green / total,
            blue / total,
            yellow / total,
            skin / total
        );
    }

    private void drawSearchReticle(Canvas canvas, RectF sourceRect, int canvasHeight, long now) {
        RectF bounds = new RectF(
            Math.max(18f, sourceRect.left),
            Math.max(18f, sourceRect.top),
            Math.min(CANVAS_WIDTH - 18f, sourceRect.right),
            Math.min(canvasHeight - 18f, sourceRect.bottom)
        );
        if (bounds.width() < 120f || bounds.height() < 100f) return;
        float cx = bounds.centerX() + (float) Math.sin(now / 640d) * bounds.width() * 0.27f;
        float cy = bounds.centerY() + (float) Math.cos(now / 790d) * bounds.height() * 0.22f;
        float pulse = 0.5f + 0.5f * (float) Math.sin(now / 180d);
        float size = 34f + pulse * 8f;
        float gap = size * 0.42f;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(4.5f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(0xFF22E6A8);
        canvas.save();
        canvas.clipRect(bounds);
        canvas.drawLine(cx - size, cy - size, cx - gap, cy - size, paint);
        canvas.drawLine(cx - size, cy - size, cx - size, cy - gap, paint);
        canvas.drawLine(cx + gap, cy - size, cx + size, cy - size, paint);
        canvas.drawLine(cx + size, cy - size, cx + size, cy - gap, paint);
        canvas.drawLine(cx - size, cy + size, cx - gap, cy + size, paint);
        canvas.drawLine(cx - size, cy + gap, cx - size, cy + size, paint);
        canvas.drawLine(cx + gap, cy + size, cx + size, cy + size, paint);
        canvas.drawLine(cx + size, cy + gap, cx + size, cy + size, paint);
        canvas.restore();
    }

    private void drawCards(Canvas canvas, Bitmap output, TrafficSnapshot snapshot, int canvasHeight, boolean online) {
        StatCard[] cards = new StatCard[] {
            new StatCard("Mobil", online ? snapshot.car : 0, "car"),
            new StatCard("Motor", online ? snapshot.motorcycle : 0, "motorcycle"),
            new StatCard("Truk", online ? snapshot.truck : 0, "truck"),
            new StatCard("Sepeda", online ? snapshot.bicycle : 0, "bicycle"),
            new StatCard("Bus", online ? snapshot.bus : 0, "bus"),
            new StatCard("Total", online ? snapshot.vehicleCount() : 0, "total")
        };

        float gap = 14f;
        float gridWidth = 430f;
        float cardWidth = (gridWidth - gap) / 2f;
        float cardHeight = 76f;
        float startX = CANVAS_WIDTH - 44f - gridWidth;
        int rows = 3;
        float gridHeight = rows * cardHeight + (rows - 1) * gap;
        float startY = (canvasHeight - gridHeight) * 0.5f;

        for (int i = 0; i < cards.length; i++) {
            int row = i / 2;
            int col = i % 2;
            RectF rect = new RectF(
                startX + col * (cardWidth + gap),
                startY + row * (cardHeight + gap),
                startX + col * (cardWidth + gap) + cardWidth,
                startY + row * (cardHeight + gap) + cardHeight
            );
            drawCard(canvas, output, rect, cards[i]);
        }
    }

    private void drawCard(Canvas canvas, Bitmap output, RectF rect, StatCard card) {
        drawBlurredCardBackground(canvas, output, rect, 18f);

        Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
        edge.setStyle(Paint.Style.STROKE);
        edge.setStrokeWidth(1.8f);
        edge.setColor(0x50FFFFFF);
        canvas.drawRoundRect(rect, 18f, 18f, edge);

        drawVehicleIcon(canvas, card.type, rect.left + 54f, rect.centerY() - 4f, 0xFFBAE6FD);

        Paint value = new Paint(Paint.ANTI_ALIAS_FLAG);
        value.setColor(Color.WHITE);
        value.setFakeBoldText(true);
        value.setTextSize(38f);
        String count = String.valueOf(card.value);
        canvas.drawText(count, rect.right - value.measureText(count) - 28f, rect.centerY() + 14f, value);
    }

    private String ellipsize(String value, Paint paint, float maxWidth) {
        if (value == null) return "";
        if (paint.measureText(value) <= maxWidth) return value;
        String suffix = "...";
        int end = value.length();
        while (end > 0 && paint.measureText(value.substring(0, end).trim() + suffix) > maxWidth) {
            end--;
        }
        return end <= 0 ? suffix : value.substring(0, end).trim() + suffix;
    }

    private void drawBlurredCardBackground(Canvas canvas, Bitmap output, RectF rect, float radius) {
        int left = Math.max(0, (int) rect.left);
        int top = Math.max(0, (int) rect.top);
        int right = Math.min(output.getWidth(), (int) Math.ceil(rect.right));
        int bottom = Math.min(output.getHeight(), (int) Math.ceil(rect.bottom));
        int width = right - left;
        int height = bottom - top;

        if (width <= 0 || height <= 0) {
            Paint fallback = new Paint(Paint.ANTI_ALIAS_FLAG);
            fallback.setColor(0xA3111827);
            canvas.drawRoundRect(rect, radius, radius, fallback);
            return;
        }

        Bitmap region = Bitmap.createBitmap(output, left, top, width, height);
        int blurWidth = Math.max(1, width / 4);
        int blurHeight = Math.max(1, height / 4);
        Bitmap small = Bitmap.createScaledBitmap(region, blurWidth, blurHeight, true);
        region.recycle();

        Bitmap blurred = blurBitmap(small, 8);
        if (blurred != small) {
            small.recycle();
        }

        Path clip = new Path();
        clip.addRoundRect(rect, radius, radius, Path.Direction.CW);
        Paint bitmapPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.save();
        canvas.clipPath(clip);
        canvas.drawBitmap(blurred, null, new RectF(left, top, right, bottom), bitmapPaint);
        canvas.restore();
        blurred.recycle();

        Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
        veil.setColor(0x99111827);
        canvas.drawRoundRect(rect, radius, radius, veil);
    }

    private Bitmap blurBitmap(Bitmap source, int radius) {
        int width = source.getWidth();
        int height = source.getHeight();
        if (width <= 1 || height <= 1 || radius <= 0) {
            return source;
        }

        Bitmap bitmap = source.copy(Bitmap.Config.ARGB_8888, true);
        int[] pixels = new int[width * height];
        int[] temp = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

        boxBlurHorizontal(pixels, temp, width, height, radius);
        boxBlurVertical(temp, pixels, width, height, radius);
        boxBlurHorizontal(pixels, temp, width, height, radius);
        boxBlurVertical(temp, pixels, width, height, radius);

        bitmap.setPixels(pixels, 0, width, 0, 0, width, height);
        return bitmap;
    }

    private void boxBlurHorizontal(int[] input, int[] output, int width, int height, int radius) {
        int window = radius * 2 + 1;
        for (int y = 0; y < height; y++) {
            int row = y * width;
            int a = 0, r = 0, g = 0, b = 0;
            for (int i = -radius; i <= radius; i++) {
                int color = input[row + clamp(i, 0, width - 1)];
                a += Color.alpha(color);
                r += Color.red(color);
                g += Color.green(color);
                b += Color.blue(color);
            }
            for (int x = 0; x < width; x++) {
                output[row + x] = Color.argb(a / window, r / window, g / window, b / window);
                int remove = input[row + clamp(x - radius, 0, width - 1)];
                int add = input[row + clamp(x + radius + 1, 0, width - 1)];
                a += Color.alpha(add) - Color.alpha(remove);
                r += Color.red(add) - Color.red(remove);
                g += Color.green(add) - Color.green(remove);
                b += Color.blue(add) - Color.blue(remove);
            }
        }
    }

    private void boxBlurVertical(int[] input, int[] output, int width, int height, int radius) {
        int window = radius * 2 + 1;
        for (int x = 0; x < width; x++) {
            int a = 0, r = 0, g = 0, b = 0;
            for (int i = -radius; i <= radius; i++) {
                int color = input[clamp(i, 0, height - 1) * width + x];
                a += Color.alpha(color);
                r += Color.red(color);
                g += Color.green(color);
                b += Color.blue(color);
            }
            for (int y = 0; y < height; y++) {
                output[y * width + x] = Color.argb(a / window, r / window, g / window, b / window);
                int remove = input[clamp(y - radius, 0, height - 1) * width + x];
                int add = input[clamp(y + radius + 1, 0, height - 1) * width + x];
                a += Color.alpha(add) - Color.alpha(remove);
                r += Color.red(add) - Color.red(remove);
                g += Color.green(add) - Color.green(remove);
                b += Color.blue(add) - Color.blue(remove);
            }
        }
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private void drawVehicleIcon(Canvas canvas, String type, float cx, float cy, int color) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(color);
        line.setStrokeWidth(4f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setStyle(Paint.Style.STROKE);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(color);
        fill.setStyle(Paint.Style.FILL);

        Paint faint = new Paint(Paint.ANTI_ALIAS_FLAG);
        faint.setColor(color);
        faint.setStyle(Paint.Style.FILL);
        faint.setAlpha(40); // ~0.16 opacity

        Paint dim = new Paint(line);
        dim.setAlpha(150); // ~0.6 opacity

        if ("bicycle".equals(type)) {
            canvas.drawCircle(cx - 18f, cy + 12f, 9.5f, line);
            canvas.drawCircle(cx + 18f, cy + 12f, 9.5f, line);
            canvas.drawCircle(cx - 18f, cy + 12f, 1.6f, fill);
            canvas.drawCircle(cx + 18f, cy + 12f, 1.6f, fill);

            Path frame1 = new Path();
            frame1.moveTo(cx - 18f, cy + 12f);
            frame1.lineTo(cx - 2f, cy + 12f);
            frame1.lineTo(cx + 6f, cy - 6f);
            canvas.drawPath(frame1, line);

            Path frame2 = new Path();
            frame2.moveTo(cx - 18f, cy + 12f);
            frame2.lineTo(cx - 6f, cy - 6f);
            frame2.lineTo(cx + 6f, cy - 6f);
            canvas.drawPath(frame2, line);

            Path frame3 = new Path();
            frame3.moveTo(cx - 2f, cy + 12f);
            frame3.lineTo(cx + 18f, cy + 12f);
            frame3.lineTo(cx + 6f, cy - 6f);
            canvas.drawPath(frame3, line);

            canvas.drawLine(cx - 6f, cy - 6f, cx - 14f, cy - 6f, line);   // seat post
            canvas.drawLine(cx + 6f, cy - 6f, cx + 12f, cy - 12f, line);  // fork to handlebar stem
            canvas.drawLine(cx + 8f, cy - 15f, cx + 16f, cy - 15f, line); // handlebar
            canvas.drawCircle(cx - 2f, cy + 12f, 2f, fill);               // pedal hub
            return;
        }

        if ("motorcycle".equals(type)) {
            canvas.drawCircle(cx - 18f, cy + 14f, 8.5f, line);
            canvas.drawCircle(cx + 16f, cy + 14f, 8.5f, line);
            canvas.drawCircle(cx - 18f, cy + 14f, 1.5f, fill);
            canvas.drawCircle(cx + 16f, cy + 14f, 1.5f, fill);

            Path top = new Path(); // fork + tank + head tube
            top.moveTo(cx - 10f, cy + 14f);
            top.lineTo(cx - 6f, cy + 1f);
            top.cubicTo(cx - 4f, cy - 2f, cx - 1f, cy - 3f, cx + 2f, cy - 3f);
            top.lineTo(cx + 8f, cy - 3f);
            top.cubicTo(cx + 10f, cy - 3f, cx + 11f, cy - 2f, cx + 11f, cy);
            top.lineTo(cx + 11f, cy + 6f);
            canvas.drawPath(top, line);

            canvas.drawLine(cx - 6f, cy + 1f, cx + 9f, cy + 1f, line); // seat line

            Path lower = new Path(); // seat -> wheels
            lower.moveTo(cx - 18f, cy + 14f);
            lower.lineTo(cx - 10f, cy + 14f);
            lower.lineTo(cx + 11f, cy + 6f);
            lower.lineTo(cx + 16f, cy + 14f);
            canvas.drawPath(lower, line);

            canvas.drawLine(cx + 8f, cy - 3f, cx + 14f, cy - 10f, line);   // riser
            canvas.drawLine(cx + 10f, cy - 13f, cx + 18f, cy - 13f, line); // handlebar
            canvas.drawLine(cx - 6f, cy + 1f, cx - 12f, cy - 3f, dim);     // headlight angle
            canvas.drawLine(cx + 12f, cy + 9f, cx + 19f, cy + 11f, dim);   // exhaust
            return;
        }

        if ("bus".equals(type)) {
            RectF body = new RectF(cx - 27f, cy - 17f, cx + 27f, cy + 14f);
            canvas.drawRoundRect(body, 8f, 8f, line);

            canvas.drawRoundRect(new RectF(cx - 21f, cy - 11f, cx - 9f, cy), 2.5f, 2.5f, line);
            canvas.drawRoundRect(new RectF(cx - 5f, cy - 11f, cx + 7f, cy), 2.5f, 2.5f, line);
            canvas.drawRoundRect(new RectF(cx + 11f, cy - 11f, cx + 21f, cy), 2.5f, 2.5f, line);

            canvas.drawLine(cx - 21f, cy + 7f, cx + 21f, cy + 7f, dim);

            canvas.drawCircle(cx - 17f, cy + 16f, 5f, fill);
            canvas.drawCircle(cx + 17f, cy + 16f, 5f, fill);
            return;
        }

        if ("truck".equals(type)) {
            canvas.drawRoundRect(new RectF(cx - 29f, cy - 16f, cx + 4f, cy + 11f), 6f, 6f, line);

            Path cabin = new Path();
            cabin.moveTo(cx + 4f, cy - 9f);
            cabin.lineTo(cx + 18f, cy - 9f);
            cabin.lineTo(cx + 28f, cy + 2f);
            cabin.lineTo(cx + 28f, cy + 11f);
            cabin.lineTo(cx + 4f, cy + 11f);
            canvas.drawPath(cabin, line);

            canvas.drawRoundRect(new RectF(cx + 8f, cy - 5f, cx + 16f, cy + 2f), 1.5f, 1.5f, faint);

            canvas.drawCircle(cx - 17f, cy + 16f, 5.5f, fill);
            canvas.drawCircle(cx + 18f, cy + 16f, 5.5f, fill);
            return;
        }

        if ("total".equals(type)) {
            canvas.drawRoundRect(new RectF(cx - 26f, cy - 21f, cx + 26f, cy + 21f), 10f, 10f, line);

            Paint rowDot = new Paint(fill);
            rowDot.setAlpha(216); // ~0.85

            canvas.drawCircle(cx - 17f, cy - 10f, 3f, rowDot);
            canvas.drawLine(cx - 11f, cy - 10f, cx + 16f, cy - 10f, dim);

            canvas.drawCircle(cx - 17f, cy, 3f, rowDot);
            canvas.drawLine(cx - 11f, cy, cx + 16f, cy, dim);

            canvas.drawCircle(cx - 17f, cy + 10f, 3f, rowDot);
            canvas.drawLine(cx - 11f, cy + 10f, cx + 8f, cy + 10f, dim);
            return;
        }

        // default: car
        Path car = new Path();
        car.moveTo(cx - 27f, cy + 11f);
        car.cubicTo(cx - 28f, cy + 3f, cx - 26f, cy - 1f, cx - 21f, cy - 3f);
        car.lineTo(cx - 17f, cy - 10f);
        car.cubicTo(cx - 15f, cy - 13f, cx - 12f, cy - 15f, cx - 8f, cy - 15f);
        car.lineTo(cx + 4f, cy - 15f);
        car.cubicTo(cx + 8f, cy - 15f, cx + 11f, cy - 13f, cx + 13f, cy - 10f);
        car.lineTo(cx + 17f, cy - 3f);
        car.cubicTo(cx + 22f, cy - 1f, cx + 24f, cy + 3f, cx + 23f, cy + 11f);
        canvas.drawPath(car, line);

        canvas.drawLine(cx - 30f, cy + 11f, cx + 26f, cy + 11f, line);
        canvas.drawLine(cx - 21f, cy - 3f, cx + 17f, cy - 3f, dim);
        canvas.drawLine(cx - 14f, cy - 3f, cx - 11f, cy - 11f, dim);
        canvas.drawLine(cx + 10f, cy - 3f, cx + 7f, cy - 11f, dim);

        canvas.drawCircle(cx - 17f, cy + 14f, 6f, fill);
        canvas.drawCircle(cx + 13f, cy + 14f, 6f, fill);
    }

    private Bitmap decodeImageValue(String value) {
        if (TextUtils.isEmpty(value)) return null;
        String trimmed = value.trim();
        try {
            if (trimmed.startsWith("data:image/")) {
                int comma = trimmed.indexOf(',');
                if (comma < 0) return null;
                byte[] bytes = Base64.decode(trimmed.substring(comma + 1), Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                return fetchBitmap(trimmed);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private Bitmap fetchBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setRequestProperty("User-Agent", "ITS-Traffic-Widget");
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
        for (String path : new String[] { "public/bwits.png" }) {
            try (InputStream input = context.getAssets().open(path)) {
                byte[] bytes = readAllBytes(input);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private byte[] readAllBytes(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private int colorForLabel(String label) {
        String value = TextUtils.isEmpty(label) ? "object" : label.trim().toLowerCase(Locale.ROOT);
        int hash = Math.abs(value.hashCode());
        float hue = (hash % 360 + 28f) % 360f;
        float saturation = 0.68f + ((hash >> 4) % 18) / 100f;
        float brightness = 0.88f + ((hash >> 9) % 10) / 100f;
        return Color.HSVToColor(new float[] { hue, Math.min(0.88f, saturation), Math.min(0.98f, brightness) });
    }

    private int adjustAlpha(int color, int alpha) {
        return (color & 0x00ffffff) | ((Math.max(0, Math.min(255, alpha)) & 0xff) << 24);
    }

    private String displayLabelFor(String label) {
        return IndonesianObjectLabels.display(label);
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
        Intent intent = new Intent(context, TrafficDetectionWidgetProvider.class);
        intent.setAction(ACTION_REFRESH_WIDGET);
        return PendingIntent.getBroadcast(
            context,
            5101,
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
            System.out.println("[ITS] Traffic widget realtime service skipped: " + err.getMessage());
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

    private static final class StatCard {
        final String label;
        final int value;
        final String type;

        StatCard(String label, int value, String type) {
            this.label = label;
            this.value = Math.max(0, value);
            this.type = type;
        }
    }

    private static final class QuickComponent {
        final int x;
        final int y;
        final int width;
        final int height;
        final float score;

        QuickComponent(int x, int y, int width, int height, float score) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.score = score;
        }

        float areaRatio(int frameWidth, int frameHeight) {
            return (width * height) / (float) Math.max(1, frameWidth * frameHeight);
        }

        float rank() {
            return score * (float) Math.sqrt(Math.max(1, width * height));
        }
    }

    private static final class QuickStats {
        final float saturation;
        final float darkRatio;
        final float whiteRatio;
        final float grayRatio;
        final float redRatio;
        final float greenRatio;
        final float blueRatio;
        final float yellowRatio;
        final float skinRatio;

        QuickStats(float saturation, float darkRatio, float whiteRatio, float grayRatio, float redRatio, float greenRatio, float blueRatio, float yellowRatio, float skinRatio) {
            this.saturation = saturation;
            this.darkRatio = darkRatio;
            this.whiteRatio = whiteRatio;
            this.grayRatio = grayRatio;
            this.redRatio = redRatio;
            this.greenRatio = greenRatio;
            this.blueRatio = blueRatio;
            this.yellowRatio = yellowRatio;
            this.skinRatio = skinRatio;
        }
    }

    private float quickOverlap(QuickComponent a, QuickComponent b) {
        int x1 = Math.max(a.x, b.x);
        int y1 = Math.max(a.y, b.y);
        int x2 = Math.min(a.x + a.width, b.x + b.width);
        int y2 = Math.min(a.y + a.height, b.y + b.height);
        int intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        int union = a.width * a.height + b.width * b.height - intersection;
        return union <= 0 ? 0f : intersection / (float) union;
    }

    private boolean quickContained(QuickComponent a, QuickComponent b) {
        int x1 = Math.max(a.x, b.x);
        int y1 = Math.max(a.y, b.y);
        int x2 = Math.min(a.x + a.width, b.x + b.width);
        int y2 = Math.min(a.y + a.height, b.y + b.height);
        int intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        int minArea = Math.min(a.width * a.height, b.width * b.height);
        return minArea > 0 && intersection / (float) minArea > 0.72f;
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

        boolean normalized() {
            return x <= 1.01d && y <= 1.01d && width <= 1.01d && height <= 1.01d;
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
        final long lastSeen;
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
            long lastSeen,
            String lastSeenText,
            int detectorFrameWidth,
            int detectorFrameHeight,
            int car,
            int motorcycle,
            int bus,
            int truck,
            int bicycle,
            int total,
            List<Detection> detections
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
            this.lastSeen = lastSeen;
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
        }

        static TrafficSnapshot fallback() {
            return new TrafficSnapshot(
                "",
                "",
                "offline",
                "offline",
                "offline",
                "red",
                0,
                "Sistem offline",
                "fallback",
                0L,
                0L,
                "",
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                new ArrayList<>()
            );
        }

        static TrafficSnapshot fromJson(String datasetRaw, String deviceRaw) throws JSONException {
            JSONObject dataset = parseObject(datasetRaw);
            JSONObject device = selectDevice(parseObject(deviceRaw));
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
            if (detectionArray == null || detectionArray.length() == 0) {
                detectionArray = device.optJSONArray("detections");
            }
            String structuredLocation = cleanLocationLabel(locationFromObject(device.optJSONObject("location")));
            String positionLocation = cleanLocationLabel(locationFromObject(device.optJSONObject("position")));

            return new TrafficSnapshot(
                firstNonEmpty(dataset.optString("image1", ""), firstNonEmpty(dataset.optString("gambar1", ""), firstNonEmpty(dataset.optString("nama1", ""), dataset.optString("snapshot1Url", "")))),
                firstNonEmpty(dataset.optString("image2", ""), firstNonEmpty(dataset.optString("gambar2", ""), firstNonEmpty(dataset.optString("nama2", ""), dataset.optString("snapshot2Url", "")))),
                firstNonEmpty(device.optString("status", ""), "offline"),
                firstNonEmpty(device.optString("cameraStatus", ""), dataset.optString("cameraStatus", "")),
                firstNonEmpty(dataset.optString("detectorStatus", ""), device.optString("detectorStatus", "")),
                firstNonEmpty(dataset.optString("trafficColor", ""), device.optString("trafficColor", "red")),
                dataset.optInt("trafficDurationSec", device.optInt("trafficDurationSec", 0)),
                firstNonEmpty(
                    cleanLocationLabel(device.optString("roadName", "")),
                    firstNonEmpty(
                        cleanLocationLabel(device.optString("address", "")),
                        firstNonEmpty(
                            structuredLocation,
                            firstNonEmpty(positionLocation, firstNonEmpty(cleanLocationLabel(device.optString("locationLabel", "")), cleanLocationLabel(dataset.optString("locationLabel", ""))))
                        )
                    )
                ),
                firstNonEmpty(dataset.optString("source", ""), "raspberry-camera"),
                normalizeEpoch(dataset.optLong("updatedAt", device.optLong("lastSeen", 0L))),
                latestDeviceTelemetry(device),
                device.optString("lastSeenText", ""),
                dataset.optInt("detectorFrameWidth", device.optInt("detectorFrameWidth", 0)),
                dataset.optInt("detectorFrameHeight", device.optInt("detectorFrameHeight", 0)),
                car,
                motorcycle,
                bus,
                truck,
                bicycle,
                total,
                parseDetections(detectionArray)
            );
        }

        TrafficSnapshot withLocalAnalysis(String raw, String activeImage) {
            if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(activeImage)) return this;
            try {
                JSONObject payload = new JSONObject(raw);
                int expectedLength = payload.optInt("imageLength", -1);
                String expectedTail = payload.optString("imageTail", "");
                String actualTail = activeImage.substring(Math.max(0, activeImage.length() - 48));
                if (expectedLength != activeImage.length() || !expectedTail.equals(actualTail)) return this;
                JSONArray localArray = payload.optJSONArray("detections");
                List<Detection> localDetections = parseDetections(localArray);
                return new TrafficSnapshot(
                    nama1,
                    nama2,
                    status,
                    cameraStatus,
                    detectorStatus,
                    trafficColor,
                    trafficDurationSec,
                    locationLabel,
                    source,
                    updatedAt,
                    lastSeen,
                    lastSeenText,
                    payload.optInt("frameWidth", detectorFrameWidth),
                    payload.optInt("frameHeight", detectorFrameHeight),
                    car,
                    motorcycle,
                    bus,
                    truck,
                    bicycle,
                    total,
                    localDetections
                );
            } catch (Exception ignored) {
                return this;
            }
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
                JSONObject box = obj.optJSONObject("box");
                if (box == null) box = obj.optJSONObject("bbox");
                if (box == null) box = obj.optJSONObject("boundingBox");
                JSONArray bbox = obj.optJSONArray("bbox");
                if (bbox == null) bbox = obj.optJSONArray("box");

                double x = obj.optDouble("x", obj.optDouble("x1", obj.optDouble("left", box != null ? box.optDouble("x", box.optDouble("x1", box.optDouble("left", 0d))) : 0d)));
                double y = obj.optDouble("y", obj.optDouble("y1", obj.optDouble("top", box != null ? box.optDouble("y", box.optDouble("y1", box.optDouble("top", 0d))) : 0d)));
                double width = obj.optDouble("width", obj.optDouble("w", box != null ? box.optDouble("width", box.optDouble("w", 0d)) : 0d));
                double height = obj.optDouble("height", obj.optDouble("h", box != null ? box.optDouble("height", box.optDouble("h", 0d)) : 0d));

                if (bbox != null && bbox.length() >= 4) {
                    x = bbox.optDouble(0, x);
                    y = bbox.optDouble(1, y);
                    double third = bbox.optDouble(2, width);
                    double fourth = bbox.optDouble(3, height);
                    String format = obj.optString("bboxFormat", obj.optString("boxFormat", "")).toLowerCase(Locale.ROOT);
                    if (format.contains("xyxy") || format.contains("x1y1x2y2")) {
                        width = third - x;
                        height = fourth - y;
                    } else {
                        width = third;
                        height = fourth;
                    }
                }

                double right = obj.optDouble("right", obj.optDouble("x2", box != null ? box.optDouble("right", box.optDouble("x2", 0d)) : 0d));
                double bottom = obj.optDouble("bottom", obj.optDouble("y2", box != null ? box.optDouble("bottom", box.optDouble("y2", 0d)) : 0d));
                if (width <= 0d && right > x) width = right - x;
                if (height <= 0d && bottom > y) height = bottom - y;
                if (width <= 0d || height <= 0d) continue;
                detections.add(new Detection(
                    firstNonEmpty(obj.optString("label", ""), firstNonEmpty(obj.optString("class", ""), firstNonEmpty(obj.optString("name", ""), obj.optString("object", "object")))),
                    obj.optDouble("confidence", obj.optDouble("score", 0d)),
                    x,
                    y,
                    width,
                    height
                ));
            }
            return detections;
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

        String imageForCarousel(long now) {
            boolean first = ((now / CAROUSEL_INTERVAL_MS) % 2L) == 0L;
            String selected = first ? nama1 : nama2;
            if (!TextUtils.isEmpty(selected)) return selected;
            return first ? nama2 : nama1;
        }

        boolean hasCarouselImages() {
            return !TextUtils.isEmpty(nama1) || !TextUtils.isEmpty(nama2);
        }

        int vehicleCount() {
            return total > 0 ? total : car + motorcycle + bus + truck + bicycle;
        }

        boolean isFresh(long now) {
            return lastSeen > 0L && now - lastSeen <= STALE_AFTER_MS && lastSeen - now <= 300_000L;
        }

        private static long latestDeviceTelemetry(JSONObject device) {
            if (device == null) return 0L;
            long latest = Math.max(
                device.optLong("lastSeen", device.optLong("updatedAt", 0L)),
                Math.max(device.optLong("cameraUpdatedAt", 0L), device.optLong("detectorUpdatedAt", 0L))
            );
            JSONObject camera = device.optJSONObject("camera");
            if (camera != null) latest = Math.max(latest, camera.optLong("updatedAt", camera.optLong("heartbeatAt", 0L)));
            JSONObject runtime = device.optJSONObject("runtime");
            if (runtime != null) latest = Math.max(latest, runtime.optLong("heartbeatAt", runtime.optLong("updatedAt", 0L)));
            return normalizeEpoch(latest);
        }

        boolean detectorOnline() {
            return "online".equalsIgnoreCase(detectorStatus)
                || "ok".equalsIgnoreCase(detectorStatus)
                || detectorStatus.toLowerCase(Locale.ROOT).startsWith("browser-rfdetr");
        }

        boolean raspberryOnline(long now) {
            return isFresh(now)
                && (statusOnline() || !"offline".equalsIgnoreCase(status));
        }

        boolean statusOnline() {
            return "online".equalsIgnoreCase(status)
                || "online".equalsIgnoreCase(cameraStatus)
                || detectorOnline();
        }

        String locationLabel() {
            return TextUtils.isEmpty(locationLabel) ? "Lokasi sistem" : locationLabel;
        }

        private static String cleanLocationLabel(String value) {
            if (TextUtils.isEmpty(value)) return "";
            String safe = value.trim();
            String lower = safe.toLowerCase(Locale.ROOT);
            if (lower.contains("mencari satelit")
                || lower.contains("gps aktif")
                || lower.contains("gps-waiting")
                || lower.contains("waiting")
                || "jalan -".equals(lower)) {
                return "";
            }
            return safe;
        }

        private static String locationFromObject(JSONObject location) {
            if (location == null) return "";
            String label = firstNonEmpty(
                location.optString("label", ""),
                firstNonEmpty(location.optString("name", ""), firstNonEmpty(location.optString("address", ""), location.optString("roadName", "")))
            );
            if (!TextUtils.isEmpty(label)) return label;
            if ((location.has("lat") || location.has("latitude")) && (location.has("lng") || location.has("lon") || location.has("longitude"))) {
                double lat = location.optDouble("lat", location.optDouble("latitude", 0d));
                double lng = location.optDouble("lng", location.optDouble("lon", location.optDouble("longitude", 0d)));
                return String.format(Locale.US, "%.6f, %.6f", lat, lng);
            }
            return "";
        }

        String lastOnlineText() {
            if (!TextUtils.isEmpty(lastSeenText)) return lastSeenText;
            if (updatedAt <= 0L) return "belum ada data";
            SimpleDateFormat format = new SimpleDateFormat("dd MMM yyyy HH:mm", new Locale("id", "ID"));
            return format.format(new Date(updatedAt));
        }

        String trafficLabel() {
            if ("green".equalsIgnoreCase(trafficColor)) return "Hijau";
            if ("yellow".equalsIgnoreCase(trafficColor)) return "Kuning";
            return "Merah";
        }

        int trafficColorInt() {
            if ("green".equalsIgnoreCase(trafficColor)) return 0xFF22C55E;
            if ("yellow".equalsIgnoreCase(trafficColor)) return 0xFFFACC15;
            return 0xFFEF4444;
        }

        String statusLine(long now) {
            if (raspberryOnline(now)) {
                return isFresh(now) ? "Online - gambar diperbarui realtime" : "Online - memakai update terakhir";
            }
            if (!isFresh(now)) return "Offline • memakai background cadangan";
            if ("online".equalsIgnoreCase(cameraStatus) || "online".equalsIgnoreCase(status)) {
                return "Online • gambar diperbarui realtime";
            }
            return "Offline • memakai data terakhir";
        }

        String cameraSourceLabel() {
            if ("raspberry-camera".equalsIgnoreCase(source)) return "Raspberry Pi camera";
            return TextUtils.isEmpty(source) ? "camera dataset" : source;
        }
    }
}
