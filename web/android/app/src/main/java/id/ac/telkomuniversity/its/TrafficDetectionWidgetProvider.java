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
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DATASET_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
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
            deviceJson = fetchJson(FIREBASE_DEVICE_URL);
            prefs.edit().putString(PREF_DEVICE, deviceJson).apply();
        } catch (Exception ignored) {
        }

        try {
            return TrafficSnapshot.fromJson(datasetJson, deviceJson);
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

        Bitmap camera = online ? decodeImageValue(snapshot.imageForCarousel(now)) : null;
        boolean hasCameraFrame = camera != null;
        if (!hasCameraFrame) {
            camera = loadFallbackBitmap(context);
        }

        DrawInfo drawInfo = drawBackground(canvas, camera, canvasHeight);
        if (online && hasCameraFrame) {
            drawDetectionBoxes(canvas, snapshot, drawInfo, canvasHeight);
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

    private void drawDetectionBoxes(Canvas canvas, TrafficSnapshot snapshot, DrawInfo drawInfo, int canvasHeight) {
        if (snapshot.detections.isEmpty()) return;

        int sourceWidth = snapshot.detectorFrameWidth > 0 ? snapshot.detectorFrameWidth : drawInfo.sourceWidth;
        int sourceHeight = snapshot.detectorFrameHeight > 0 ? snapshot.detectorFrameHeight : drawInfo.sourceHeight;
        if (sourceWidth <= 0 || sourceHeight <= 0) return;

        canvas.save();
        canvas.clipRect(0, 0, CANVAS_WIDTH, canvasHeight);
        for (Detection detection : snapshot.detections) {
            RectF box = new RectF(
                drawInfo.rect.left + (float) (detection.x / sourceWidth) * drawInfo.rect.width(),
                drawInfo.rect.top + (float) (detection.y / sourceHeight) * drawInfo.rect.height(),
                drawInfo.rect.left + (float) ((detection.x + detection.width) / sourceWidth) * drawInfo.rect.width(),
                drawInfo.rect.top + (float) ((detection.y + detection.height) / sourceHeight) * drawInfo.rect.height()
            );
            box.intersect(new RectF(0, 0, CANVAS_WIDTH, canvasHeight));
            if (box.width() < 8f || box.height() < 8f) continue;

            int color = colorForLabel(detection.label);
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(4.5f);
            stroke.setColor(color);
            canvas.drawRoundRect(box, 8f, 8f, stroke);

            String label = detection.label + " " + Math.round(detection.confidence * 100d) + "%";
            Paint labelText = new Paint(Paint.ANTI_ALIAS_FLAG);
            labelText.setTextSize(20f);
            labelText.setFakeBoldText(true);
            float labelWidth = labelText.measureText(label) + 18f;
            RectF labelBg = new RectF(box.left, Math.max(0f, box.top - 31f), Math.min(CANVAS_WIDTH, box.left + labelWidth), Math.max(31f, box.top));
            Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            labelPaint.setColor(color);
            canvas.drawRoundRect(labelBg, 9f, 9f, labelPaint);
            labelText.setColor(0xFF07111F);
            canvas.drawText(label, labelBg.left + 9f, labelBg.top + 22f, labelText);
        }
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
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStrokeWidth(4f);
        paint.setStyle(Paint.Style.STROKE);

        if ("motorcycle".equals(type) || "bicycle".equals(type)) {
            canvas.drawCircle(cx - 16f, cy + 10f, 9f, paint);
            canvas.drawCircle(cx + 16f, cy + 10f, 9f, paint);
            canvas.drawLine(cx - 16f, cy + 10f, cx, cy - 8f, paint);
            canvas.drawLine(cx, cy - 8f, cx + 16f, cy + 10f, paint);
            canvas.drawLine(cx - 2f, cy - 8f, cx + 10f, cy - 18f, paint);
            if ("motorcycle".equals(type)) {
                paint.setStyle(Paint.Style.FILL);
                canvas.drawRoundRect(new RectF(cx - 8f, cy - 18f, cx + 12f, cy - 8f), 4f, 4f, paint);
            }
            return;
        }

        if ("bus".equals(type)) {
            canvas.drawRoundRect(new RectF(cx - 25f, cy - 16f, cx + 25f, cy + 12f), 8f, 8f, paint);
            canvas.drawLine(cx - 12f, cy - 16f, cx - 12f, cy + 4f, paint);
            canvas.drawLine(cx + 6f, cy - 16f, cx + 6f, cy + 4f, paint);
            canvas.drawCircle(cx - 14f, cy + 15f, 5f, paint);
            canvas.drawCircle(cx + 16f, cy + 15f, 5f, paint);
            return;
        }

        if ("truck".equals(type)) {
            canvas.drawRoundRect(new RectF(cx - 28f, cy - 12f, cx + 6f, cy + 10f), 5f, 5f, paint);
            Path cabin = new Path();
            cabin.moveTo(cx + 6f, cy - 6f);
            cabin.lineTo(cx + 22f, cy - 6f);
            cabin.lineTo(cx + 28f, cy + 10f);
            cabin.lineTo(cx + 6f, cy + 10f);
            cabin.close();
            canvas.drawPath(cabin, paint);
            canvas.drawCircle(cx - 16f, cy + 14f, 5f, paint);
            canvas.drawCircle(cx + 17f, cy + 14f, 5f, paint);
            return;
        }

        if ("total".equals(type)) {
            paint.setStyle(Paint.Style.FILL);
            canvas.drawCircle(cx - 13f, cy - 4f, 7f, paint);
            canvas.drawCircle(cx + 13f, cy - 4f, 7f, paint);
            canvas.drawCircle(cx, cy + 12f, 8f, paint);
            return;
        }

        canvas.drawRoundRect(new RectF(cx - 26f, cy - 10f, cx + 26f, cy + 12f), 8f, 8f, paint);
        canvas.drawLine(cx - 14f, cy - 10f, cx - 6f, cy - 22f, paint);
        canvas.drawLine(cx - 6f, cy - 22f, cx + 12f, cy - 22f, paint);
        canvas.drawLine(cx + 12f, cy - 22f, cx + 22f, cy - 10f, paint);
        canvas.drawCircle(cx - 15f, cy + 15f, 5f, paint);
        canvas.drawCircle(cx + 16f, cy + 15f, 5f, paint);
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
        String value = label == null ? "" : label.toLowerCase(Locale.ROOT);
        if ("car".equals(value)) return 0xFF38BDF8;
        if ("motorcycle".equals(value)) return 0xFFA78BFA;
        if ("bus".equals(value)) return 0xFFFACC15;
        if ("truck".equals(value)) return 0xFFFB7185;
        if ("bicycle".equals(value)) return 0xFF34D399;
        return 0xFFFFFFFF;
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
                dataset.optLong("updatedAt", device.optLong("lastSeen", 0L)),
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

        private static int optInt(JSONObject object, String key, int fallback) {
            return object == null ? fallback : object.optInt(key, fallback);
        }

        private static String firstNonEmpty(String first, String fallback) {
            if (first != null && !first.trim().isEmpty()) return first.trim();
            return fallback == null ? "" : fallback.trim();
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
            return updatedAt > 0L && now - updatedAt <= STALE_AFTER_MS;
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
