package id.ac.telkomuniversity.its;

import android.content.Context;
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
import android.text.TextUtils;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
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

final class LockScreenRenderer {
    static final int WIDGET_WIDTH = 720;
    static final int WIDGET_HEIGHT = 1280;

    private static final int BASE_WIDTH = 1080;
    private static final int BASE_HEIGHT = 1920;
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_DATASET = "traffic_dataset_snapshot";
    private static final String PREF_DEVICE = "traffic_device_snapshot";
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DATASET_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
    private static final String FIREBASE_DEVICE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices/raspberry-its.json";
    private static final long STALE_AFTER_MS = 45_000L;
    static final long LIVE_REFRESH_MS = 10_000L;
    private static final long CAROUSEL_INTERVAL_MS = LIVE_REFRESH_MS;

    private LockScreenRenderer() {
    }

    static Snapshot load(Context context) {
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
            return Snapshot.fromJson(datasetJson, deviceJson);
        } catch (Exception ignored) {
            return Snapshot.fallback();
        }
    }

    static Bitmap render(Context context, Snapshot snapshot, int width, int height, long now, float swipeProgress, boolean interactive) {
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        draw(context, canvas, snapshot, width, height, now, swipeProgress, interactive);
        return output;
    }

    static void draw(Context context, Canvas canvas, Snapshot snapshot, int width, int height, long now, float swipeProgress, boolean interactive) {
        Snapshot safeSnapshot = snapshot == null ? Snapshot.fallback() : snapshot;
        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        drawBase(context, canvas, safeSnapshot, now, clamp01(swipeProgress), interactive);
        canvas.restore();
    }

    private static void drawBase(Context context, Canvas canvas, Snapshot snapshot, long now, float swipeProgress, boolean interactive) {
        canvas.drawColor(0xFF08090D);
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setShader(new LinearGradient(0, 0, 0, BASE_HEIGHT, 0xFF101216, 0xFF07080B, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT, background);
        drawSubtleGrid(canvas, now);
        drawHeader(canvas, snapshot, now);
        drawContentCard(context, canvas, snapshot, now);
        drawFooter(canvas, snapshot, now, swipeProgress, interactive);
    }

    private static void drawSubtleGrid(Canvas canvas, long now) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(0x1414F195);
        line.setStrokeWidth(1.4f);
        float phase = (now % 1800L) / 1800f * 42f;
        for (float y = 360f + phase; y < 1580f; y += 84f) {
            canvas.drawLine(44f, y, BASE_WIDTH - 44f, y, line);
        }
    }

    private static void drawHeader(Canvas canvas, Snapshot snapshot, long now) {
        Locale locale = new Locale("id", "ID");
        String date = new SimpleDateFormat("EEEE, dd \u2022 MM \u2022 yyyy", locale).format(new Date(now));
        String time = new SimpleDateFormat("HH:mm", locale).format(new Date(now));
        String hour = time.length() >= 2 ? time.substring(0, 2) : time;
        String minute = time.length() >= 5 ? time.substring(3, 5) : "00";

        Paint datePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        datePaint.setColor(0xFFF8FAFC);
        datePaint.setTextSize(37f);
        datePaint.setFakeBoldText(true);
        canvas.drawText(date, 46f, 122f, datePaint);

        Paint hourPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        hourPaint.setColor(Color.WHITE);
        hourPaint.setTextSize(154f);
        hourPaint.setFakeBoldText(true);
        canvas.drawText(hour, 42f, 278f, hourPaint);

        Paint colonPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        colonPaint.setColor(0xFFF8FAFC);
        colonPaint.setTextSize(145f);
        colonPaint.setFakeBoldText(true);
        float colonX = 42f + hourPaint.measureText(hour) + 24f;
        canvas.drawText(":", colonX, 270f, colonPaint);

        Paint minuteStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        minuteStroke.setStyle(Paint.Style.STROKE);
        minuteStroke.setStrokeWidth(3.4f);
        minuteStroke.setColor(0xFFF8FAFC);
        minuteStroke.setTextSize(154f);
        minuteStroke.setFakeBoldText(true);
        float minuteX = colonX + colonPaint.measureText(":") + 24f;
        canvas.drawText(minute, minuteX, 278f, minuteStroke);

        drawStatusChip(canvas, snapshot, now);
    }

    private static void drawGearIcon(Canvas canvas, float cx, float cy) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(0xFFF8FAFC);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(8f);
        canvas.drawCircle(cx, cy, 19f, paint);
        for (int i = 0; i < 8; i++) {
            double a = i * Math.PI / 4d;
            float x1 = cx + (float) Math.cos(a) * 28f;
            float y1 = cy + (float) Math.sin(a) * 28f;
            float x2 = cx + (float) Math.cos(a) * 38f;
            float y2 = cy + (float) Math.sin(a) * 38f;
            canvas.drawLine(x1, y1, x2, y2, paint);
        }
    }

    private static void drawStatusChip(Canvas canvas, Snapshot snapshot, long now) {
        boolean online = snapshot.online(now);
        String label = online ? "Sistem online" : "Sistem offline";
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(30f);
        text.setFakeBoldText(true);
        float width = Math.max(258f, text.measureText(label) + 86f);
        RectF chip = new RectF(BASE_WIDTH - width - 42f, 58f, BASE_WIDTH - 42f, 122f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(online ? 0x3322C55E : 0x33EF4444);
        canvas.drawRoundRect(chip, 32f, 32f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2f);
        stroke.setColor(online ? 0xAA22C55E : 0xAAEF4444);
        canvas.drawRoundRect(chip, 32f, 32f, stroke);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(online ? 0xFF22C55E : 0xFFEF4444);
        canvas.drawCircle(chip.left + 34f, chip.centerY(), 11f, dot);
        text.setColor(0xFFF8FAFC);
        canvas.drawText(label, chip.left + 58f, chip.top + 42f, text);
    }

    private static void drawContentCard(Context context, Canvas canvas, Snapshot snapshot, long now) {
        RectF card = new RectF(42f, 410f, BASE_WIDTH - 42f, 1578f);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(0xEE171A20);
        canvas.drawRoundRect(card, 40f, 40f, cardPaint);
        Paint cardStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardStroke.setStyle(Paint.Style.STROKE);
        cardStroke.setStrokeWidth(1.8f);
        cardStroke.setColor(0x22FFFFFF);
        canvas.drawRoundRect(card, 40f, 40f, cardStroke);

        RectF image1Rect = new RectF(70f, 448f, BASE_WIDTH - 70f, 808f);
        RectF image2Rect = new RectF(70f, 830f, BASE_WIDTH - 70f, 1190f);
        DrawInfo image1Info = drawCameraFrame(context, canvas, snapshot, image1Rect, 1);
        DrawInfo image2Info = drawCameraFrame(context, canvas, snapshot, image2Rect, 2);
        drawAiCanvas(canvas, snapshot, image1Info, image1Rect, now, 1);
        drawAiCanvas(canvas, snapshot, image2Info, image2Rect, now, 2);
        drawSnapshotSummary(canvas, snapshot, now);
    }

    private static DrawInfo drawCameraFrame(Context context, Canvas canvas, Snapshot snapshot, RectF imageRect, int slot) {
        Bitmap image = snapshot.imageBitmap(context, slot);
        Paint clipBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        clipBg.setColor(0xFF0E1420);
        canvas.drawRoundRect(imageRect, 24f, 24f, clipBg);

        DrawInfo info = new DrawInfo(imageRect, 1280, 720);
        canvas.save();
        Path clip = new Path();
        clip.addRoundRect(imageRect, 24f, 24f, Path.Direction.CW);
        canvas.clipPath(clip);
        if (image != null) {
            info = drawBitmapCover(canvas, image, imageRect);
        } else {
            Paint gradient = new Paint(Paint.ANTI_ALIAS_FLAG);
            gradient.setShader(new LinearGradient(imageRect.left, imageRect.top, imageRect.right, imageRect.bottom, 0xFF172033, 0xFF0B1220, Shader.TileMode.CLAMP));
            canvas.drawRect(imageRect, gradient);
            Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
            text.setColor(0xFFCBD5E1);
            text.setTextSize(34f);
            text.setFakeBoldText(true);
            drawTextLimited(canvas, "Menunggu gambar histori RTDB", imageRect.left + 34f, imageRect.centerY() - 18f, text, imageRect.width() - 68f);
            text.setTextSize(25f);
            text.setFakeBoldText(false);
            text.setColor(0xFF94A3B8);
            drawTextLimited(canvas, "Tidak memakai gambar dummy lokal", imageRect.left + 34f, imageRect.centerY() + 28f, text, imageRect.width() - 68f);
        }

        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setShader(new LinearGradient(0, imageRect.top, 0, imageRect.bottom, 0x33000000, 0x99000000, Shader.TileMode.CLAMP));
        canvas.drawRect(imageRect, shade);
        canvas.restore();
        return info;
    }

    private static DrawInfo drawBitmapCover(Canvas canvas, Bitmap image, RectF rect) {
        float scale = Math.max(rect.width() / image.getWidth(), rect.height() / image.getHeight());
        float drawWidth = image.getWidth() * scale;
        float drawHeight = image.getHeight() * scale;
        float left = rect.left + (rect.width() - drawWidth) / 2f;
        float top = rect.top + (rect.height() - drawHeight) / 2f;
        RectF dst = new RectF(left, top, left + drawWidth, top + drawHeight);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.drawBitmap(image, null, dst, paint);
        return new DrawInfo(dst, image.getWidth(), image.getHeight());
    }

    private static void drawAiCanvas(Canvas canvas, Snapshot snapshot, DrawInfo drawInfo, RectF imageRect, long now, int slot) {
        Paint scan = new Paint(Paint.ANTI_ALIAS_FLAG);
        float progress = (now % 2600L) / 2600f;
        float y = imageRect.top + imageRect.height() * progress;
        scan.setShader(new LinearGradient(0, y - 38f, 0, y + 38f, 0x0014F195, 0xCC14F195, Shader.TileMode.CLAMP));
        canvas.drawRect(imageRect.left, y - 38f, imageRect.right, y + 38f, scan);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(0xFF14F195);
        line.setStrokeWidth(3.6f);
        canvas.drawLine(imageRect.left + 24f, y, imageRect.right - 24f, y, line);

        List<Detection> detections = snapshot.detectionsForSlot(slot);
        Detection primary = snapshot.primaryDetection(detections);
        if (primary == null) {
            drawSearchReticle(canvas, imageRect, now);
        } else {
            drawDetections(canvas, detections, snapshot.frameWidthForSlot(slot), snapshot.frameHeightForSlot(slot), drawInfo, imageRect);
            drawObjectLock(canvas, primary, snapshot.frameWidthForSlot(slot), snapshot.frameHeightForSlot(slot), drawInfo, imageRect, now);
        }

        Paint chipBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipBg.setColor(0xCC0B1120);
        RectF chip = new RectF(imageRect.left + 20f, imageRect.bottom - 70f, imageRect.left + 496f, imageRect.bottom - 20f);
        canvas.drawRoundRect(chip, 25f, 25f, chipBg);
        Paint chipText = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipText.setColor(0xFFD7FFF0);
        chipText.setTextSize(24f);
        chipText.setFakeBoldText(true);
        String chipLabel = primary == null
            ? "RF-DETR memindai gambar " + slot
            : "Gambar " + slot + " - " + detections.size() + " object";
        drawTextLimited(canvas, chipLabel, chip.left + 24f, chip.top + 34f, chipText, chip.width() - 48f);
    }

    private static void drawSearchReticle(Canvas canvas, RectF imageRect, long now) {
        float pulse = 0.5f + 0.5f * (float) Math.sin(now / 180d);
        float cx = imageRect.centerX() + (float) Math.sin(now / 620d) * imageRect.width() * 0.22f;
        float cy = imageRect.centerY() + (float) Math.cos(now / 760d) * imageRect.height() * 0.18f;
        float size = 78f + pulse * 18f;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5f);
        paint.setColor(0xFF14F195);
        float gap = size * 0.42f;
        canvas.drawLine(cx - size, cy - size, cx - gap, cy - size, paint);
        canvas.drawLine(cx - size, cy - size, cx - size, cy - gap, paint);
        canvas.drawLine(cx + gap, cy - size, cx + size, cy - size, paint);
        canvas.drawLine(cx + size, cy - size, cx + size, cy - gap, paint);
        canvas.drawLine(cx - size, cy + size, cx - gap, cy + size, paint);
        canvas.drawLine(cx - size, cy + size, cx - size, cy + gap, paint);
        canvas.drawLine(cx + gap, cy + size, cx + size, cy + size, paint);
        canvas.drawLine(cx + size, cy + gap, cx + size, cy + size, paint);
    }

    private static void drawDetections(Canvas canvas, List<Detection> detections, int requestedFrameWidth, int requestedFrameHeight, DrawInfo drawInfo, RectF imageRect) {
        int frameWidth = requestedFrameWidth > 0 ? requestedFrameWidth : drawInfo.sourceWidth;
        int frameHeight = requestedFrameHeight > 0 ? requestedFrameHeight : drawInfo.sourceHeight;
        if (frameWidth <= 0 || frameHeight <= 0) return;

        canvas.save();
        canvas.clipRect(imageRect);
        int count = 0;
        for (Detection detection : detections) {
            RectF box = detectionBox(detection, drawInfo, frameWidth, frameHeight);
            if (!box.intersect(imageRect) || box.width() < 8f || box.height() < 8f) continue;
            int color = colorForLabel(detection.label);
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(count == 0 ? 5.8f : 3.8f);
            stroke.setColor(color);
            canvas.drawRoundRect(box, 10f, 10f, stroke);
            drawDetectionLabel(canvas, detection, box, color);
            count++;
            if (count >= 12) break;
        }
        canvas.restore();
    }

    private static void drawObjectLock(Canvas canvas, Detection detection, int requestedFrameWidth, int requestedFrameHeight, DrawInfo drawInfo, RectF imageRect, long now) {
        int frameWidth = requestedFrameWidth > 0 ? requestedFrameWidth : drawInfo.sourceWidth;
        int frameHeight = requestedFrameHeight > 0 ? requestedFrameHeight : drawInfo.sourceHeight;
        RectF box = detectionBox(detection, drawInfo, frameWidth, frameHeight);
        if (!box.intersect(imageRect)) return;
        float pulse = 0.55f + 0.45f * (float) Math.sin(now / 150d);
        Paint lock = new Paint(Paint.ANTI_ALIAS_FLAG);
        lock.setStyle(Paint.Style.STROKE);
        lock.setStrokeWidth(7f);
        lock.setColor(adjustAlpha(0xFF14F195, (int) (160 + pulse * 95)));
        float len = Math.min(54f, Math.max(28f, Math.min(box.width(), box.height()) * 0.24f));
        canvas.drawLine(box.left, box.top, box.left + len, box.top, lock);
        canvas.drawLine(box.left, box.top, box.left, box.top + len, lock);
        canvas.drawLine(box.right, box.top, box.right - len, box.top, lock);
        canvas.drawLine(box.right, box.top, box.right, box.top + len, lock);
        canvas.drawLine(box.left, box.bottom, box.left + len, box.bottom, lock);
        canvas.drawLine(box.left, box.bottom, box.left, box.bottom - len, lock);
        canvas.drawLine(box.right, box.bottom, box.right - len, box.bottom, lock);
        canvas.drawLine(box.right, box.bottom, box.right, box.bottom - len, lock);
    }

    private static void drawDetectionLabel(Canvas canvas, Detection detection, RectF box, int color) {
        String label = detection.label + " " + Math.round(detection.confidence * 100d) + "%";
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(23f);
        text.setFakeBoldText(true);
        float width = Math.min(330f, text.measureText(label) + 28f);
        RectF bg = new RectF(box.left, Math.max(0f, box.top - 39f), box.left + width, Math.max(39f, box.top));
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(color);
        canvas.drawRoundRect(bg, 12f, 12f, fill);
        text.setColor(0xFF061018);
        drawTextLimited(canvas, label, bg.left + 14f, bg.top + 27f, text, width - 28f);
    }

    private static RectF detectionBox(Detection detection, DrawInfo drawInfo, int frameWidth, int frameHeight) {
        double x = detection.x;
        double y = detection.y;
        double w = detection.width;
        double h = detection.height;
        if (detection.normalized()) {
            x *= frameWidth;
            y *= frameHeight;
            w *= frameWidth;
            h *= frameHeight;
        }
        return new RectF(
            drawInfo.rect.left + (float) (x / frameWidth) * drawInfo.rect.width(),
            drawInfo.rect.top + (float) (y / frameHeight) * drawInfo.rect.height(),
            drawInfo.rect.left + (float) ((x + w) / frameWidth) * drawInfo.rect.width(),
            drawInfo.rect.top + (float) ((y + h) / frameHeight) * drawInfo.rect.height()
        );
    }

    private static void drawSnapshotSummary(Canvas canvas, Snapshot snapshot, long now) {
        RectF panel = detailBaseRect();
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setColor(0xFF22272F);
        canvas.drawRoundRect(panel, 26f, 26f, background);

        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setColor(0xFF91A0B4);
        label.setTextSize(23f);
        label.setFakeBoldText(true);
        canvas.drawText("LOKASI RASPBERRY", panel.left + 28f, panel.top + 43f, label);

        Paint value = new Paint(Paint.ANTI_ALIAS_FLAG);
        value.setColor(0xFFF8FAFC);
        value.setTextSize(31f);
        value.setFakeBoldText(true);
        drawTextLimited(canvas, snapshot.locationLabel(), panel.left + 28f, panel.top + 84f, value, panel.width() - 56f);

        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(0x22FFFFFF);
        divider.setStrokeWidth(2f);
        canvas.drawLine(panel.left + 28f, panel.top + 108f, panel.right - 28f, panel.top + 108f, divider);

        label.setTextSize(22f);
        canvas.drawText("STATUS OBJECT", panel.left + 28f, panel.top + 151f, label);
        String status = snapshot.detectionCount() > 0
            ? snapshot.detectionCount() + " object terdeteksi"
            : "RF-DETR sedang memindai";
        drawTextLimited(canvas, status, panel.left + 28f, panel.top + 194f, value, panel.width() - 260f);

        Paint action = new Paint(Paint.ANTI_ALIAS_FLAG);
        action.setColor(0xFF3B82F6);
        RectF actionRect = new RectF(panel.right - 218f, panel.top + 136f, panel.right - 26f, panel.top + 208f);
        canvas.drawRoundRect(actionRect, 24f, 24f, action);
        Paint actionText = new Paint(Paint.ANTI_ALIAS_FLAG);
        actionText.setColor(Color.WHITE);
        actionText.setTextSize(23f);
        actionText.setFakeBoldText(true);
        canvas.drawText("Lihat rincian", actionRect.left + 24f, actionRect.top + 45f, actionText);

        Paint meta = new Paint(Paint.ANTI_ALIAS_FLAG);
        meta.setColor(snapshot.online(now) ? 0xFF7EE7A8 : 0xFFFCA5A5);
        meta.setTextSize(22f);
        drawTextLimited(canvas, snapshot.timeText(), panel.left + 28f, panel.bottom - 28f, meta, panel.width() - 56f);
    }

    static RectF detailBaseRect() {
        return new RectF(82f, 1220f, BASE_WIDTH - 82f, 1548f);
    }

    static RectF detailCloseBaseRect() {
        return new RectF(BASE_WIDTH - 176f, 448f, BASE_WIDTH - 88f, 536f);
    }

    static void drawDetectionDetails(Canvas canvas, Snapshot snapshot, int width, int height) {
        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setColor(0xB8000000);
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, shade);

        RectF card = new RectF(54f, 410f, BASE_WIDTH - 54f, 1588f);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(0xFA171B23);
        canvas.drawRoundRect(card, 38f, 38f, cardPaint);

        Paint eyebrow = new Paint(Paint.ANTI_ALIAS_FLAG);
        eyebrow.setColor(0xFF7DB0FF);
        eyebrow.setTextSize(22f);
        eyebrow.setFakeBoldText(true);
        canvas.drawText("RF-DETR", card.left + 34f, card.top + 48f, eyebrow);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(Color.WHITE);
        title.setTextSize(38f);
        title.setFakeBoldText(true);
        canvas.drawText("Rincian Deteksi", card.left + 34f, card.top + 96f, title);

        RectF close = detailCloseBaseRect();
        Paint closePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        closePaint.setColor(0xFF283142);
        canvas.drawOval(close, closePaint);
        Paint closeText = new Paint(Paint.ANTI_ALIAS_FLAG);
        closeText.setColor(Color.WHITE);
        closeText.setTextSize(46f);
        closeText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("x", close.centerX(), close.centerY() + 15f, closeText);
        closeText.setTextAlign(Paint.Align.LEFT);

        List<Detection> detections = snapshot.allDetections();
        RectF countCard = new RectF(card.left + 30f, card.top + 130f, card.right - 30f, card.top + 222f);
        Paint countBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        countBg.setColor(0xFF202B3C);
        canvas.drawRoundRect(countCard, 22f, 22f, countBg);
        Paint countText = new Paint(Paint.ANTI_ALIAS_FLAG);
        countText.setColor(0xFFEAF2FF);
        countText.setTextSize(27f);
        countText.setFakeBoldText(true);
        canvas.drawText("Object terkonfirmasi", countCard.left + 24f, countCard.top + 57f, countText);
        countText.setTextSize(42f);
        countText.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(String.valueOf(detections.size()), countCard.right - 24f, countCard.top + 62f, countText);
        countText.setTextAlign(Paint.Align.LEFT);

        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(0xFFD7DFEA);
        body.setTextSize(25f);
        if (detections.isEmpty()) {
            drawTextLimited(canvas, "Belum ada object yang cukup yakin. Canvas tetap memindai dua snapshot Raspberry.", card.left + 34f, card.top + 300f, body, card.width() - 68f);
            canvas.restore();
            return;
        }

        float rowTop = card.top + 250f;
        int index = 1;
        for (Detection detection : detections) {
            if (index > 7) break;
            RectF row = new RectF(card.left + 30f, rowTop, card.right - 30f, rowTop + 116f);
            Paint rowBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            rowBg.setColor(0xFF222831);
            canvas.drawRoundRect(row, 20f, 20f, rowBg);
            Paint number = new Paint(Paint.ANTI_ALIAS_FLAG);
            number.setColor(0xFF0F172A);
            canvas.drawCircle(row.left + 48f, row.centerY(), 30f, number);
            Paint numberText = new Paint(Paint.ANTI_ALIAS_FLAG);
            numberText.setColor(Color.WHITE);
            numberText.setTextSize(24f);
            numberText.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(String.valueOf(index), row.left + 48f, row.centerY() + 8f, numberText);
            Paint name = new Paint(Paint.ANTI_ALIAS_FLAG);
            name.setColor(Color.WHITE);
            name.setTextSize(29f);
            name.setFakeBoldText(true);
            canvas.drawText(detection.displayName(), row.left + 96f, row.top + 45f, name);
            body.setTextSize(22f);
            canvas.drawText("Akurasi " + Math.round(detection.confidence * 100d) + "% - " + detection.sizeText(), row.left + 96f, row.top + 82f, body);
            rowTop += 132f;
            index++;
        }
        canvas.restore();
    }

    private static void drawDetailPanel(Canvas canvas, Snapshot snapshot, long now, float top) {
        Detection detection = snapshot.primaryDetection();
        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(0x22FFFFFF);
        divider.setStrokeWidth(2f);
        canvas.drawLine(82f, top - 20f, BASE_WIDTH - 82f, top - 20f, divider);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(0xFFF8FAFC);
        title.setTextSize(39f);
        title.setFakeBoldText(true);
        canvas.drawText(detection == null ? "Mencari object" : "Detail object", 82f, top + 34f, title);

        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setTextSize(28f);
        body.setColor(0xFFD8DEE9);
        drawInfoRow(canvas, "\u25F7", snapshot.timeText(), 86f, top + 92f, body, 860f);
        drawInfoRow(canvas, "\u2316", snapshot.locationLabel(), 86f, top + 146f, body, 860f);
        drawInfoRow(canvas, "\u25C9", snapshot.aiStatus(now), 86f, top + 200f, body, 860f);
        drawInfoRow(canvas, "#", snapshot.liveSummary(now), 86f, top + 254f, body, 860f);

        float boxTop = top + 294f;
        RectF info = new RectF(82f, boxTop, BASE_WIDTH - 82f, boxTop + 238f);
        Paint infoBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        infoBg.setColor(0xFF22272F);
        canvas.drawRoundRect(info, 26f, 26f, infoBg);

        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setColor(0xFF9AA7B8);
        label.setTextSize(24f);
        Paint value = new Paint(Paint.ANTI_ALIAS_FLAG);
        value.setColor(0xFFFFFFFF);
        value.setTextSize(34f);
        value.setFakeBoldText(true);

        if (detection == null) {
            canvas.drawText("STATUS", info.left + 28f, info.top + 46f, label);
            drawTextLimited(canvas, snapshot.vehicleCount() > 0 ? "Object aggregate terdeteksi" : "Belum ada object terkunci", info.left + 28f, info.top + 88f, value, info.width() - 56f);
            label.setTextSize(25f);
            drawTextLimited(canvas, snapshot.breakdownText(), info.left + 28f, info.top + 145f, label, info.width() - 56f);
            drawTextLimited(canvas, "Bounding box muncul saat RTDB mengirim koordinat deteksi.", info.left + 28f, info.top + 190f, label, info.width() - 56f);
            return;
        }

        canvas.drawText("NAMA OBJECT", info.left + 28f, info.top + 44f, label);
        drawTextLimited(canvas, detection.displayName(), info.left + 28f, info.top + 88f, value, 410f);

        canvas.drawText("KEYAKINAN", info.left + 534f, info.top + 44f, label);
        drawTextLimited(canvas, Math.round(detection.confidence * 100d) + "%", info.left + 534f, info.top + 88f, value, 260f);

        canvas.drawText("UKURAN DETEKSI", info.left + 28f, info.top + 144f, label);
        drawTextLimited(canvas, detection.sizeText(), info.left + 28f, info.top + 188f, value, 410f);

        canvas.drawText("AREA FRAME", info.left + 534f, info.top + 144f, label);
        drawTextLimited(canvas, detection.areaText(), info.left + 534f, info.top + 188f, value, 260f);
    }

    private static void drawInfoRow(Canvas canvas, String icon, String textValue, float x, float y, Paint body, float maxWidth) {
        Paint iconPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconPaint.setColor(0xFF73A7FF);
        iconPaint.setTextSize(29f);
        iconPaint.setFakeBoldText(true);
        canvas.drawText(icon, x, y, iconPaint);
        drawTextLimited(canvas, textValue, x + 46f, y, body, maxWidth);
    }

    private static void drawFooter(Canvas canvas, Snapshot snapshot, long now, float swipeProgress, boolean interactive) {
        RectF slider = sliderBaseRect();
        Paint sliderBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        sliderBg.setColor(0xCC171A20);
        canvas.drawRoundRect(slider, 52f, 52f, sliderBg);
        Paint sliderStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        sliderStroke.setStyle(Paint.Style.STROKE);
        sliderStroke.setStrokeWidth(2f);
        sliderStroke.setColor(interactive ? 0x6638BDF8 : 0x3322C55E);
        canvas.drawRoundRect(slider, 52f, 52f, sliderStroke);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(0x3322C55E);
        RectF fill = new RectF(slider.left, slider.top, slider.left + slider.width() * Math.max(0.18f, swipeProgress), slider.bottom);
        canvas.drawRoundRect(fill, 52f, 52f, track);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(30f);
        text.setFakeBoldText(true);
        text.setColor(0xFFE8EEF8);
        String label = swipeProgress > 0.72f ? "Lepas untuk buka" : "Geser untuk buka";
        float labelX = slider.left + (slider.width() - text.measureText(label)) / 2f + 42f;
        canvas.drawText(label, labelX, slider.top + 61f, text);

        Paint chevron = new Paint(Paint.ANTI_ALIAS_FLAG);
        chevron.setStyle(Paint.Style.STROKE);
        chevron.setStrokeWidth(4f);
        chevron.setColor(0x88FFFFFF);
        float phase = ((now % 1100L) / 1100f) * 18f;
        drawChevron(canvas, slider.right - 124f + phase, slider.centerY(), chevron);
        drawChevron(canvas, slider.right - 88f + phase, slider.centerY(), chevron);

        float knobRadius = 48f;
        float knobX = slider.left + knobRadius + (slider.width() - knobRadius * 2f) * swipeProgress;
        Paint knob = new Paint(Paint.ANTI_ALIAS_FLAG);
        knob.setColor(0xFF2D5BCA);
        canvas.drawCircle(knobX, slider.centerY(), knobRadius, knob);
        Paint power = new Paint(Paint.ANTI_ALIAS_FLAG);
        power.setStyle(Paint.Style.STROKE);
        power.setStrokeWidth(8f);
        power.setStrokeCap(Paint.Cap.ROUND);
        power.setColor(Color.WHITE);
        canvas.drawArc(new RectF(knobX - 22f, slider.centerY() - 22f, knobX + 22f, slider.centerY() + 22f), 130f, 280f, false, power);
        canvas.drawLine(knobX, slider.centerY() - 33f, knobX, slider.centerY() - 6f, power);

    }

    static RectF sliderBaseRect() {
        return new RectF(116f, 1718f, BASE_WIDTH - 116f, 1828f);
    }

    private static void drawSmallDecision(Canvas canvas, float x, float y, float width, String label, int color) {
        RectF rect = new RectF(x, y, x + width, y + 72f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(0xCC171A20);
        canvas.drawRoundRect(rect, 36f, 36f, bg);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(color);
        canvas.drawCircle(rect.left + 34f, rect.centerY(), 12f, dot);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(0xFFE8EEF8);
        text.setTextSize(25f);
        text.setFakeBoldText(true);
        drawTextLimited(canvas, label, rect.left + 62f, rect.top + 45f, text, width - 82f);
    }

    private static void drawRoundAction(Canvas canvas, float cx, float cy, String label, int accent) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(0xD014171D);
        canvas.drawCircle(cx, cy, 55f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(3f);
        stroke.setColor(adjustAlpha(accent, 160));
        canvas.drawCircle(cx, cy, 55f, stroke);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(0xFFF8FAFC);
        text.setTextSize(22f);
        text.setFakeBoldText(true);
        canvas.drawText(label, cx - text.measureText(label) / 2f, cy + 8f, text);
    }

    private static void drawChevron(Canvas canvas, float cx, float cy, Paint paint) {
        Path path = new Path();
        path.moveTo(cx - 8f, cy - 15f);
        path.lineTo(cx + 8f, cy);
        path.lineTo(cx - 8f, cy + 15f);
        canvas.drawPath(path, paint);
    }

    private static void drawTextLimited(Canvas canvas, String value, float x, float y, Paint paint, float maxWidth) {
        canvas.drawText(ellipsize(value, paint, maxWidth), x, y, paint);
    }

    private static String ellipsize(String value, Paint paint, float maxWidth) {
        if (value == null) return "";
        String clean = value.trim();
        if (paint.measureText(clean) <= maxWidth) return clean;
        String suffix = "...";
        int end = clean.length();
        while (end > 0 && paint.measureText(clean.substring(0, end).trim() + suffix) > maxWidth) {
            end--;
        }
        return end <= 0 ? suffix : clean.substring(0, end).trim() + suffix;
    }

    private static String fetchJson(String url) throws Exception {
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

    private static Bitmap decodeImageValue(Context context, String value) {
        if (TextUtils.isEmpty(value)) return null;
        String trimmed = value.trim();
        try {
            if (trimmed.startsWith("data:image/")) {
                int comma = trimmed.indexOf(',');
                if (comma < 0) return null;
                byte[] bytes = Base64.decode(trimmed.substring(comma + 1), Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                return bitmap;
            }
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                return fetchBitmap(trimmed);
            }
            if (looksLikeBase64Image(trimmed)) {
                byte[] bytes = Base64.decode(trimmed, Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean looksLikeBase64Image(String value) {
        if (value.length() < 80 || value.contains("/") && value.contains(".")) return false;
        return value.startsWith("/9j/")
            || value.startsWith("iVBOR")
            || value.startsWith("R0lGOD")
            || value.startsWith("UklGR");
    }

    private static Bitmap fetchBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            String separator = url.contains("?") ? "&" : "?";
            connection = (HttpURLConnection) new URL(url + separator + "itsLockScreenTs=" + System.currentTimeMillis()).openConnection();
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setRequestProperty("User-Agent", "ITS-Lock-Screen-Widget");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
            connection.setRequestProperty("Pragma", "no-cache");
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

    private static int colorForLabel(String label) {
        String value = label == null ? "" : label.toLowerCase(Locale.ROOT);
        if (value.contains("car") || value.contains("mobil")) return 0xFF38BDF8;
        if (value.contains("motor")) return 0xFFA78BFA;
        if (value.contains("bus")) return 0xFFFACC15;
        if (value.contains("truck") || value.contains("truk")) return 0xFFFB7185;
        if (value.contains("bicycle") || value.contains("sepeda")) return 0xFF34D399;
        return 0xFF14F195;
    }

    private static int adjustAlpha(int color, int alpha) {
        return (color & 0x00ffffff) | ((Math.max(0, Math.min(255, alpha)) & 0xff) << 24);
    }

    private static float clamp01(float value) {
        if (value < 0f) return 0f;
        if (value > 1f) return 1f;
        return value;
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

    static final class Detection {
        final String label;
        final double confidence;
        final double x;
        final double y;
        final double width;
        final double height;

        Detection(String label, double confidence, double x, double y, double width, double height) {
            this.label = TextUtils.isEmpty(label) ? "object" : label.trim();
            this.confidence = confidence > 1d ? confidence / 100d : Math.max(0d, Math.min(1d, confidence));
            this.x = Math.max(0d, x);
            this.y = Math.max(0d, y);
            this.width = Math.max(0d, width);
            this.height = Math.max(0d, height);
        }

        boolean normalized() {
            return x <= 1.01d && y <= 1.01d && width <= 1.01d && height <= 1.01d;
        }

        String displayName() {
            return label;
        }

        String sizeText() {
            if (normalized()) {
                return String.format(Locale.US, "%.1f%% x %.1f%%", width * 100d, height * 100d);
            }
            return Math.round(width) + " x " + Math.round(height) + " px";
        }

        String areaText() {
            double area;
            if (normalized()) {
                area = Math.max(0d, width * height * 100d);
            } else {
                area = Math.max(0d, width * height / 1000d);
            }
            return normalized()
                ? String.format(Locale.US, "%.2f%%", area)
                : String.format(Locale.US, "%.1fk px", area);
        }
    }

    static final class Snapshot {
        final String image1;
        final String image2;
        final String status;
        final String cameraStatus;
        final String detectorStatus;
        final String locationLabel;
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
        private volatile List<Detection> detections1;
        private volatile List<Detection> detections2;
        private volatile int detectorFrameWidth1;
        private volatile int detectorFrameHeight1;
        private volatile int detectorFrameWidth2;
        private volatile int detectorFrameHeight2;
        private Bitmap cachedImage1;
        private Bitmap cachedImage2;

        Snapshot(
            String image1,
            String image2,
            String status,
            String cameraStatus,
            String detectorStatus,
            String locationLabel,
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
            this.image1 = image1;
            this.image2 = image2;
            this.status = status;
            this.cameraStatus = cameraStatus;
            this.detectorStatus = detectorStatus;
            this.locationLabel = locationLabel;
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
            this.detections1 = new ArrayList<>(this.detections);
            this.detections2 = new ArrayList<>(this.detections);
            this.detectorFrameWidth1 = detectorFrameWidth;
            this.detectorFrameHeight1 = detectorFrameHeight;
            this.detectorFrameWidth2 = detectorFrameWidth;
            this.detectorFrameHeight2 = detectorFrameHeight;
        }

        static Snapshot fallback() {
            return new Snapshot("", "", "offline", "offline", "offline", "Lokasi sistem", 0L, "", 0, 0, 0, 0, 0, 0, 0, 0, new ArrayList<>());
        }

        static Snapshot fromJson(String datasetRaw, String deviceRaw) throws JSONException {
            JSONObject dataset = selectSnapshot(parseObject(datasetRaw));
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

            JSONArray detectionArray = firstArray(dataset, "detections", "objects", "detectedObjects", "aiDetections", "lastDetections", "results");
            if (detectionArray == null || detectionArray.length() == 0) {
                detectionArray = firstArray(device, "detections", "objects", "detectedObjects", "aiDetections", "lastDetections", "results");
            }
            JSONObject location = device.optJSONObject("location");
            String raspberryLocation = location == null ? "" : location.optString("label", "");
            if (TextUtils.isEmpty(raspberryLocation) && location != null && location.has("lat") && location.has("lng")) {
                raspberryLocation = String.format(Locale.US, "%.6f, %.6f", location.optDouble("lat"), location.optDouble("lng"));
            }

            return new Snapshot(
                imageValue(dataset, "image1", "gambar1", "snapshot1Url", "image1Url", "frame1", "frame1Url", "nama1"),
                imageValue(dataset, "image2", "gambar2", "snapshot2Url", "image2Url", "frame2", "frame2Url", "nama2"),
                firstNonEmpty(device.optString("status", ""), dataset.optString("status", "offline")),
                firstNonEmpty(device.optString("cameraStatus", ""), dataset.optString("cameraStatus", "")),
                firstNonEmpty(dataset.optString("detectorStatus", ""), device.optString("detectorStatus", "")),
                firstNonEmpty(dataset.optString("locationLabel", ""), firstNonEmpty(raspberryLocation, firstNonEmpty(device.optString("roadName", ""), device.optString("locationLabel", "Lokasi sistem")))),
                normalizeEpoch(optLongAny(dataset, optLongAny(device, 0L, "lastSeen", "updatedAt"), "updatedAt", "timestamp", "createdAt", "time")),
                device.optString("lastSeenText", ""),
                optIntAny(dataset, optIntAny(device, 0, "detectorFrameWidth", "frameWidth", "imageWidth", "width"), "detectorFrameWidth", "frameWidth", "imageWidth", "width"),
                optIntAny(dataset, optIntAny(device, 0, "detectorFrameHeight", "frameHeight", "imageHeight", "height"), "detectorFrameHeight", "frameHeight", "imageHeight", "height"),
                car,
                motorcycle,
                bus,
                truck,
                bicycle,
                total,
                parseDetections(detectionArray)
            );
        }

        void warmImages(Context context) {
            if (!TextUtils.isEmpty(image1)) {
                cachedImage1 = decodeImageValue(context, image1);
            }
            if (!TextUtils.isEmpty(image2)) {
                cachedImage2 = decodeImageValue(context, image2);
            }
        }

        Bitmap imageBitmap(Context context, int slot) {
            Bitmap cached = slot == 2 ? cachedImage2 : cachedImage1;
            if (cached != null && !cached.isRecycled()) return cached;
            String value = slot == 2 ? image2 : image1;
            if (TextUtils.isEmpty(value)) value = slot == 2 ? image1 : image2;
            if (TextUtils.isEmpty(value)) return null;
            cached = decodeImageValue(context, value);
            if (slot == 2) cachedImage2 = cached;
            else cachedImage1 = cached;
            return cached;
        }

        String imageForCarousel(long now) {
            boolean first = ((now / CAROUSEL_INTERVAL_MS) % 2L) == 0L;
            String selected = first ? image1 : image2;
            if (!TextUtils.isEmpty(selected)) return selected;
            return first ? image2 : image1;
        }

        boolean hasImage() {
            return !TextUtils.isEmpty(image1) || !TextUtils.isEmpty(image2);
        }

        Detection primaryDetection() {
            return primaryDetection(allDetections());
        }

        Detection primaryDetection(List<Detection> source) {
            Detection best = null;
            double score = -1d;
            for (Detection detection : source) {
                if (detection.width <= 0d || detection.height <= 0d) continue;
                double candidate = detection.confidence + Math.min(0.35d, detection.width * detection.height / 1_000_000d);
                if (candidate > score) {
                    best = detection;
                    score = candidate;
                }
            }
            return best;
        }

        synchronized void updateDetections(int slot, int frameWidth, int frameHeight, List<Detection> next) {
            List<Detection> safe = next == null ? new ArrayList<>() : new ArrayList<>(next);
            if (slot == 2) {
                detections2 = safe;
                detectorFrameWidth2 = frameWidth;
                detectorFrameHeight2 = frameHeight;
            } else {
                detections1 = safe;
                detectorFrameWidth1 = frameWidth;
                detectorFrameHeight1 = frameHeight;
            }
        }

        List<Detection> detectionsForSlot(int slot) {
            List<Detection> source = slot == 2 ? detections2 : detections1;
            return source == null ? new ArrayList<>() : source;
        }

        int frameWidthForSlot(int slot) {
            return slot == 2 ? detectorFrameWidth2 : detectorFrameWidth1;
        }

        int frameHeightForSlot(int slot) {
            return slot == 2 ? detectorFrameHeight2 : detectorFrameHeight1;
        }

        List<Detection> allDetections() {
            List<Detection> all = new ArrayList<>();
            all.addAll(detectionsForSlot(1));
            all.addAll(detectionsForSlot(2));
            return all;
        }

        boolean online(long now) {
            boolean stateOnline = "online".equalsIgnoreCase(status)
                || "online".equalsIgnoreCase(cameraStatus)
                || detectorOnline();
            if (!stateOnline) return false;
            return updatedAt <= 0L || isFresh(now);
        }

        boolean detectorOnline() {
            String value = detectorStatus == null ? "" : detectorStatus.trim().toLowerCase(Locale.ROOT);
            return "online".equals(value)
                || "ok".equals(value)
                || value.startsWith("browser-rfdetr")
                || value.startsWith("rf-detr");
        }

        boolean isFresh(long now) {
            return updatedAt > 0L && now - updatedAt <= STALE_AFTER_MS && updatedAt - now <= 300_000L;
        }

        int vehicleCount() {
            return total > 0 ? total : car + motorcycle + bus + truck + bicycle;
        }

        int detectionCount() {
            int detected = allDetections().size();
            return detected == 0 ? vehicleCount() : detected;
        }

        String breakdownText() {
            List<String> parts = new ArrayList<>();
            if (car > 0) parts.add("mobil " + car);
            if (motorcycle > 0) parts.add("motor " + motorcycle);
            if (bus > 0) parts.add("bus " + bus);
            if (truck > 0) parts.add("truk " + truck);
            if (bicycle > 0) parts.add("sepeda " + bicycle);
            String joined = parts.isEmpty() ? "Tidak ada breakdown object dari RTDB" : TextUtils.join(" • ", parts);
            return "Jumlah object RTDB: " + detectionCount() + ". " + joined;
        }

        String locationLabel() {
            return TextUtils.isEmpty(locationLabel) ? "Lokasi sistem" : locationLabel;
        }

        String timeText() {
            if (updatedAt <= 0L) return "Histori belum sinkron";
            SimpleDateFormat format = new SimpleDateFormat("HH.mm 'WIB' - dd MMM yyyy", new Locale("id", "ID"));
            return format.format(new Date(updatedAt));
        }

        String aiStatus(long now) {
            if (!online(now)) return "AI offline - menunggu RTDB realtime";
            if (primaryDetection() == null) return "AI memindai snapshot";
            return "AI mengunci " + primaryDetection().displayName();
        }

        String liveSummary(long now) {
            String source = hasImage() ? "gambar RTDB" : "menunggu gambar RTDB";
            long age = updatedAt <= 0L ? -1L : Math.max(0L, now - updatedAt);
            String ageText;
            if (age < 0L) {
                ageText = "belum ada timestamp";
            } else if (age < 60_000L) {
                ageText = (age / 1000L) + " dtk lalu";
            } else {
                ageText = (age / 60_000L) + " mnt lalu";
            }
            return "Live 10 dtk • " + source + " • " + detectionCount() + " object • " + ageText;
        }

        private static JSONObject parseObject(String raw) {
            if (TextUtils.isEmpty(raw) || "null".equals(raw.trim())) return null;
            try {
                return new JSONObject(raw);
            } catch (JSONException ignored) {
                return null;
            }
        }

        private static JSONObject selectSnapshot(JSONObject root) throws JSONException {
            if (root == null) return null;
            if (isSnapshot(root)) return root;
            List<JSONObject> candidates = new ArrayList<>();
            collectSnapshots(root, candidates);
            JSONObject best = null;
            long bestUpdatedAt = Long.MIN_VALUE;
            int bestScore = Integer.MIN_VALUE;
            for (JSONObject candidate : candidates) {
                long updatedAt = normalizeEpoch(candidate.optLong("updatedAt", 0L));
                int score = snapshotScore(candidate);
                if (updatedAt > bestUpdatedAt || (updatedAt == bestUpdatedAt && score > bestScore)) {
                    best = candidate;
                    bestUpdatedAt = updatedAt;
                    bestScore = score;
                }
            }
            return best != null ? best : root;
        }

        private static void collectSnapshots(Object value, List<JSONObject> out) throws JSONException {
            if (out.size() > 120 || value == null) return;
            if (value instanceof JSONObject) {
                JSONObject object = (JSONObject) value;
                if (isSnapshot(object)) out.add(object);
                Iterator<String> keys = object.keys();
                while (keys.hasNext()) {
                    collectSnapshots(object.opt(keys.next()), out);
                }
            } else if (value instanceof JSONArray) {
                JSONArray array = (JSONArray) value;
                for (int i = 0; i < array.length(); i++) {
                    collectSnapshots(array.opt(i), out);
                }
            }
        }

        private static boolean isSnapshot(JSONObject object) {
            return object.has("image1")
                || object.has("image2")
                || object.has("image")
                || object.has("imageUrl")
                || object.has("snapshotUrl")
                || object.has("gambar1")
                || object.has("gambar2")
                || object.has("nama1")
                || object.has("nama2")
                || object.has("snapshot1Url")
                || object.has("snapshot2Url")
                || object.has("detections")
                || object.has("objects")
                || object.has("detectedObjects")
                || object.has("aiDetections")
                || object.has("detectorFrameWidth");
        }

        private static int snapshotScore(JSONObject object) {
            int score = 0;
            if (object.has("image1") || object.has("snapshot1Url")) score += 25;
            if (object.has("image2") || object.has("snapshot2Url")) score += 15;
            if (object.has("detections") || object.has("objects") || object.has("detectedObjects") || object.has("aiDetections")) score += 20;
            if (object.has("vehicleCount")) score += 8;
            if (object.has("updatedAt")) score += 10;
            return score;
        }

        private static JSONObject selectDevice(JSONObject root) throws JSONException {
            if (root == null) return null;
            if (isDevice(root)) return root;
            JSONObject byId = root.optJSONObject(PRIMARY_DEVICE_ID);
            if (byId != null && isDevice(byId)) return byId;
            JSONObject devices = root.optJSONObject("devices");
            if (devices != null) {
                JSONObject nested = devices.optJSONObject(PRIMARY_DEVICE_ID);
                if (nested != null && isDevice(nested)) return nested;
                JSONObject best = pickMostRecentDevice(devices);
                if (best != null) return best;
            }
            JSONObject best = pickMostRecentDevice(root);
            return best != null ? best : root;
        }

        private static JSONObject pickMostRecentDevice(JSONObject object) throws JSONException {
            List<JSONObject> candidates = new ArrayList<>();
            collectDevices(object, candidates);
            JSONObject best = null;
            long bestLastSeen = Long.MIN_VALUE;
            int bestScore = Integer.MIN_VALUE;
            for (JSONObject candidate : candidates) {
                long lastSeen = normalizeEpoch(candidate.optLong("lastSeen", candidate.optLong("updatedAt", 0L)));
                int score = deviceScore(candidate);
                if (lastSeen > bestLastSeen || (lastSeen == bestLastSeen && score > bestScore)) {
                    best = candidate;
                    bestLastSeen = lastSeen;
                    bestScore = score;
                }
            }
            return best;
        }

        private static void collectDevices(Object value, List<JSONObject> out) throws JSONException {
            if (out.size() > 80 || value == null) return;
            if (value instanceof JSONObject) {
                JSONObject object = (JSONObject) value;
                if (isDevice(object)) out.add(object);
                Iterator<String> keys = object.keys();
                while (keys.hasNext()) {
                    collectDevices(object.opt(keys.next()), out);
                }
            } else if (value instanceof JSONArray) {
                JSONArray array = (JSONArray) value;
                for (int i = 0; i < array.length(); i++) {
                    collectDevices(array.opt(i), out);
                }
            }
        }

        private static boolean isDevice(JSONObject object) {
            return object.has("vehicleCount") || object.has("trafficColor") || object.has("cameraStatus") || object.has("detectorStatus") || object.has("status");
        }

        private static int deviceScore(JSONObject object) {
            int score = 0;
            if (PRIMARY_DEVICE_ID.equals(object.optString("id"))) score += 100;
            if (object.has("status")) score += 8;
            if (object.has("cameraStatus")) score += 8;
            if (object.has("detectorStatus")) score += 8;
            if (object.has("vehicleCount")) score += 8;
            return score;
        }

        private static List<Detection> parseDetections(JSONArray array) {
            List<Detection> detections = new ArrayList<>();
            if (array == null) return detections;
            for (int i = 0; i < array.length() && detections.size() < 40; i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                Detection detection = parseDetection(obj);
                if (detection != null) detections.add(detection);
            }
            return detections;
        }

        private static Detection parseDetection(JSONObject obj) {
            String label = firstNonEmpty(obj.optString("label", ""), firstNonEmpty(obj.optString("class", ""), firstNonEmpty(obj.optString("name", ""), obj.optString("object", "object"))));
            double confidence = obj.optDouble("confidence", obj.optDouble("score", 0d));
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
            if (width <= 0d || height <= 0d) return null;
            return new Detection(label, confidence, x, y, width, height);
        }

        private static int optInt(JSONObject object, String key, int fallback) {
            return object == null ? fallback : object.optInt(key, fallback);
        }

        private static int optIntAny(JSONObject object, int fallback, String... keys) {
            if (object == null) return fallback;
            for (String key : keys) {
                if (object.has(key)) return object.optInt(key, fallback);
            }
            return fallback;
        }

        private static long optLongAny(JSONObject object, long fallback, String... keys) {
            if (object == null) return fallback;
            for (String key : keys) {
                if (object.has(key)) return object.optLong(key, fallback);
            }
            return fallback;
        }

        private static JSONArray firstArray(JSONObject object, String... keys) {
            if (object == null) return null;
            for (String key : keys) {
                JSONArray array = object.optJSONArray(key);
                if (array != null) return array;
            }
            return null;
        }

        private static String imageValue(JSONObject object, String... keys) {
            if (object == null) return "";
            for (String key : keys) {
                String value = object.optString(key, "");
                if (!TextUtils.isEmpty(value)) return value;
            }
            for (String key : new String[] { "image", "imageUrl", "snapshotUrl", "snapshot", "frame", "frameUrl", "latestImage", "latestImageUrl" }) {
                String value = object.optString(key, "");
                if (!TextUtils.isEmpty(value)) return value;
            }
            return "";
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
