package id.ac.telkomuniversity.its;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaRouter;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.BatteryManager;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class LockScreenRenderer {
    static final int WIDGET_WIDTH = 720;
    static final int WIDGET_HEIGHT = 1280;

    private static final int BASE_WIDTH = 1080;
    private static final int BASE_HEIGHT = 1920;
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String PREF_DATASET = "traffic_dataset_snapshot";
    private static final String PREF_DEVICE = "traffic_device_snapshot";
    private static final String PREF_NOTIF_PACKAGE = "lock_notif_package";
    private static final String PREF_NOTIF_TITLE = "lock_notif_title";
    private static final String PREF_NOTIF_TEXT = "lock_notif_text";
    private static final String PREF_NOTIF_TIME = "lock_notif_time";
    private static final String PREF_NOTIF_LIST = "lock_notif_list";
    private static final String PREF_THEME_MODE = "lock_theme_mode";
    private static final String PREF_WIDGET_CONFIGURED = "lock_widget_configured_v6";
    private static final String PREF_ENABLED_WIDGET_IDS = "lock_enabled_widget_ids_v6";
    private static final String PREF_WIDGET_LEGACY_MERGED = "lock_widget_legacy_merged_v1";
    private static final String PREF_HOSTED_WIDGET_BOUND_IDS = "lock_hosted_widget_bound_ids_v1";
    private static final String PREF_WIDGET_SEARCH_QUERY = "lock_widget_search_query_v1";
    private static final String PREF_WIDGET_VIEW_MODE = "lock_widget_view_mode_v1";
    private static final String PREF_MEDIA_FAVORITE_KEYS = "lock_media_favorite_keys_v1";
    private static final String PREF_MEDIA_REPEAT_PACKAGES = "lock_media_repeat_packages_v1";
    private static final String PREF_MEDIA_DEVICE_PREFIX = "lock_media_device_";
    private static final String PREF_NOTIF_CONFIGURED = "lock_reply_notif_configured_v1";
    private static final String PREF_ENABLED_NOTIF_KEYS = "lock_enabled_reply_notif_keys_v1";
    private static final String THEME_AUTO = "auto";
    private static final String THEME_DARK = "dark";
    private static final String THEME_LIGHT = "light";
    private static final String WIDGET_VIEW_LIST = "list";
    private static final String WIDGET_VIEW_GRID = "grid";
    private static final String WIDGET_VIEW_FLOW = "flow";
    static final String SHEET_ACTION_THEME = "theme";
    static final String SHEET_ACTION_WIDGET = "widget";
    static final String SHEET_ACTION_WIDGET_SEARCH = "widget_search";
    static final String SHEET_ACTION_WIDGET_VIEW = "widget_view";
    static final String SHEET_ACTION_NOTIFICATION = "notification";
    static final String SHEET_ACTION_REPLY = "reply";
    static final String SHEET_ACTION_READ = "read";
    static final String SHEET_ACTION_OPEN = "open";
    static final String SHEET_ACTION_FULL_WIDGET = "full_widget";
    static final String SHEET_ACTION_MEDIA_PREVIOUS = "media_previous";
    static final String SHEET_ACTION_MEDIA_PLAY_PAUSE = "media_play_pause";
    static final String SHEET_ACTION_MEDIA_NEXT = "media_next";
    static final String SHEET_ACTION_MEDIA_FAVORITE = "media_favorite";
    static final String SHEET_ACTION_MEDIA_TRANSCRIPT = "media_transcript";
    static final String SHEET_ACTION_MEDIA_REPEAT = "media_repeat";
    static final String SHEET_ACTION_MEDIA_MUTE = "media_mute";
    static final String SHEET_ACTION_MEDIA_DEVICE = "media_device";
    static final String SHEET_ACTION_MEDIA_QUEUE = "media_queue";
    static final String SHEET_ACTION_MEDIA_SEEK = "media_seek";
    private static final String PRIMARY_DEVICE_ID = "raspberry-its";
    private static final String FIREBASE_DATASET_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
    private static final String FIREBASE_DEVICES_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private static final String FIREBASE_DEVICE_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices/raspberry-its.json";
    private static final long STALE_AFTER_MS = 45_000L;
    static final long LIVE_REFRESH_MS = 10_000L;
    private static final long CAROUSEL_INTERVAL_MS = LIVE_REFRESH_MS;
    private static final float CONTENT_SHIFT = 56f;
    private static final long WIDGET_CACHE_MS = 15_000L;
    private static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";
    private static final float MAIN_WIDGET_TOP = 1302f;
    private static final float COMPACT_WIDGET_HEIGHT = 124f;
    private static final float HOSTED_WIDGET_MIN_HEIGHT = 168f;
    private static final float HOSTED_WIDGET_DEFAULT_HEIGHT = 438f;
    private static final float MEDIA_WIDGET_HEIGHT = 684f;
    private static final float HOSTED_WIDGET_MAX_HEIGHT = 1088f;
    private static final float WIDGET_GAP = 20f;
    private static final float MAIN_SCROLL_VIEWPORT_TOP = 430f;
    private static final float WIDGET_VIEWPORT_BOTTOM = 1568f;
    private static final float SETTINGS_WIDGET_ROW_STEP = 116f;
    private static final float SETTINGS_NOTIFICATION_ROW_STEP = 138f;
    private static final float SETTINGS_SCROLL_TOP = 836f;
    private static final float SETTINGS_WIDGET_LIST_TOP = 864f;
    private static final long MEDIA_TRANSITION_MS = 760L;
    private static volatile int lastDynamicAccent = 0xFF22C55E;
    private static final Map<String, String> lastKnownTrack = new HashMap<>();
    private static final Map<String, Bitmap> lastKnownArt = new HashMap<>();
    private static final Map<String, String> previousTrackByPackage = new HashMap<>();
    private static final Map<String, Bitmap> previousArtByPackage = new HashMap<>();
    private static final Map<String, Bitmap> nextArtByPackage = new HashMap<>();
    private static final Map<String, String> animatedTrackByPackage = new HashMap<>();
    private static final Map<String, Long> animatedTrackStartedAtByPackage = new HashMap<>();
    private static final Map<String, List<HistoryEntry>> playHistoryByPackage = new HashMap<>();
    private static BatteryState cachedBatteryState = new BatteryState(0, false);
    private static long cachedBatteryStateAt;

    private static void trackPreviousSong(String packageName, String title, String artist, Bitmap art) {
        if (TextUtils.isEmpty(packageName) || TextUtils.isEmpty(title)) return;
        String combined = TextUtils.isEmpty(artist) ? title : title + " - " + artist;
        String last = lastKnownTrack.get(packageName);
        if (last != null && !last.equals(combined)) {
            previousTrackByPackage.put(packageName, last);
            Bitmap lastArt = lastKnownArt.get(packageName);
            if (lastArt != null && !lastArt.isRecycled()) previousArtByPackage.put(packageName, lastArt);
            else previousArtByPackage.remove(packageName);
            animatedTrackByPackage.put(packageName, title + "\n" + (artist == null ? "" : artist));
            animatedTrackStartedAtByPackage.put(packageName, SystemClock.uptimeMillis());
        }
        lastKnownTrack.put(packageName, combined);
        if (art != null && !art.isRecycled()) lastKnownArt.put(packageName, art);
    }

    static final class HistoryEntry {
        final String title;
        final String artist;
        final Bitmap art;
        final long durationMs;
        final long playedAtMs;

        HistoryEntry(String title, String artist, Bitmap art, long durationMs, long playedAtMs) {
            this.title = TextUtils.isEmpty(title) ? "" : title;
            this.artist = artist == null ? "" : artist;
            this.art = art;
            this.durationMs = Math.max(0L, durationMs);
            this.playedAtMs = playedAtMs;
        }
    }

    private static final class BatteryState {
        final int percent;
        final boolean charging;

        BatteryState(int percent, boolean charging) {
            this.percent = Math.max(0, Math.min(100, percent));
            this.charging = charging;
        }
    }

    private static void trackPlayHistory(String packageName, String title, String artist, Bitmap art, long durationMs) {
        if (TextUtils.isEmpty(packageName) || TextUtils.isEmpty(title)) return;
        List<HistoryEntry> history = playHistoryByPackage.get(packageName);
        if (history == null) {
            history = new ArrayList<>();
            playHistoryByPackage.put(packageName, history);
        }
        String safeArtist = artist == null ? "" : artist;
        HistoryEntry top = history.isEmpty() ? null : history.get(0);
        boolean sameAsTop = top != null && top.title.equals(title) && top.artist.equals(safeArtist);
        if (sameAsTop) {
            if (top.art == null && art != null && !art.isRecycled()) {
                history.set(0, new HistoryEntry(title, artist, art, durationMs, top.playedAtMs));
            }
            return;
        }
        history.add(0, new HistoryEntry(title, artist, art, durationMs, System.currentTimeMillis()));
        while (history.size() > 30) history.remove(history.size() - 1);
    }

    static List<HistoryEntry> mediaHistoryFor(String packageName) {
        if (TextUtils.isEmpty(packageName)) return new ArrayList<>();
        List<HistoryEntry> history = playHistoryByPackage.get(packageName);
        return history == null ? new ArrayList<>() : new ArrayList<>(history);
    }

    static void clearMediaHistory(String packageName) {
        if (TextUtils.isEmpty(packageName)) return;
        playHistoryByPackage.remove(packageName);
    }

    static void removeMediaHistoryEntry(String packageName, HistoryEntry entry) {
        if (TextUtils.isEmpty(packageName) || entry == null) return;
        List<HistoryEntry> history = playHistoryByPackage.get(packageName);
        if (history != null) history.remove(entry);
    }

    private static String[] splitTitleArtist(String combined) {
        if (TextUtils.isEmpty(combined)) return new String[] { "", "" };
        int dash = combined.indexOf(" - ");
        if (dash < 0) return new String[] { combined, "" };
        return new String[] { combined.substring(0, dash), combined.substring(dash + 3) };
    }

    private static float mediaTrackTransitionFraction(DynamicWidgetInfo widget) {
        if (widget == null || TextUtils.isEmpty(widget.packageName)) return 1f;
        String key = widget.title + "\n" + compactMediaArtist(widget);
        String animatedKey = animatedTrackByPackage.get(widget.packageName);
        if (!key.equals(animatedKey)) {
            animatedTrackByPackage.put(widget.packageName, key);
            animatedTrackStartedAtByPackage.put(widget.packageName, SystemClock.uptimeMillis() - MEDIA_TRANSITION_MS);
            return 1f;
        }
        Long startedAt = animatedTrackStartedAtByPackage.get(widget.packageName);
        if (startedAt == null) return 1f;
        float raw = (SystemClock.uptimeMillis() - startedAt) / (float) MEDIA_TRANSITION_MS;
        return clamp01(raw);
    }

    private static float easeOutCubic(float value) {
        float clamped = clamp01(value);
        float inverted = 1f - clamped;
        return 1f - inverted * inverted * inverted;
    }

    private static float lerp(float from, float to, float progress) {
        return from + (to - from) * clamp01(progress);
    }

    private static RectF lerpRect(RectF from, RectF to, float progress) {
        return new RectF(
            lerp(from.left, to.left, progress),
            lerp(from.top, to.top, progress),
            lerp(from.right, to.right, progress),
            lerp(from.bottom, to.bottom, progress)
        );
    }

    private static RectF teaserRectCenteredAt(RectF template, float cx, float cy) {
        float halfW = template.width() / 2f;
        float halfH = template.height() / 2f;
        return new RectF(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
    }

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
        draw(context, canvas, snapshot, width, height, now, swipeProgress, 0, 0f, false, interactive);
    }

    static void draw(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        int width,
        int height,
        long now,
        float swipeProgress,
        int shortcutDrag,
        float shortcutProgress,
        boolean fingerprintActive,
        boolean interactive
    ) {
        draw(context, canvas, snapshot, width, height, now, swipeProgress, shortcutDrag, shortcutProgress, fingerprintActive, interactive, 0f);
    }

    static void draw(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        int width,
        int height,
        long now,
        float swipeProgress,
        int shortcutDrag,
        float shortcutProgress,
        boolean fingerprintActive,
        boolean interactive,
        float widgetScrollY
    ) {
        Snapshot safeSnapshot = snapshot == null ? Snapshot.fallback() : snapshot;
        float xScale = width / (float) BASE_WIDTH;
        float yScale = height / (float) BASE_HEIGHT;
        float shapeYCompensation = yScale == 0f ? 1f : xScale / yScale;
        canvas.save();
        canvas.scale(xScale, yScale);
        drawBase(
            context,
            canvas,
            safeSnapshot,
            now,
            clamp01(swipeProgress),
            shortcutDrag,
            clamp01(shortcutProgress),
            fingerprintActive,
            interactive,
            shapeYCompensation,
            Math.max(0f, widgetScrollY)
        );
        canvas.restore();
    }

    private static void drawBase(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        long now,
        float swipeProgress,
        int shortcutDrag,
        float shortcutProgress,
        boolean fingerprintActive,
        boolean interactive,
        float shapeYCompensation,
        float widgetScrollY
    ) {
        ThemePalette palette = ThemePalette.from(context, snapshot, now);
        boolean light = palette.light;
        canvas.drawColor(palette.backgroundBottom);
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setShader(new LinearGradient(
            0,
            0,
            0,
            BASE_HEIGHT,
            palette.backgroundTop,
            palette.backgroundBottom,
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT, background);
        drawHeader(canvas, snapshot, now, palette);
        drawMoreButton(canvas, palette);
        if (!drawNotificationSurface(context, canvas, now, light)) {
            drawStatusOverviewCard(canvas, snapshot, now, palette);
        }
        drawScrollableMainContent(context, canvas, snapshot, now, palette, widgetScrollY);
        drawFooter(context, canvas, snapshot, now, swipeProgress, shortcutDrag, shortcutProgress, fingerprintActive, interactive, palette, shapeYCompensation);
    }

    private static void drawFluentBackdrop(Context context, Canvas canvas, Snapshot snapshot, long now, boolean light) {
        Bitmap image = snapshot.imageBitmap(context, snapshot.activeSlot(now));
        int accentA = dominantColorRegion(image, 0f, 0f, 1f, 0.54f, light ? 0xFF3B82F6 : 0xFF116466);
        int accentB = dominantColorRegion(image, 0.42f, 0f, 1f, 1f, light ? 0xFF10B981 : 0xFF38BDF8);
        int accentC = dominantColorRegion(image, 0f, 0.44f, 0.66f, 1f, light ? 0xFFF97316 : 0xFFB85CFF);
        drawFluentGlow(canvas, BASE_WIDTH * 0.76f, 260f, 780f, accentA, light ? 112 : 118);
        drawFluentGlow(canvas, BASE_WIDTH * 0.22f, 760f, 860f, accentB, light ? 96 : 92);
        drawFluentGlow(canvas, BASE_WIDTH * 0.58f, 1280f, 940f, accentC, light ? 84 : 82);

        Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
        veil.setShader(new LinearGradient(
            0,
            0,
            BASE_WIDTH,
            BASE_HEIGHT,
            light ? 0x28FFFFFF : 0x22000000,
            light ? 0x16FFFFFF : 0x33000000,
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT, veil);
    }

    private static void drawFluentGlow(Canvas canvas, float cx, float cy, float radius, int color, int alpha) {
        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setShader(new RadialGradient(
            cx,
            cy,
            radius,
            adjustAlpha(color, alpha),
            0x00000000,
            Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(cx, cy, radius, glow);
    }

    private static final class ThemePalette {
        final boolean light;
        final int backgroundTop;
        final int backgroundBottom;
        final int surface;
        final int surfaceAlt;
        final int border;
        final int text;
        final int muted;
        final int accent;
        final int accentSoft;
        final int accentStrong;
        final int accentText;

        ThemePalette(
            boolean light,
            int backgroundTop,
            int backgroundBottom,
            int surface,
            int surfaceAlt,
            int border,
            int text,
            int muted,
            int accent,
            int accentSoft,
            int accentStrong,
            int accentText
        ) {
            this.light = light;
            this.backgroundTop = backgroundTop;
            this.backgroundBottom = backgroundBottom;
            this.surface = surface;
            this.surfaceAlt = surfaceAlt;
            this.border = border;
            this.text = text;
            this.muted = muted;
            this.accent = accent;
            this.accentSoft = accentSoft;
            this.accentStrong = accentStrong;
            this.accentText = accentText;
        }

        static ThemePalette from(Context context, Snapshot snapshot, long now) {
            boolean light = useLightTheme(context);
            Bitmap image = snapshot == null ? null : snapshot.imageBitmap(context, snapshot.activeSlot(now));
            int fallback = lastDynamicAccent == 0 ? (light ? 0xFF16A34A : 0xFF22C55E) : lastDynamicAccent;
            int sampled = image == null
                ? fallback
                : dominantColorRegion(image, 0.06f, 0.06f, 0.94f, 0.94f, fallback);
            int accent = boostAccent(sampled, light);
            lastDynamicAccent = accent;
            int surface = light ? 0xFFFFFFFF : blend(0xFF0D1511, accent, 0.08f);
            int surfaceAlt = light ? blend(0xFFF3F7F1, accent, 0.05f) : blend(0xFF112018, accent, 0.10f);
            return new ThemePalette(
                light,
                light ? blend(0xFFF7FAF4, accent, 0.06f) : blend(0xFF050D08, accent, 0.11f),
                light ? blend(0xFFEAF1E8, accent, 0.08f) : blend(0xFF031007, accent, 0.16f),
                surface,
                surfaceAlt,
                adjustAlpha(accent, light ? 44 : 62),
                light ? 0xFF102014 : 0xFFF8FAFC,
                light ? 0xFF5B675E : 0xFF9FB3A6,
                accent,
                adjustAlpha(accent, light ? 28 : 40),
                boostAccent(accent, false),
                readableTextOn(accent)
            );
        }
    }

    private static void drawHeader(Canvas canvas, Snapshot snapshot, long now, ThemePalette palette) {
        Locale locale = new Locale("id", "ID");
        String date = new SimpleDateFormat("EEEE, dd \u2022 MM \u2022 yyyy", locale).format(new Date(now));
        String time = new SimpleDateFormat("HH:mm", locale).format(new Date(now));
        String hour = time.length() >= 2 ? time.substring(0, 2) : time;
        String minute = time.length() >= 5 ? time.substring(3, 5) : "00";

        Paint datePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        datePaint.setColor(palette.accentStrong);
        datePaint.setTextSize(34f);
        datePaint.setFakeBoldText(true);
        canvas.drawText(date, 46f, 92f, datePaint);

        Paint hourPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        hourPaint.setColor(palette.text);
        hourPaint.setTextSize(138f);
        hourPaint.setFakeBoldText(true);
        canvas.drawText(hour, 42f, 228f, hourPaint);

        Paint colonPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        colonPaint.setColor(palette.text);
        colonPaint.setTextSize(130f);
        colonPaint.setFakeBoldText(true);
        float colonX = 42f + hourPaint.measureText(hour) + 24f;
        canvas.drawText(":", colonX, 220f, colonPaint);

        Paint minuteStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        minuteStroke.setStyle(Paint.Style.FILL);
        minuteStroke.setStrokeWidth(0f);
        minuteStroke.setColor(palette.text);
        minuteStroke.setTextSize(138f);
        minuteStroke.setFakeBoldText(true);
        float minuteX = colonX + colonPaint.measureText(":") + 24f;
        canvas.drawText(minute, minuteX, 228f, minuteStroke);

        drawHeaderMeta(canvas, snapshot, now, palette);
        drawStatusChip(canvas, snapshot, now, palette);
    }

    private static void drawHeaderMeta(Canvas canvas, Snapshot snapshot, long now, ThemePalette palette) {
        String location = snapshot == null ? "" : snapshot.locationLabel();
        String time = snapshot == null ? "" : snapshot.timeText();
        String state = snapshot != null && snapshot.online(now) ? "online" : "offline";
        String label = firstNonEmpty(location, "Lokasi sistem") + " - terakhir " + firstNonEmpty(time, state);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(palette.muted);
        text.setTextSize(23f);
        text.setFakeBoldText(true);
        drawTextLimited(canvas, label, 46f, 268f, text, 740f);
    }

    private static String firstNonEmpty(String first, String fallback) {
        if (first != null && !first.trim().isEmpty()) return first.trim();
        return fallback == null ? "" : fallback.trim();
    }

    private static void drawMoreButton(Canvas canvas, ThemePalette palette) {
        RectF button = themeButtonBaseRect();
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(button, 20f, 20f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.6f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(button, 20f, 20f, stroke);

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(palette.text);
        canvas.drawCircle(button.centerX(), button.centerY() - 17f, 5.5f, dot);
        canvas.drawCircle(button.centerX(), button.centerY(), 5.5f, dot);
        canvas.drawCircle(button.centerX(), button.centerY() + 17f, 5.5f, dot);
    }

    private static boolean drawNotificationSurface(Context context, Canvas canvas, long now, boolean light) {
        List<NotificationInfo> notifications = NotificationInfo.loadAll(context);
        if (notifications.isEmpty()) return false;

        NotificationInfo featured = NotificationInfo.firstWithBody(notifications);
        if (featured == null) {
            drawNotificationIconCluster(context, canvas, notifications, light);
            return true;
        }
        drawNotificationPill(context, canvas, featured, notifications.size(), now, light);
        return true;
    }

    private static void drawNotificationIconCluster(Context context, Canvas canvas, List<NotificationInfo> notifications, boolean light) {
        int visible = Math.min(3, notifications.size());
        float size = 52f;
        float gap = 13f;
        float ellipsisWidth = notifications.size() > visible ? 54f : 0f;
        float total = visible * size + Math.max(0, visible - 1) * gap + ellipsisWidth;
        float left = (BASE_WIDTH - total) / 2f;
        float top = 322f;
        RectF shell = new RectF(left - 18f, top - 12f, left + total + 18f, top + size + 12f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(light ? 0xDDF8FAFC : 0xAA121722);
        canvas.drawRoundRect(shell, 32f, 32f, bg);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(1.4f);
        border.setColor(light ? 0x302A3442 : 0x2EFFFFFF);
        canvas.drawRoundRect(shell, 32f, 32f, border);

        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint iconPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        for (int i = 0; i < visible; i++) {
            RectF iconRect = new RectF(left + i * (size + gap), top, left + i * (size + gap) + size, top + size);
            iconBg.setColor(light ? 0x223B82F6 : 0x2438BDF8);
            canvas.drawRoundRect(iconRect, 16f, 16f, iconBg);
            Bitmap icon = notifications.get(i).icon(context, 42);
            if (icon != null) {
                canvas.drawBitmap(icon, null, new RectF(iconRect.left + 5f, iconRect.top + 5f, iconRect.right - 5f, iconRect.bottom - 5f), iconPaint);
            } else {
                drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), light ? 0xFF2563EB : 0xFFD7FFF0);
            }
        }
        if (notifications.size() > visible) {
            Paint more = new Paint(Paint.ANTI_ALIAS_FLAG);
            more.setColor(light ? 0xFF172033 : 0xFFE8EEF8);
            more.setTextSize(27f);
            more.setFakeBoldText(true);
            more.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("...", left + visible * (size + gap) + 24f, top + 35f, more);
            more.setTextAlign(Paint.Align.LEFT);
        }
    }

    private static void drawNotificationPill(Context context, Canvas canvas, NotificationInfo notification, int count, long now, boolean light) {
        RectF pill = notificationBaseRect();
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(light ? 0xEAF8FAFC : 0xCC151B25);
        canvas.drawRoundRect(pill, 28f, 28f, fill);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(1.6f);
        border.setColor(light ? 0x302A3442 : 0x28FFFFFF);
        canvas.drawRoundRect(pill, 28f, 28f, border);

        RectF iconRect = new RectF(pill.left + 18f, pill.top + 13f, pill.left + 66f, pill.top + 61f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(light ? 0x223B82F6 : 0x2638BDF8);
        canvas.drawRoundRect(iconRect, 14f, 14f, iconBg);
        Bitmap icon = notification.icon(context, 42);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 5f, iconRect.top + 5f, iconRect.right - 5f, iconRect.bottom - 5f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), light ? 0xFF2563EB : 0xFFD7FFF0);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(light ? 0xFF0F172A : 0xFFF8FAFC);
        title.setTextSize(24f);
        title.setFakeBoldText(true);
        String titleText = notification.titleText(context);
        float textLeft = pill.left + 82f;
        float textRight = pill.right - 150f;
        if (!notification.hasBody()) {
            drawTextLimited(canvas, titleText, textLeft, pill.centerY() + 9f, title, textRight - textLeft);
        } else {
            drawTextLimited(canvas, titleText, textLeft, pill.top + 30f, title, textRight - textLeft);
            Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
            body.setColor(light ? 0xFF526071 : 0xFFB9C4D3);
            body.setTextSize(21f);
            drawTextLimited(canvas, notification.text, textLeft, pill.top + 57f, body, textRight - textLeft);
        }

        Paint time = new Paint(Paint.ANTI_ALIAS_FLAG);
        time.setColor(light ? 0xFF687386 : 0xFF9AA7B8);
        time.setTextSize(20f);
        time.setTextAlign(Paint.Align.RIGHT);
        String timeText = notification.time > 0L
            ? new SimpleDateFormat("HH.mm", new Locale("id", "ID")).format(new Date(notification.time))
            : new SimpleDateFormat("HH.mm", new Locale("id", "ID")).format(new Date(now));
        if (count > 1) {
            Paint moreBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            moreBg.setColor(light ? 0xFFE0F2FE : 0x2638BDF8);
            RectF more = new RectF(pill.right - 134f, pill.centerY() - 20f, pill.right - 84f, pill.centerY() + 20f);
            canvas.drawRoundRect(more, 18f, 18f, moreBg);
            if (light) {
                Paint moreStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
                moreStroke.setStyle(Paint.Style.STROKE);
                moreStroke.setStrokeWidth(1.4f);
                moreStroke.setColor(0x6638BDF8);
                canvas.drawRoundRect(more, 18f, 18f, moreStroke);
            }
            Paint moreText = new Paint(Paint.ANTI_ALIAS_FLAG);
            moreText.setColor(light ? 0xFF075985 : 0xFFD7FFF0);
            moreText.setTextSize(21f);
            moreText.setFakeBoldText(true);
            moreText.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("+" + Math.min(9, count - 1), more.centerX(), more.centerY() + 8f, moreText);
            moreText.setTextAlign(Paint.Align.LEFT);
        }
        canvas.drawText(timeText, pill.right - 20f, pill.centerY() + 7f, time);
        time.setTextAlign(Paint.Align.LEFT);
    }

    private static void drawBellIcon(Canvas canvas, float cx, float cy, int color) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(3.4f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setColor(color);
        Path bell = new Path();
        bell.moveTo(cx - 12f, cy + 8f);
        bell.lineTo(cx + 12f, cy + 8f);
        bell.cubicTo(cx + 8f, cy + 4f, cx + 7f, cy - 2f, cx + 7f, cy - 8f);
        bell.cubicTo(cx + 7f, cy - 16f, cx - 7f, cy - 16f, cx - 7f, cy - 8f);
        bell.cubicTo(cx - 7f, cy - 2f, cx - 8f, cy + 4f, cx - 12f, cy + 8f);
        canvas.drawPath(bell, line);
        canvas.drawLine(cx - 4f, cy + 13f, cx + 4f, cy + 13f, line);
    }

    private static int dominantColor(Bitmap image, int fallback) {
        if (image == null || image.isRecycled()) return fallback;
        int width = image.getWidth();
        int height = image.getHeight();
        if (width <= 0 || height <= 0) return fallback;
        int step = Math.max(1, Math.min(width, height) / 28);
        double red = 0d;
        double green = 0d;
        double blue = 0d;
        double weightTotal = 0d;
        float[] hsv = new float[3];
        for (int y = 0; y < height; y += step) {
            for (int x = 0; x < width; x += step) {
                int color = image.getPixel(x, y);
                if (Color.alpha(color) < 40) continue;
                int r = Color.red(color);
                int g = Color.green(color);
                int b = Color.blue(color);
                int max = Math.max(r, Math.max(g, b));
                int min = Math.min(r, Math.min(g, b));
                int brightness = (r + g + b) / 3;
                if (brightness < 22 || brightness > 242 || max - min < 10) continue;
                Color.colorToHSV(color, hsv);
                if (hsv[1] < 0.10f || hsv[2] < 0.10f) continue;
                double weight = Math.max(0.001d, hsv[1] * hsv[1] * (0.42d + hsv[2]));
                red += r * weight;
                green += g * weight;
                blue += b * weight;
                weightTotal += weight;
            }
        }
        if (weightTotal <= 0.001d) return fallback;
        return Color.rgb(
            (int) Math.min(255, Math.round(red / weightTotal)),
            (int) Math.min(255, Math.round(green / weightTotal)),
            (int) Math.min(255, Math.round(blue / weightTotal))
        );
    }

    private static int dominantColorRegion(Bitmap image, float leftRatio, float topRatio, float rightRatio, float bottomRatio, int fallback) {
        if (image == null || image.isRecycled()) return fallback;
        int width = image.getWidth();
        int height = image.getHeight();
        if (width <= 0 || height <= 0) return fallback;
        int left = Math.max(0, Math.min(width - 1, Math.round(width * leftRatio)));
        int top = Math.max(0, Math.min(height - 1, Math.round(height * topRatio)));
        int right = Math.max(left + 1, Math.min(width, Math.round(width * rightRatio)));
        int bottom = Math.max(top + 1, Math.min(height, Math.round(height * bottomRatio)));
        int step = Math.max(1, Math.min(right - left, bottom - top) / 22);
        long red = 0L;
        long green = 0L;
        long blue = 0L;
        long count = 0L;
        for (int y = top; y < bottom; y += step) {
            for (int x = left; x < right; x += step) {
                int color = image.getPixel(x, y);
                if (Color.alpha(color) < 40) continue;
                int r = Color.red(color);
                int g = Color.green(color);
                int b = Color.blue(color);
                int max = Math.max(r, Math.max(g, b));
                int min = Math.min(r, Math.min(g, b));
                int brightness = (r + g + b) / 3;
                if (brightness < 24 || brightness > 242 || max - min < 13) continue;
                red += r;
                green += g;
                blue += b;
                count++;
            }
        }
        if (count <= 0L) return fallback;
        return Color.rgb(
            (int) Math.min(255, red / count),
            (int) Math.min(255, green / count),
            (int) Math.min(255, blue / count)
        );
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

    private static void drawStatusChip(Canvas canvas, Snapshot snapshot, long now, ThemePalette palette) {
        boolean online = snapshot.online(now);
        String label = online ? "Sistem online" : "Sistem offline";
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(24f);
        text.setFakeBoldText(true);
        float width = Math.max(244f, text.measureText(label) + 72f);
        RectF chip = new RectF(BASE_WIDTH - width - 170f, 70f, BASE_WIDTH - 150f, 126f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(online ? palette.accentSoft : (palette.light ? 0xFFFFEDED : 0x33EF4444));
        canvas.drawRoundRect(chip, 32f, 32f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2f);
        stroke.setColor(online ? adjustAlpha(palette.accent, 164) : 0xAAEF4444);
        canvas.drawRoundRect(chip, 32f, 32f, stroke);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(online ? palette.accent : 0xFFEF4444);
        canvas.drawCircle(chip.left + 29f, chip.centerY(), 9f, dot);
        text.setColor(online ? palette.accentStrong : (palette.light ? 0xFF991B1B : 0xFFFFB4B4));
        canvas.drawText(label, chip.left + 50f, chip.centerY() + 8f, text);
    }

    private static void drawStatusOverviewCard(Canvas canvas, Snapshot snapshot, long now, ThemePalette palette) {
        RectF card = new RectF(42f, 270f, BASE_WIDTH - 42f, 382f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(card, 24f, 24f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.6f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(card, 24f, 24f, stroke);

        Paint icon = new Paint(Paint.ANTI_ALIAS_FLAG);
        icon.setStyle(Paint.Style.STROKE);
        icon.setStrokeWidth(5.2f);
        icon.setStrokeCap(Paint.Cap.ROUND);
        icon.setStrokeJoin(Paint.Join.ROUND);
        icon.setColor(palette.accent);
        drawCloudIcon(canvas, card.left + 62f, card.centerY(), icon);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(27f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, "ITS Live " + snapshot.locationLabel(), card.left + 112f, card.top + 43f, title, 520f);

        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(palette.muted);
        body.setTextSize(21f);
        String detail = snapshot.online(now)
            ? "Kamera dan RTDB tersambung"
            : "Menunggu koneksi perangkat";
        drawTextLimited(canvas, detail, card.left + 112f, card.top + 78f, body, 520f);

        body.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(ellipsize(snapshot.timeText(), body, 250f), card.right - 22f, card.top + 69f, body);
        body.setTextAlign(Paint.Align.LEFT);
    }

    private static boolean drawReplyableNotificationSurface(Context context, Canvas canvas, long now, ThemePalette palette) {
        List<NotificationInfo> notifications = NotificationInfo.enabledForLockScreen(context);
        if (notifications.isEmpty()) return false;
        NotificationInfo notification = notifications.get(0);
        RectF card = notificationBaseRect();
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(card, 24f, 24f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.6f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(card, 24f, 24f, stroke);

        RectF iconRect = new RectF(card.left + 20f, card.top + 20f, card.left + 88f, card.top + 88f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 18f, 18f, iconBg);
        Bitmap icon = notification.icon(context, 54);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 7f, iconRect.top + 7f, iconRect.right - 7f, iconRect.bottom - 7f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(24f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, notification.titleText(context), card.left + 108f, card.top + 40f, title, card.width() - 318f);
        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(palette.muted);
        body.setTextSize(20f);
        drawTextLimited(canvas, notification.text, card.left + 108f, card.top + 72f, body, card.width() - 318f);
        body.setTextAlign(Paint.Align.RIGHT);
        body.setTextSize(18f);
        canvas.drawText(notification.timeText(), card.right - 26f, card.top + 36f, body);
        body.setTextAlign(Paint.Align.LEFT);

        RectF reply = topNotificationReplyRect(card);
        drawInlineButton(canvas, reply, "Balas", palette, true);
        return true;
    }

    private static void drawScrollableMainContent(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        long now,
        ThemePalette palette,
        float scrollY
    ) {
        float boundedScroll = Math.max(0f, Math.min(scrollY, mainWidgetMaxScroll(context)));
        canvas.save();
        canvas.clipRect(mainScrollViewportBaseRect());
        canvas.translate(0f, -boundedScroll);
        drawContentCard(context, canvas, snapshot, now, palette);
        drawAutoWidgetCards(context, canvas, now, palette);
        canvas.restore();
    }

    private static void drawAutoWidgetCards(Context context, Canvas canvas, long now, ThemePalette palette) {
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        List<NotificationInfo> replyCards = NotificationInfo.enabledForLockScreen(context);

        float top = MAIN_WIDGET_TOP;
        for (DynamicWidgetInfo widget : widgets) {
            if (!shouldShowMainWidget(widgets, widget)) continue;
            RectF card = mainWidgetCardBaseRect(widget, top);
            drawDynamicWidgetCard(context, canvas, widget, card, palette);
            top = card.bottom + WIDGET_GAP;
        }
        for (int i = 0; i < replyCards.size(); i++) {
            RectF card = replyNotificationCardBaseRect(top, i);
            drawInlineNotificationCard(context, canvas, replyCards.get(i), card, palette.light);
        }
    }

    private static boolean shouldShowMainWidget(List<DynamicWidgetInfo> widgets, DynamicWidgetInfo widget) {
        if (widget == null) return false;
        if (shouldSuppressProviderBehindMedia(widgets, widget)) return false;
        boolean hasProviderWidget = hasProviderWidget(widgets);
        return !(hasProviderWidget && widget.providerComponent == null && !widget.isMediaControl());
    }

    private static boolean shouldSuppressProviderBehindMedia(List<DynamicWidgetInfo> widgets, DynamicWidgetInfo widget) {
        if (widgets == null || widget == null || widget.providerComponent == null || TextUtils.isEmpty(widget.packageName)) return false;
        for (DynamicWidgetInfo candidate : widgets) {
            if (candidate == null || candidate == widget || !candidate.isMediaSession()) continue;
            if (widget.packageName.equals(candidate.packageName)) return true;
        }
        return false;
    }

    private static boolean hasProviderWidget(List<DynamicWidgetInfo> widgets) {
        if (widgets == null) return false;
        for (DynamicWidgetInfo widget : widgets) {
            if (widget != null && widget.providerComponent != null) return true;
        }
        return false;
    }

    private static boolean hasLargeMainWidget(List<DynamicWidgetInfo> widgets) {
        if (widgets == null) return false;
        for (DynamicWidgetInfo widget : widgets) {
            if (widget != null && (widget.providerComponent != null || widget.isMediaControl())) return true;
        }
        return false;
    }

    private static int mainVisibleWidgetLimit(List<DynamicWidgetInfo> widgets, boolean hasReplyCards) {
        if (widgets == null || widgets.isEmpty()) return 0;
        return widgets.size();
    }

    private static RectF compactWidgetCardBaseRect(float top) {
        return new RectF(42f, top, BASE_WIDTH - 42f, top + COMPACT_WIDGET_HEIGHT);
    }

    static RectF hostedWidgetCardBaseRect(int index) {
        float top = MAIN_WIDGET_TOP + Math.max(0, index) * (HOSTED_WIDGET_DEFAULT_HEIGHT + WIDGET_GAP);
        return new RectF(42f, top, BASE_WIDTH - 42f, top + HOSTED_WIDGET_DEFAULT_HEIGHT);
    }

    static RectF hostedWidgetCardBaseRect(HostedWidgetSpec spec) {
        if (spec == null) return hostedWidgetCardBaseRect(0);
        return new RectF(42f, spec.mainTop, BASE_WIDTH - 42f, spec.mainTop + spec.mainHeight);
    }

    private static RectF mainWidgetCardBaseRect(DynamicWidgetInfo widget, float top) {
        if (widget != null && (widget.providerComponent != null || widget.isMediaControl())) {
            return new RectF(42f, top, BASE_WIDTH - 42f, top + hostedWidgetMainHeight(widget));
        }
        return compactWidgetCardBaseRect(top);
    }

    private static float hostedWidgetMainHeight(DynamicWidgetInfo widget) {
        if (widget == null) return HOSTED_WIDGET_DEFAULT_HEIGHT;
        if (widget.isMediaControl() && widget.providerComponent == null) return MEDIA_WIDGET_HEIGHT;
        float ratio = widget.aspectRatio();
        float height = Float.isNaN(ratio) || Float.isInfinite(ratio) || ratio <= 0f
            ? HOSTED_WIDGET_DEFAULT_HEIGHT
            : (BASE_WIDTH - 84f) * ratio * 1.04f;
        return Math.max(HOSTED_WIDGET_MIN_HEIGHT, Math.min(HOSTED_WIDGET_MAX_HEIGHT, height));
    }

    private static float hostedWidgetFullHeight(DynamicWidgetInfo widget) {
        float height = hostedWidgetMainHeight(widget) * 1.18f;
        return Math.max(360f, Math.min(1296f, height));
    }

    static RectF widgetViewportBaseRect() {
        return mainScrollViewportBaseRect();
    }

    static RectF mainScrollViewportBaseRect() {
        return new RectF(0f, MAIN_SCROLL_VIEWPORT_TOP, BASE_WIDTH, WIDGET_VIEWPORT_BOTTOM);
    }

    static float mainWidgetMaxScroll(Context context) {
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        List<NotificationInfo> replyCards = NotificationInfo.enabledForLockScreen(context);
        float bottom = 1214f + CONTENT_SHIFT;
        float top = MAIN_WIDGET_TOP;
        for (DynamicWidgetInfo widget : widgets) {
            if (!shouldShowMainWidget(widgets, widget)) continue;
            RectF card = mainWidgetCardBaseRect(widget, top);
            bottom = Math.max(bottom, card.bottom);
            top = card.bottom + WIDGET_GAP;
        }
        for (int i = 0; i < replyCards.size(); i++) {
            bottom = Math.max(bottom, replyNotificationCardBaseRect(top, i).bottom);
        }
        return Math.max(0f, bottom + WIDGET_GAP - mainScrollViewportBaseRect().bottom);
    }

    static RectF hostedFullWidgetPreviewBaseRect() {
        return new RectF(42f, 190f, BASE_WIDTH - 42f, 1486f);
    }

    static RectF hostedFullWidgetPreviewBaseRect(HostedWidgetSpec spec) {
        return hostedFullWidgetPreviewBaseRect(spec == null ? HOSTED_WIDGET_MAX_HEIGHT : spec.fullHeight);
    }

    private static RectF hostedFullWidgetPreviewBaseRect(DynamicWidgetInfo widget) {
        return hostedFullWidgetPreviewBaseRect(hostedWidgetFullHeight(widget));
    }

    private static RectF hostedFullWidgetPreviewBaseRect(float height) {
        float safeHeight = Math.max(360f, Math.min(1296f, height));
        float top = 190f + (1296f - safeHeight) * 0.42f;
        return new RectF(42f, top, BASE_WIDTH - 42f, top + safeHeight);
    }

    private static RectF replyNotificationCardBaseRect(Context context, int precedingWidgets) {
        return replyNotificationCardBaseRect(context, precedingWidgets, 0);
    }

    private static RectF replyNotificationCardBaseRect(Context context, int precedingWidgets, int notificationIndex) {
        float top = mainWidgetNextTop(context);
        top += Math.max(0, notificationIndex) * (174f + WIDGET_GAP);
        return new RectF(42f, top, BASE_WIDTH - 42f, top + 174f);
    }

    private static RectF replyNotificationCardBaseRect(float firstTop, int notificationIndex) {
        float top = firstTop + Math.max(0, notificationIndex) * (174f + WIDGET_GAP);
        return new RectF(42f, top, BASE_WIDTH - 42f, top + 174f);
    }

    private static float mainWidgetNextTop(Context context) {
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        float top = MAIN_WIDGET_TOP;
        for (DynamicWidgetInfo widget : widgets) {
            if (!shouldShowMainWidget(widgets, widget)) continue;
            RectF card = mainWidgetCardBaseRect(widget, top);
            top = card.bottom + WIDGET_GAP;
        }
        return top;
    }

    private static void drawDynamicWidgetCard(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF card, ThemePalette palette) {
        boolean needsBind = widget.providerComponent != null && !isHostedWidgetReady(context, widget.id);
        if (widget.isMediaControl()) {
            drawMediaWidgetCard(context, canvas, widget, card, palette);
            return;
        }
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(card, 24f, 24f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(card, 24f, 24f, stroke);

        if (widget.providerComponent != null && !needsBind) return;

        RectF iconRect = new RectF(card.left + 22f, card.top + 25f, card.left + 94f, card.top + 97f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 18f, 18f, iconBg);
        Bitmap icon = widget.icon(context, 58);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 7f, iconRect.top + 7f, iconRect.right - 7f, iconRect.bottom - 7f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, iconRect.centerX(), iconRect.centerY(), widget.kind, palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(27f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, widget.title, card.left + 116f, card.top + 47f, title, card.width() - (widget.full ? 252f : 152f));

        Paint subtitle = new Paint(Paint.ANTI_ALIAS_FLAG);
        subtitle.setColor(palette.muted);
        subtitle.setTextSize(22f);
        drawTextLimited(canvas, needsBind ? "Perlu izin widget lock screen" : widget.subtitle, card.left + 116f, card.top + 82f, subtitle, card.width() - (widget.full ? 252f : 152f));
        if (widget.full) {
            RectF full = new RectF(card.right - 112f, card.centerY() - 26f, card.right - 24f, card.centerY() + 26f);
            drawInlineButton(canvas, full, needsBind ? "Izin" : "Buka", palette, false);
        }
        if (needsBind) drawWidgetCardSkeleton(canvas, card, palette);
    }

    private static void drawMediaWidgetCard(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF card, ThemePalette palette) {
        if (widget != null && widget.isMediaSession()) {
            drawDetailedMediaWidgetCard(context, canvas, widget, card, palette);
            return;
        }
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(card, 24f, 24f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(card, 24f, 24f, stroke);

        if (card.height() <= 360f) {
            drawCompactMediaWidgetCard(context, canvas, widget, card, palette);
            return;
        }

        if (card.height() > 360f) {
            RectF smallIcon = new RectF(card.left + 28f, card.top + 28f, card.left + 92f, card.top + 92f);
            Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            iconBg.setColor(palette.accentSoft);
            canvas.drawRoundRect(smallIcon, 17f, 17f, iconBg);
            Bitmap appIcon = widget.icon(context, 54);
            if (appIcon != null) {
                canvas.drawBitmap(appIcon, null, new RectF(smallIcon.left + 7f, smallIcon.top + 7f, smallIcon.right - 7f, smallIcon.bottom - 7f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            } else {
                drawWidgetGlyph(canvas, smallIcon.centerX(), smallIcon.centerY(), "media", palette.accent);
            }

            Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
            title.setColor(palette.text);
            title.setTextSize(30f);
            title.setFakeBoldText(true);
            drawTextLimited(canvas, widget.title, smallIcon.right + 22f, card.top + 54f, title, card.width() - 168f);

            Paint subtitle = new Paint(Paint.ANTI_ALIAS_FLAG);
            subtitle.setColor(palette.muted);
            subtitle.setTextSize(22f);
            String mediaLine = TextUtils.isEmpty(widget.subtitle) ? "Kontrol media siap" : widget.subtitle;
            drawTextLimited(canvas, mediaLine, smallIcon.right + 22f, card.top + 88f, subtitle, card.width() - 168f);

            RectF artRect = new RectF(card.left + 32f, card.top + 126f, card.right - 32f, card.bottom - 138f);
            Paint artBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            artBg.setColor(palette.light ? 0xFFEAF4E8 : 0xFF07100B);
            canvas.drawRoundRect(artRect, 26f, 26f, artBg);
            Bitmap art = widget.artwork != null && !widget.artwork.isRecycled() ? widget.artwork : null;
            if (art != null) {
                canvas.save();
                Path clip = new Path();
                clip.addRoundRect(artRect, 26f, 26f, Path.Direction.CW);
                canvas.clipPath(clip);
                drawBitmapCover(canvas, art, artRect);
                canvas.restore();
            } else if (appIcon != null) {
                RectF largeIcon = new RectF(artRect.centerX() - 92f, artRect.centerY() - 92f, artRect.centerX() + 92f, artRect.centerY() + 92f);
                canvas.drawBitmap(appIcon, null, largeIcon, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            } else {
                drawWidgetGlyph(canvas, artRect.centerX(), artRect.centerY(), "media", palette.accent);
            }

            drawMediaButton(canvas, mediaPreviousRect(card), "Prev", palette, false);
            drawMediaButton(canvas, mediaPlayPauseRect(card), widget.isMediaPlaying() ? "Pause" : "Play", palette, true);
            drawMediaButton(canvas, mediaNextRect(card), "Next", palette, false);
            return;
        }

        RectF artRect = new RectF(card.left + 22f, card.top + 22f, card.left + 132f, card.top + 132f);
        Paint artBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        artBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(artRect, 22f, 22f, artBg);
        Bitmap icon = widget.icon(context, 98);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(artRect.left + 8f, artRect.top + 8f, artRect.right - 8f, artRect.bottom - 8f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, artRect.centerX(), artRect.centerY(), "media", palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(27f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, widget.title, artRect.right + 24f, card.top + 49f, title, card.width() - 190f);

        Paint subtitle = new Paint(Paint.ANTI_ALIAS_FLAG);
        subtitle.setColor(palette.muted);
        subtitle.setTextSize(22f);
        drawTextLimited(canvas, widget.subtitle, artRect.right + 24f, card.top + 84f, subtitle, card.width() - 190f);

        float buttonTop = card.bottom - 78f;
        RectF prev = mediaPreviousRect(card);
        RectF play = mediaPlayPauseRect(card);
        RectF next = mediaNextRect(card);
        drawMediaButton(canvas, prev, "Prev", palette, false);
        drawMediaButton(canvas, play, widget.isMediaPlaying() ? "Pause" : "Play", palette, true);
        drawMediaButton(canvas, next, "Next", palette, false);

        Paint rail = new Paint(Paint.ANTI_ALIAS_FLAG);
        rail.setColor(palette.accentSoft);
        canvas.drawRoundRect(new RectF(artRect.right + 24f, buttonTop - 28f, card.right - 28f, buttonTop - 18f), 6f, 6f, rail);
    }

    private static void drawDetailedMediaWidgetCard(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF card, ThemePalette palette) {
        Bitmap art = widget.artwork != null && !widget.artwork.isRecycled() ? widget.artwork : null;
        int rawAccent = dominantColor(art, "com.spotify.music".equals(widget.packageName) ? 0xFF1ED760 : palette.accent);
        int accent = boostAccent(rawAccent, palette.light);
        if (art != null) lastDynamicAccent = accent;
        int surface = palette.light ? blend(0xFFFFFFFF, rawAccent, 0.20f) : blend(0xFF070707, rawAccent, 0.34f);
        int surfaceAlt = palette.light ? blend(0xFFF8FAFC, rawAccent, 0.24f) : blend(0xFF080A0C, rawAccent, 0.42f);
        int border = adjustAlpha(accent, palette.light ? 96 : 128);
        int text = palette.light ? 0xFF061018 : 0xFFFFFFFF;
        int muted = palette.light ? blend(0xFF334155, rawAccent, 0.28f) : blend(0xFFC6D3CF, rawAccent, 0.18f);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(surface);
        canvas.drawRoundRect(card, 28f, 28f, bg);
        if (art != null) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(card, 28f, 28f, Path.Direction.CW);
            canvas.clipPath(clip);
            RectF wash = new RectF(card.left, card.top, card.right, card.top + 260f);
            canvas.clipRect(wash);
            drawBitmapCover(canvas, art, wash);
            Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
            veil.setShader(new LinearGradient(0f, wash.top, 0f, wash.bottom, adjustAlpha(surface, 182), surface, Shader.TileMode.CLAMP));
            canvas.drawRect(wash, veil);
            canvas.restore();
        }
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.6f);
        stroke.setColor(border);
        canvas.drawRoundRect(card, 28f, 28f, stroke);

        Bitmap appIcon = loadAppIconBitmap(context, widget.packageName, 42);
        RectF appRect = new RectF(card.left + 36f, card.top + 34f, card.left + 82f, card.top + 80f);
        if (appIcon != null) {
            canvas.drawBitmap(appIcon, null, appRect, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, appRect.centerX(), appRect.centerY(), "music", accent);
        }
        Paint header = new Paint(Paint.ANTI_ALIAS_FLAG);
        header.setColor(muted);
        header.setTextSize(24f);
        header.setFakeBoldText(true);
        RectF deviceButton = mediaDeviceRect(card);
        drawTextLimited(
            canvas,
            mediaAppLabel(context, widget) + " - Diputar di " + mediaDeviceLabel(context, widget),
            card.left + 96f,
            card.top + 65f,
            header,
            Math.max(180f, deviceButton.left - (card.left + 112f))
        );

        RectF muteButton = mediaMuteRect(card);
        drawRoundIconButton(canvas, muteButton, surfaceAlt, border);
        drawSpeakerGlyph(canvas, muteButton, isMusicMuted(context) ? accent : text, isMusicMuted(context));

        canvas.drawRoundRect(deviceButton, deviceButton.height() / 2f, deviceButton.height() / 2f, paintFilled(surfaceAlt));
        Paint deviceStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        deviceStroke.setStyle(Paint.Style.STROKE);
        deviceStroke.setStrokeWidth(1.5f);
        deviceStroke.setColor(border);
        canvas.drawRoundRect(deviceButton, deviceButton.height() / 2f, deviceButton.height() / 2f, deviceStroke);
        RectF deviceIconArea = new RectF(deviceButton.left + 18f, deviceButton.top + 13f, deviceButton.left + 18f + (deviceButton.height() - 26f), deviceButton.bottom - 13f);
        drawDeviceGlyph(canvas, deviceIconArea, text);
        Paint deviceLabel = new Paint(Paint.ANTI_ALIAS_FLAG);
        deviceLabel.setColor(text);
        deviceLabel.setTextSize(18.5f);
        deviceLabel.setFakeBoldText(true);
        drawTextLimited(canvas, "Perangkat", deviceIconArea.right + 12f, deviceButton.centerY() + 6.5f, deviceLabel, deviceButton.right - deviceIconArea.right - 28f);

        RectF currentCover = mediaCurrentCoverRect(card);
        RectF prevCover = mediaPreviousPreviewRect(card);
        RectF nextCover = mediaNextPreviewRect(card);

        List<HistoryEntry> history = mediaHistoryFor(widget.packageName);
        HistoryEntry prevEntry = history.size() > 1 ? history.get(1) : null;
        String prevTitle = prevEntry != null ? prevEntry.title : "";
        String prevArtist = prevEntry != null ? prevEntry.artist : "";

        String prevCombined = previousTrackByPackage.get(widget.packageName);
        Bitmap prevArt = previousArtByPackage.get(widget.packageName);
        Bitmap nextArt = nextArtByPackage.get(widget.packageName);
        String[] prevParts = splitTitleArtist(prevCombined);
        String nextCombined = (widget.mediaQueue != null && !widget.mediaQueue.isEmpty()) ? widget.mediaQueue.get(0) : "";
        String[] nextParts = splitTitleArtist(nextCombined);
        float transition = easeOutCubic(mediaTrackTransitionFraction(widget));
        RectF prevStart = teaserRectCenteredAt(prevCover, currentCover.centerX(), prevCover.centerY());
        RectF animatedPrev = lerpRect(prevStart, prevCover, transition);
        RectF animatedNext = new RectF(nextCover);
        animatedNext.offset((1f - transition) * 76f, 0f);

        canvas.saveLayerAlpha(new RectF(card.left, prevCover.top - 8f, card.right, prevCover.bottom + 84f), Math.round(130f + 125f * transition));
        drawMediaTeaser(
            canvas, animatedPrev, prevArt,
            TextUtils.isEmpty(prevCombined) ? "Belum ada histori" : prevParts[0],
            prevParts[1],
            accent, muted, surfaceAlt, false
        );
        canvas.restore();

        canvas.saveLayerAlpha(new RectF(nextCover.left - 12f, nextCover.top - 8f, card.right, nextCover.bottom + 84f), Math.round(80f + 175f * transition));
        drawMediaTeaser(
            canvas, animatedNext, nextArt,
            TextUtils.isEmpty(nextCombined) ? "Preview belum dibagikan" : nextParts[0],
            TextUtils.isEmpty(nextCombined) ? "Spotify belum membuka antrean" : nextParts[1],
            accent, muted, surfaceAlt, false
        );
        canvas.restore();

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(text);
        title.setTextSize(32f);
        title.setFakeBoldText(true);
        title.setTextAlign(Paint.Align.CENTER);
        Paint artist = new Paint(Paint.ANTI_ALIAS_FLAG);
        artist.setColor(muted);
        artist.setTextSize(25f);
        artist.setTextAlign(Paint.Align.CENTER);

        int currentAlpha = Math.round(255f * transition);
        float slideY = (1f - transition) * 42f;
        RectF currentLayer = new RectF(currentCover.left - 72f, currentCover.top - 12f, currentCover.right + 72f, currentCover.bottom + 96f);
        canvas.saveLayerAlpha(currentLayer, currentAlpha);
        canvas.translate(0f, slideY);
        drawMediaCover(canvas, currentCover, art, accent, surfaceAlt, true);
        drawTextLimitedCentered(canvas, widget.title, card.centerX(), currentCover.bottom + 42f, title, 468f);
        drawTextLimitedCentered(canvas, compactMediaArtist(widget), card.centerX(), currentCover.bottom + 80f, artist, 500f);
        canvas.restore();
        title.setTextAlign(Paint.Align.LEFT);
        artist.setTextAlign(Paint.Align.LEFT);

        RectF progressTrack = mediaProgressRect(card);
        drawMediaWaveform(canvas, progressTrack, widget, accent, muted);
        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(adjustAlpha(muted, palette.light ? 52 : 58));
        canvas.drawRoundRect(progressTrack, 5f, 5f, track);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(accent);
        float progress = mediaProgressFraction(widget);
        float progressRight = progressTrack.left + progressTrack.width() * progress;
        canvas.drawRoundRect(new RectF(progressTrack.left, progressTrack.top, progressRight, progressTrack.bottom), 5f, 5f, fill);
        Paint thumb = new Paint(Paint.ANTI_ALIAS_FLAG);
        thumb.setColor(accent);
        canvas.drawCircle(progressRight, progressTrack.centerY(), 10f, thumb);

        Paint time = new Paint(Paint.ANTI_ALIAS_FLAG);
        time.setColor(muted);
        time.setTextSize(20f);
        long position = mediaCurrentPositionMs(widget);
        long duration = widget.mediaDurationMs;
        canvas.drawText(formatMediaTime(position), progressTrack.left, progressTrack.bottom + 34f, time);
        time.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(duration > 0L ? formatMediaTime(duration) : "--:--", progressTrack.right, progressTrack.bottom + 34f, time);
        time.setTextAlign(Paint.Align.LEFT);

        RectF favorite = mediaFavoriteRect(card);
        RectF previous = mediaPreviousRect(card);
        RectF transcript = mediaTranscriptRect(card);
        RectF play = mediaPlayPauseRect(card);
        RectF repeat = mediaRepeatRect(card);
        RectF next = mediaNextRect(card);
        RectF queue = mediaQueueRect(card);
        drawRoundIconButton(canvas, favorite, surfaceAlt, border);
        drawHeartGlyph(canvas, favorite, isMediaFavorite(context, widget) ? accent : text, isMediaFavorite(context, widget));
        drawMediaButton(canvas, previous, "Prev", paletteFromMedia(palette, accent, text, surfaceAlt, border), false);
        drawRoundIconButton(canvas, transcript, surfaceAlt, border);
        drawTranscriptGlyph(canvas, transcript, text);
        drawMediaButton(canvas, play, widget.isMediaPlaying() ? "Pause" : "Play", paletteFromMedia(palette, accent, readableTextOn(accent), surfaceAlt, border), true);
        drawRoundIconButton(canvas, repeat, surfaceAlt, border);
        drawRepeatGlyph(canvas, repeat, isMediaRepeatEnabled(context, widget.packageName) ? accent : text);
        drawMediaButton(canvas, next, "Next", paletteFromMedia(palette, accent, text, surfaceAlt, border), false);
        drawRoundIconButton(canvas, queue, surfaceAlt, border);
        drawHistoryGlyphWithLabel(canvas, queue, text);
    }

    private static ThemePalette paletteFromMedia(ThemePalette base, int accent, int accentText, int surfaceAlt, int border) {
        return new ThemePalette(
            base.light,
            base.backgroundTop,
            base.backgroundBottom,
            base.surface,
            surfaceAlt,
            border,
            base.text,
            base.muted,
            accent,
            adjustAlpha(accent, base.light ? 42 : 58),
            boostAccent(accent, false),
            accentText
        );
    }

    private static void drawRoundIconButton(Canvas canvas, RectF rect, int fillColor, int borderColor) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(fillColor);
        canvas.drawRoundRect(rect, 18f, 18f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(borderColor);
        canvas.drawRoundRect(rect, 18f, 18f, stroke);
    }

    private static Paint paintFilled(int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        return paint;
    }

    private static void drawMediaCover(Canvas canvas, RectF rect, Bitmap art, int accent, int surfaceAlt, boolean current) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(surfaceAlt);
        canvas.drawRoundRect(rect, current ? 28f : 22f, current ? 28f : 22f, bg);
        canvas.save();
        Path clip = new Path();
        clip.addRoundRect(rect, current ? 28f : 22f, current ? 28f : 22f, Path.Direction.CW);
        canvas.clipPath(clip);
        if (art != null && !art.isRecycled()) {
            drawBitmapCover(canvas, art, rect);
        } else {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(blend(surfaceAlt, accent, 0.45f));
            canvas.drawRect(rect, fill);
            drawWidgetGlyph(canvas, rect.centerX(), rect.centerY(), "media", 0xFFFFFFFF);
        }
        canvas.restore();
    }

    private static void drawMediaTeaser(Canvas canvas, RectF rect, Bitmap art, String titleText, String artistText, int accent, int muted, int surfaceAlt, boolean active) {
        RectF cover = new RectF(rect.left + 12f, rect.top, rect.right - 12f, rect.top + rect.width() - 24f);
        drawMediaCover(canvas, cover, art, accent, blend(surfaceAlt, 0xFF000000, 0.12f), false);
        if (art == null) {
            Paint note = new Paint(Paint.ANTI_ALIAS_FLAG);
            note.setColor(adjustAlpha(muted, 130));
            drawWidgetGlyph(canvas, cover.centerX(), cover.centerY(), "media", note.getColor());
        }
        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(adjustAlpha(muted, active ? 255 : 188));
        title.setTextSize(18f);
        title.setFakeBoldText(true);
        title.setTextAlign(Paint.Align.CENTER);
        drawTextLimitedCentered(canvas, titleText, rect.centerX(), cover.bottom + 34f, title, rect.width());
        Paint artist = new Paint(Paint.ANTI_ALIAS_FLAG);
        artist.setColor(adjustAlpha(muted, 126));
        artist.setTextSize(15f);
        artist.setTextAlign(Paint.Align.CENTER);
        drawTextLimitedCentered(canvas, artistText, rect.centerX(), cover.bottom + 60f, artist, rect.width());
    }

    private static void drawCompactMediaWidgetCard(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF card, ThemePalette palette) {
        Bitmap art = widget.artwork != null && !widget.artwork.isRecycled() ? widget.artwork : null;
        Bitmap appIcon = widget.icon(context, 72);
        RectF cover = new RectF(card.left + 26f, card.top + 26f, card.left + 136f, card.top + 136f);
        Paint coverBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        coverBg.setColor(palette.light ? 0xFFEAF4E8 : 0xFF07100B);
        canvas.drawRoundRect(cover, 20f, 20f, coverBg);
        if (art != null) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(cover, 20f, 20f, Path.Direction.CW);
            canvas.clipPath(clip);
            drawBitmapCover(canvas, art, cover);
            canvas.restore();
        } else if (appIcon != null) {
            canvas.drawBitmap(appIcon, null, new RectF(cover.left + 16f, cover.top + 16f, cover.right - 16f, cover.bottom - 16f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, cover.centerX(), cover.centerY(), "media", palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(28f);
        title.setFakeBoldText(true);
        float textLeft = cover.right + 22f;
        drawTextLimited(canvas, widget.title, textLeft, card.top + 54f, title, card.width() - 240f);

        Paint subtitle = new Paint(Paint.ANTI_ALIAS_FLAG);
        subtitle.setColor(palette.muted);
        subtitle.setTextSize(21f);
        drawTextLimited(canvas, compactMediaSubtitle(widget), textLeft, card.top + 88f, subtitle, card.width() - 240f);

        RectF logo = new RectF(card.right - 78f, card.top + 28f, card.right - 30f, card.top + 76f);
        Paint logoBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        logoBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(logo, 14f, 14f, logoBg);
        Bitmap packageIcon = loadAppIconBitmap(context, widget.packageName, 40);
        if (packageIcon != null) {
            canvas.drawBitmap(packageIcon, null, new RectF(logo.left + 5f, logo.top + 5f, logo.right - 5f, logo.bottom - 5f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, logo.centerX(), logo.centerY(), "music", palette.accent);
        }

        RectF chip = new RectF(textLeft, card.top + 104f, Math.min(card.right - 96f, textLeft + 188f), card.top + 134f);
        Paint chipBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipBg.setColor(adjustAlpha(palette.accent, palette.light ? 34 : 50));
        canvas.drawRoundRect(chip, 15f, 15f, chipBg);
        Paint chipText = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipText.setColor(palette.accent);
        chipText.setTextSize(16f);
        chipText.setFakeBoldText(true);
        drawTextLimited(canvas, compactMediaSource(widget), chip.left + 14f, chip.top + 21f, chipText, chip.width() - 28f);

        RectF rail = compactMediaRailRect(card);
        Paint railBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        railBg.setColor(palette.light ? 0xFFE8F1E7 : 0xFF07150C);
        canvas.drawRoundRect(rail, 22f, 22f, railBg);
        if (art != null) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(rail, 22f, 22f, Path.Direction.CW);
            canvas.clipPath(clip);
            Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
            veil.setAlpha(palette.light ? 62 : 72);
            drawBitmapCover(canvas, art, rail);
            canvas.drawColor(palette.light ? 0xA8FFFFFF : 0xAA000000);
            canvas.restore();
        }
        Paint progressTrack = new Paint(Paint.ANTI_ALIAS_FLAG);
        progressTrack.setColor(adjustAlpha(palette.muted, palette.light ? 60 : 78));
        RectF track = new RectF(rail.left + 26f, rail.top + 16f, rail.right - 26f, rail.top + 24f);
        canvas.drawRoundRect(track, 4f, 4f, progressTrack);
        Paint progress = new Paint(Paint.ANTI_ALIAS_FLAG);
        progress.setColor(palette.accent);
        float progressRight = track.left + track.width() * (widget.isMediaPlaying() ? 0.42f : 0.18f);
        canvas.drawRoundRect(new RectF(track.left, track.top, progressRight, track.bottom), 4f, 4f, progress);

        drawMediaButton(canvas, mediaPreviousRect(card), "Prev", palette, false);
        drawMediaButton(canvas, mediaPlayPauseRect(card), widget.isMediaPlaying() ? "Pause" : "Play", palette, true);
        drawMediaButton(canvas, mediaNextRect(card), "Next", palette, false);
    }

    private static String compactMediaSubtitle(DynamicWidgetInfo widget) {
        String subtitle = widget == null ? "" : widget.subtitle;
        subtitle = subtitle == null ? "" : subtitle
            .replace(" - diputar", "")
            .replace(" - playing", "")
            .replace(" - sedang diputar", "")
            .trim();
        if (TextUtils.isEmpty(subtitle)) return "Media siap dikontrol";
        return subtitle + (widget.isMediaPlaying() ? " - diputar" : "");
    }

    private static String compactMediaSource(DynamicWidgetInfo widget) {
        if (widget != null && "com.spotify.music".equals(widget.packageName)) return "Spotify Connect";
        return "Media aktif";
    }

    private static String compactMediaArtist(DynamicWidgetInfo widget) {
        String subtitle = widget == null ? "" : widget.subtitle;
        subtitle = subtitle == null ? "" : subtitle
            .replace(" - diputar", "")
            .replace(" - playing", "")
            .replace(" - sedang diputar", "")
            .trim();
        return TextUtils.isEmpty(subtitle) ? "Media aktif" : subtitle;
    }

    private static String mediaAppLabel(Context context, DynamicWidgetInfo widget) {
        if (widget == null) return "Media";
        if ("com.spotify.music".equals(widget.packageName)) return "Spotify";
        return DynamicWidgetInfo.appName(context, widget.packageName, "Media");
    }

    private static String mediaDeviceLabel(Context context, DynamicWidgetInfo widget) {
        if (context == null || widget == null) return "Handphone ini";
        String saved = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_MEDIA_DEVICE_PREFIX + widget.packageName, "");
        if (!TextUtils.isEmpty(saved)) return normalizeMediaDeviceLabel(saved, false);
        String route = selectedMediaRouteLabel(context);
        if (!TextUtils.isEmpty(route)) return route;
        return widget.mediaRemote ? "Spotify Connect" : "Handphone ini";
    }

    static void setMediaDeviceLabel(Context context, String packageName, String label) {
        if (context == null || TextUtils.isEmpty(packageName)) return;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_MEDIA_DEVICE_PREFIX + packageName, normalizeMediaDeviceLabel(label, false))
            .apply();
    }

    private static String selectedMediaRouteLabel(Context context) {
        if (context == null) return "";
        try {
            MediaRouter router = (MediaRouter) context.getSystemService(Context.MEDIA_ROUTER_SERVICE);
            if (router == null) return "";
            MediaRouter.RouteInfo route = router.getSelectedRoute(MediaRouter.ROUTE_TYPE_LIVE_AUDIO);
            if (route == null) return "";
            CharSequence name = route.getName(context);
            String label = normalizeMediaDeviceLabel(name == null ? "" : name.toString(), true);
            if (TextUtils.isEmpty(label)) {
                return "";
            }
            return label;
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    static String normalizeMediaDeviceLabel(String rawLabel, boolean blankForLocalDevice) {
        String label = rawLabel == null ? "" : rawLabel.trim();
        if (TextUtils.isEmpty(label)) return blankForLocalDevice ? "" : "Handphone ini";
        String lower = label.toLowerCase(Locale.ROOT);
        boolean localDevice = "phone".equals(lower)
            || "this device".equals(lower)
            || "handphone ini".equals(lower)
            || lower.contains("this phone")
            || lower.contains("perangkat ini")
            || label.contains("手机")
            || label.contains("本机")
            || label.contains("此设备");
        if (localDevice) return blankForLocalDevice ? "" : "Handphone ini";
        return label;
    }

    static List<String> mediaQueueSummary(Context context, String packageName) {
        List<String> out = new ArrayList<>();
        if (context == null) return out;
        for (DynamicWidgetInfo widget : DynamicWidgetInfo.available(context)) {
            if (widget == null || !widget.isMediaSession()) continue;
            if (!TextUtils.isEmpty(packageName) && !packageName.equals(widget.packageName)) continue;
            if (widget.mediaQueue != null) out.addAll(widget.mediaQueue);
            break;
        }
        return out;
    }

    private static String mediaFavoriteKey(DynamicWidgetInfo widget) {
        if (widget == null) return "";
        return String.valueOf(widget.packageName) + "|" + String.valueOf(widget.title).trim().toLowerCase(Locale.ROOT) + "|" + compactMediaArtist(widget).toLowerCase(Locale.ROOT);
    }

    static void toggleMediaFavorite(Context context, String key) {
        if (context == null || TextUtils.isEmpty(key)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> favorites = readIdSet(prefs.getString(PREF_MEDIA_FAVORITE_KEYS, ""));
        if (!favorites.add(key)) favorites.remove(key);
        prefs.edit().putString(PREF_MEDIA_FAVORITE_KEYS, writeIdSet(favorites)).apply();
    }

    static void toggleMediaRepeat(Context context, String packageName) {
        if (context == null || TextUtils.isEmpty(packageName)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> repeated = readIdSet(prefs.getString(PREF_MEDIA_REPEAT_PACKAGES, ""));
        if (!repeated.add(packageName)) repeated.remove(packageName);
        prefs.edit().putString(PREF_MEDIA_REPEAT_PACKAGES, writeIdSet(repeated)).apply();
    }

    static boolean isMediaRepeatEnabled(Context context, String packageName) {
        if (context == null || TextUtils.isEmpty(packageName)) return false;
        Set<String> repeated = readIdSet(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_MEDIA_REPEAT_PACKAGES, ""));
        return repeated.contains(packageName);
    }

    private static boolean isMediaFavorite(Context context, DynamicWidgetInfo widget) {
        if (context == null || widget == null) return false;
        Set<String> favorites = readIdSet(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_MEDIA_FAVORITE_KEYS, ""));
        return favorites.contains(mediaFavoriteKey(widget));
    }

    private static boolean isMusicMuted(Context context) {
        if (context == null) return false;
        try {
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) return audio.isStreamMute(AudioManager.STREAM_MUSIC);
            return audio.getStreamVolume(AudioManager.STREAM_MUSIC) <= 0;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static String mediaQueueLabel(DynamicWidgetInfo widget, int offset) {
        if (widget != null && widget.mediaQueue != null && !widget.mediaQueue.isEmpty()) {
            int index = offset <= 0 ? 0 : Math.min(widget.mediaQueue.size() - 1, offset - 1);
            String label = widget.mediaQueue.get(index);
            if (!TextUtils.isEmpty(label)) return label;
        }
        if (offset < 0) return "Lagu sebelumnya";
        if (offset > 1) return "Riwayat berikutnya";
        return "Lagu berikutnya";
    }

    private static long mediaCurrentPositionMs(DynamicWidgetInfo widget) {
        if (widget == null) return 0L;
        long position = widget.mediaPositionMs;
        if (widget.isMediaPlaying() && widget.mediaUpdatedAtMs > 0L) {
            position += Math.max(0L, SystemClock.elapsedRealtime() - widget.mediaUpdatedAtMs);
        }
        if (widget.mediaDurationMs > 0L) return Math.max(0L, Math.min(widget.mediaDurationMs, position));
        return Math.max(0L, position);
    }

    private static float mediaProgressFraction(DynamicWidgetInfo widget) {
        if (widget == null || widget.mediaDurationMs <= 0L) return widget != null && widget.isMediaPlaying() ? 0.10f : 0f;
        return clamp01(mediaCurrentPositionMs(widget) / (float) widget.mediaDurationMs);
    }

    private static String formatMediaTime(long millis) {
        long safe = Math.max(0L, millis) / 1000L;
        long minutes = safe / 60L;
        long seconds = safe % 60L;
        return String.format(Locale.ROOT, "%d:%02d", minutes, seconds);
    }

    private static void drawCastGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.075f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);

        float screenLeft = cx - size * 0.30f;
        float screenRight = cx + size * 0.30f;
        float screenTop = cy - size * 0.26f;
        float screenBottom = cy + size * 0.06f;
        RectF screen = new RectF(screenLeft, screenTop, screenRight, screenBottom);
        canvas.drawRoundRect(screen, size * 0.05f, size * 0.05f, stroke);

        float originX = screenLeft;
        float originY = screenBottom + size * 0.16f;

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        canvas.drawCircle(originX, originY, size * 0.045f, fill);

        float r1 = size * 0.14f;
        canvas.drawArc(new RectF(originX - r1, originY - r1, originX + r1, originY + r1), -90f, 90f, false, stroke);

        float r2 = size * 0.24f;
        canvas.drawArc(new RectF(originX - r2, originY - r2, originX + r2, originY + r2), -90f, 90f, false, stroke);
    }

    private static void drawQueueGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(size * 0.07f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor(color);

        float left = cx - size * 0.32f;
        canvas.drawLine(left, cy - size * 0.22f, cx + size * 0.06f, cy - size * 0.22f, line);
        canvas.drawLine(left, cy, cx + size * 0.06f, cy, line);
        canvas.drawLine(left, cy + size * 0.22f, cx - size * 0.02f, cy + size * 0.22f, line);

        float noteX = cx + size * 0.20f;
        float noteTopY = cy - size * 0.30f;
        float noteBottomY = cy + size * 0.14f;
        canvas.drawLine(noteX, noteTopY, noteX, noteBottomY, line);
        canvas.drawLine(noteX, noteTopY, noteX + size * 0.18f, noteTopY - size * 0.02f, line);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        canvas.drawCircle(noteX - size * 0.06f, noteBottomY, size * 0.08f, fill);
    }

    private static void drawDeviceGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.09f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);

        float halfW = size * 0.19f;
        float halfH = size * 0.30f;
        RectF body = new RectF(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
        canvas.drawRoundRect(body, size * 0.08f, size * 0.08f, stroke);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        canvas.drawCircle(cx, cy + halfH - size * 0.07f, size * 0.035f, fill);
    }

    private static void drawHeartGlyph(Canvas canvas, RectF rect, int color, boolean filled) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(filled ? Paint.Style.FILL : Paint.Style.STROKE);
        paint.setStrokeWidth(3.2f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        float cx = rect.centerX();
        float cy = rect.centerY();
        float s = Math.min(rect.width(), rect.height()) * 0.34f;
        Path heart = new Path();
        heart.moveTo(cx, cy + s * 0.9f);
        heart.cubicTo(cx - s * 1.5f, cy - s * 0.15f, cx - s * 0.9f, cy - s * 1.3f, cx, cy - s * 0.55f);
        heart.cubicTo(cx + s * 0.9f, cy - s * 1.3f, cx + s * 1.5f, cy - s * 0.15f, cx, cy + s * 0.9f);
        canvas.drawPath(heart, paint);
    }

    private static void drawHistoryGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.075f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);

        float radius = size * 0.30f;
        RectF circleBounds = new RectF(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawArc(circleBounds, -20f, 300f, false, stroke);

        double angleRad = Math.toRadians(-20f);
        float arrowX = cx + radius * (float) Math.cos(angleRad);
        float arrowY = cy + radius * (float) Math.sin(angleRad);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        float a = size * 0.09f;
        Path arrow = new Path();
        arrow.moveTo(arrowX, arrowY - a);
        arrow.lineTo(arrowX + a, arrowY + a * 0.4f);
        arrow.lineTo(arrowX - a * 0.6f, arrowY + a);
        arrow.close();
        canvas.drawPath(arrow, fill);

        canvas.drawLine(cx, cy, cx, cy - radius * 0.55f, stroke);
        canvas.drawLine(cx, cy, cx + radius * 0.4f, cy + radius * 0.15f, stroke);
    }

    private static void drawHistoryGlyphWithLabel(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height()) * 0.64f;
        RectF icon = new RectF(
            rect.centerX() - size / 2f,
            rect.centerY() - size / 2f,
            rect.centerX() + size / 2f,
            rect.centerY() + size / 2f
        );
        drawHistoryGlyph(canvas, icon, color);
    }

    private static void drawTranscriptGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.052f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);
        RectF page = new RectF(rect.centerX() - size * 0.22f, rect.centerY() - size * 0.28f, rect.centerX() + size * 0.22f, rect.centerY() + size * 0.28f);
        canvas.drawRoundRect(page, size * 0.055f, size * 0.055f, stroke);
        canvas.drawLine(page.left + size * 0.08f, page.top + size * 0.14f, page.right - size * 0.08f, page.top + size * 0.14f, stroke);
        canvas.drawLine(page.left + size * 0.08f, page.top + size * 0.27f, page.right - size * 0.10f, page.top + size * 0.27f, stroke);
        canvas.drawLine(page.left + size * 0.08f, page.top + size * 0.40f, page.right - size * 0.18f, page.top + size * 0.40f, stroke);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setStyle(Paint.Style.FILL);
        dot.setColor(color);
        canvas.drawCircle(page.left - size * 0.05f, page.top + size * 0.18f, size * 0.035f, dot);
        canvas.drawCircle(page.left - size * 0.05f, page.top + size * 0.34f, size * 0.035f, dot);
    }

    private static void drawRepeatGlyph(Canvas canvas, RectF rect, int color) {
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.064f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);
        float left = cx - size * 0.30f;
        float right = cx + size * 0.30f;
        float topY = cy - size * 0.16f;
        float bottomY = cy + size * 0.16f;
        float turn = size * 0.18f;
        Path loop = new Path();
        loop.moveTo(left + turn, topY);
        loop.lineTo(right - size * 0.08f, topY);
        loop.moveTo(right - turn, topY);
        loop.cubicTo(right + size * 0.04f, topY, right + size * 0.04f, bottomY, right - turn, bottomY);
        loop.lineTo(left + size * 0.08f, bottomY);
        loop.moveTo(left + turn, bottomY);
        loop.cubicTo(left - size * 0.04f, bottomY, left - size * 0.04f, topY, left + turn, topY);
        canvas.drawPath(loop, stroke);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(color);
        fill.setStyle(Paint.Style.FILL);
        Path arrowTop = new Path();
        arrowTop.moveTo(right - size * 0.04f, topY);
        arrowTop.lineTo(right - size * 0.18f, topY - size * 0.12f);
        arrowTop.lineTo(right - size * 0.18f, topY + size * 0.12f);
        arrowTop.close();
        canvas.drawPath(arrowTop, fill);
        Path arrowBottom = new Path();
        arrowBottom.moveTo(left + size * 0.04f, bottomY);
        arrowBottom.lineTo(left + size * 0.18f, bottomY - size * 0.12f);
        arrowBottom.lineTo(left + size * 0.18f, bottomY + size * 0.12f);
        arrowBottom.close();
        canvas.drawPath(arrowBottom, fill);
    }

    private static void drawSpeakerGlyph(Canvas canvas, RectF rect, int color, boolean muted) {
        float size = Math.min(rect.width(), rect.height()) * 0.68f;
        float cx = rect.centerX() - size * 0.02f;
        float cy = rect.centerY();
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(size * 0.064f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setColor(color);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        Path body = new Path();
        body.moveTo(cx - size * 0.34f, cy - size * 0.12f);
        body.lineTo(cx - size * 0.17f, cy - size * 0.12f);
        body.lineTo(cx + size * 0.04f, cy - size * 0.28f);
        body.lineTo(cx + size * 0.04f, cy + size * 0.28f);
        body.lineTo(cx - size * 0.17f, cy + size * 0.12f);
        body.lineTo(cx - size * 0.34f, cy + size * 0.12f);
        body.close();
        canvas.drawPath(body, fill);
        if (muted) {
            canvas.drawLine(cx + size * 0.17f, cy - size * 0.18f, cx + size * 0.35f, cy + size * 0.18f, stroke);
            canvas.drawLine(cx + size * 0.35f, cy - size * 0.18f, cx + size * 0.17f, cy + size * 0.18f, stroke);
        } else {
            canvas.drawArc(new RectF(cx - size * 0.02f, cy - size * 0.22f, cx + size * 0.31f, cy + size * 0.22f), -42f, 84f, false, stroke);
            canvas.drawArc(new RectF(cx - size * 0.05f, cy - size * 0.34f, cx + size * 0.44f, cy + size * 0.34f), -42f, 84f, false, stroke);
        }
    }

    private static void drawMediaWaveform(Canvas canvas, RectF track, DynamicWidgetInfo widget, int accent, int muted) {
        RectF wave = new RectF(track.left, track.top - 38f, track.right, track.top - 4f);
        Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
        base.setStyle(Paint.Style.STROKE);
        base.setStrokeWidth(3.2f);
        base.setStrokeCap(Paint.Cap.ROUND);
        base.setColor(adjustAlpha(muted, 76));
        Paint active = new Paint(base);
        active.setColor(adjustAlpha(accent, 220));
        float progressX = track.left + track.width() * mediaProgressFraction(widget);
        Path before = new Path();
        Path after = new Path();
        int seed = Math.abs((String.valueOf(widget.title) + String.valueOf(widget.subtitle)).hashCode());
        int samples = 72;
        for (int i = 0; i <= samples; i++) {
            float t = i / (float) samples;
            float x = wave.left + wave.width() * t;
            float peakA = (float) Math.sin(t * Math.PI * 8d + (seed % 11));
            float peakB = (float) Math.sin(t * Math.PI * 19d + (seed % 17));
            float amp = 0.12f + 0.88f * Math.abs(peakA * 0.65f + peakB * 0.35f);
            float y = wave.centerY() - amp * wave.height() * 0.45f;
            if (i == 0) {
                before.moveTo(x, y);
                after.moveTo(x, y);
            } else {
                before.lineTo(x, y);
                after.lineTo(x, y);
            }
        }
        canvas.save();
        canvas.clipRect(wave.left, wave.top - 4f, progressX, wave.bottom + 4f);
        canvas.drawPath(before, active);
        canvas.restore();
        canvas.save();
        canvas.clipRect(progressX, wave.top - 4f, wave.right, wave.bottom + 4f);
        canvas.drawPath(after, base);
        canvas.restore();
    }

    private static void drawMediaButton(Canvas canvas, RectF rect, String label, ThemePalette palette, boolean primary) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(primary ? palette.accent : palette.surfaceAlt);
        canvas.drawRoundRect(rect, 17f, 17f, bg);
        if (!primary) {
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(1.3f);
            stroke.setColor(palette.border);
            canvas.drawRoundRect(rect, 17f, 17f, stroke);
        }
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(20f);
        text.setFakeBoldText(true);
        text.setColor(primary ? palette.accentText : palette.text);
        drawMediaControlGlyph(canvas, rect, label, text.getColor());
        text.setTextAlign(Paint.Align.LEFT);
    }

    private static void drawMediaControlGlyph(Canvas canvas, RectF rect, String label, int color) {
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(color);
        float size = Math.min(rect.width(), rect.height());
        float cx = rect.centerX();
        float cy = rect.centerY();
        String safe = label == null ? "" : label.toLowerCase(Locale.ROOT);

        if (safe.contains("pause")) {
            float barWidth = size * 0.105f;
            float barHeight = size * 0.31f;
            float gap = size * 0.085f;
            canvas.drawRoundRect(new RectF(cx - gap - barWidth, cy - barHeight, cx - gap, cy + barHeight), size * 0.025f, size * 0.025f, fill);
            canvas.drawRoundRect(new RectF(cx + gap, cy - barHeight, cx + gap + barWidth, cy + barHeight), size * 0.025f, size * 0.025f, fill);
            return;
        }
        if (safe.contains("play")) {
            float h = size * 0.30f;
            Path play = new Path();
            play.moveTo(cx - size * 0.105f, cy - h);
            play.lineTo(cx - size * 0.105f, cy + h);
            play.lineTo(cx + size * 0.22f, cy);
            play.close();
            canvas.drawPath(play, fill);
            return;
        }

        boolean previous = safe.contains("prev");
        float sign = previous ? -1f : 1f;
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(size * 0.052f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor(color);
        float barX = cx + sign * size * 0.23f;
        float h = size * 0.235f;
        canvas.drawLine(barX, cy - h, barX, cy + h, line);

        Path triA = new Path();
        triA.moveTo(cx - sign * size * 0.08f, cy - h);
        triA.lineTo(cx - sign * size * 0.08f, cy + h);
        triA.lineTo(cx + sign * size * 0.14f, cy);
        triA.close();
        Path triB = new Path();
        triB.moveTo(cx - sign * size * 0.31f, cy - h);
        triB.lineTo(cx - sign * size * 0.31f, cy + h);
        triB.lineTo(cx - sign * size * 0.08f, cy);
        triB.close();
        canvas.drawPath(triA, fill);
        canvas.drawPath(triB, fill);
    }

    private static void drawWidgetCardSkeleton(Canvas canvas, RectF card, ThemePalette palette) {
        Paint shimmer = new Paint(Paint.ANTI_ALIAS_FLAG);
        shimmer.setColor(adjustAlpha(palette.muted, palette.light ? 34 : 48));
        float left = card.left + 116f;
        float right = card.right - 150f;
        float top = Math.min(card.top + 112f, card.bottom - 56f);
        canvas.drawRoundRect(new RectF(left, top, right, top + 16f), 8f, 8f, shimmer);
        if (card.height() > 190f) {
            canvas.drawRoundRect(new RectF(left, top + 34f, right - 120f, top + 48f), 7f, 7f, shimmer);
        }
        if (card.height() > 240f) {
            canvas.drawRoundRect(new RectF(left, top + 70f, right - 42f, top + 84f), 7f, 7f, shimmer);
        }
    }

    private static RectF mediaPreviousRect(RectF card) {
        if (card.height() > 600f) {
            return new RectF(card.left + 174f, card.bottom - 112f, card.left + 262f, card.bottom - 24f);
        }
        if (card.height() > 360f) {
            float artBottom = card.bottom - 138f;
            return new RectF(card.left + 188f, artBottom - 100f, card.left + 348f, artBottom - 28f);
        }
        return new RectF(card.left + 174f, card.bottom - 76f, card.left + 302f, card.bottom - 24f);
    }

    private static RectF mediaPlayPauseRect(RectF card) {
        if (card.height() > 600f) {
            return new RectF(card.centerX() - 74f, card.bottom - 148f, card.centerX() + 74f, card.bottom - 12f);
        }
        if (card.height() > 360f) {
            float artBottom = card.bottom - 138f;
            return new RectF(card.centerX() - 104f, artBottom - 108f, card.centerX() + 104f, artBottom - 20f);
        }
        return new RectF(card.centerX() - 92f, card.bottom - 84f, card.centerX() + 92f, card.bottom - 16f);
    }

    private static RectF mediaNextRect(RectF card) {
        if (card.height() > 600f) {
            return new RectF(card.right - 262f, card.bottom - 112f, card.right - 174f, card.bottom - 24f);
        }
        if (card.height() > 360f) {
            float artBottom = card.bottom - 138f;
            return new RectF(card.right - 348f, artBottom - 100f, card.right - 188f, artBottom - 28f);
        }
        return new RectF(card.right - 302f, card.bottom - 76f, card.right - 174f, card.bottom - 24f);
    }

    private static RectF compactMediaRailRect(RectF card) {
        return new RectF(card.left + 28f, card.bottom - 104f, card.right - 28f, card.bottom - 20f);
    }

    private static RectF mediaDeviceRect(RectF card) {
        return new RectF(card.right - 200f, card.top + 26f, card.right - 28f, card.top + 90f);
    }

    private static RectF mediaMuteRect(RectF card) {
        return new RectF(card.right - 288f, card.top + 26f, card.right - 224f, card.top + 90f);
    }

    private static RectF mediaFavoriteRect(RectF card) {
        return new RectF(card.left + 36f, card.bottom - 112f, card.left + 124f, card.bottom - 24f);
    }

    private static RectF mediaTranscriptRect(RectF card) {
        return new RectF(card.left + 312f, card.bottom - 112f, card.left + 400f, card.bottom - 24f);
    }

    private static RectF mediaRepeatRect(RectF card) {
        return new RectF(card.right - 400f, card.bottom - 112f, card.right - 312f, card.bottom - 24f);
    }

    private static RectF mediaQueueRect(RectF card) {
        return new RectF(card.right - 124f, card.bottom - 112f, card.right - 36f, card.bottom - 24f);
    }

    private static RectF mediaCurrentCoverRect(RectF card) {
        return new RectF(card.centerX() - 124f, card.top + 118f, card.centerX() + 124f, card.top + 366f);
    }

    private static RectF mediaPreviousPreviewRect(RectF card) {
        return new RectF(card.left + 76f, card.top + 204f, card.left + 232f, card.top + 362f);
    }

    private static RectF mediaNextPreviewRect(RectF card) {
        return new RectF(card.right - 232f, card.top + 204f, card.right - 76f, card.top + 362f);
    }

    private static RectF mediaProgressRect(RectF card) {
        return new RectF(card.left + 36f, card.top + 506f, card.right - 36f, card.top + 516f);
    }

    private static RectF mediaProgressHitRect(RectF card) {
        RectF track = mediaProgressRect(card);
        return new RectF(track.left, track.top - 64f, track.right, track.bottom + 54f);
    }

    private static void drawInlineNotificationCard(Context context, Canvas canvas, NotificationInfo notification, RectF card, boolean light) {
        ThemePalette palette = ThemePalette.from(context, null, System.currentTimeMillis());
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surface);
        canvas.drawRoundRect(card, 24f, 24f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(card, 24f, 24f, stroke);

        RectF iconRect = new RectF(card.left + 22f, card.top + 22f, card.left + 94f, card.top + 94f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 18f, 18f, iconBg);
        Bitmap icon = notification.icon(context, 58);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 7f, iconRect.top + 7f, iconRect.right - 7f, iconRect.bottom - 7f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(25f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, notification.titleText(context), card.left + 116f, card.top + 42f, title, card.width() - 152f);

        Paint subtitle = new Paint(Paint.ANTI_ALIAS_FLAG);
        subtitle.setColor(palette.muted);
        subtitle.setTextSize(21f);
        drawTextLimited(canvas, notification.text, card.left + 116f, card.top + 77f, subtitle, card.width() - 152f);

        RectF read = inlineNotificationReadRect(card);
        RectF open = inlineNotificationOpenRect(card);
        RectF reply = inlineNotificationReplyRect(card);
        drawInlineButton(canvas, read, "Baca", palette, false);
        drawInlineButton(canvas, open, "Buka", palette, false);
        drawInlineButton(canvas, reply, notification.replyable ? "Balas" : "Detail", palette, true);
    }

    private static void drawInlineButton(Canvas canvas, RectF rect, String label, ThemePalette palette, boolean primary) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(primary ? palette.accent : palette.surfaceAlt);
        canvas.drawRoundRect(rect, 16f, 16f, bg);
        if (!primary) {
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(1.3f);
            stroke.setColor(palette.border);
            canvas.drawRoundRect(rect, 16f, 16f, stroke);
        }
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(23f);
        text.setFakeBoldText(true);
        text.setColor(primary ? palette.accentText : palette.text);
        canvas.drawText(label, rect.centerX(), rect.centerY() + 8f, text);
        text.setTextAlign(Paint.Align.LEFT);
    }

    private static RectF inlineNotificationReadRect(RectF card) {
        return new RectF(card.left + 116f, card.bottom - 72f, card.left + 310f, card.bottom - 18f);
    }

    private static RectF inlineNotificationOpenRect(RectF card) {
        return new RectF(card.left + 326f, card.bottom - 72f, card.left + 520f, card.bottom - 18f);
    }

    private static RectF inlineNotificationReplyRect(RectF card) {
        return new RectF(card.right - 244f, card.bottom - 72f, card.right - 22f, card.bottom - 18f);
    }

    private static RectF topNotificationReplyRect(RectF card) {
        return new RectF(card.right - 184f, card.bottom - 66f, card.right - 24f, card.bottom - 18f);
    }

    private static void drawCloudIcon(Canvas canvas, float cx, float cy, Paint paint) {
        Path cloud = new Path();
        cloud.moveTo(cx - 27f, cy + 11f);
        cloud.lineTo(cx + 25f, cy + 11f);
        cloud.cubicTo(cx + 43f, cy + 11f, cx + 43f, cy - 15f, cx + 24f, cy - 14f);
        cloud.cubicTo(cx + 18f, cy - 38f, cx - 18f, cy - 34f, cx - 19f, cy - 9f);
        cloud.cubicTo(cx - 41f, cy - 13f, cx - 46f, cy + 11f, cx - 27f, cy + 11f);
        canvas.drawPath(cloud, paint);
    }

    private static void drawWidgetGlyph(Canvas canvas, float cx, float cy, String kind, int color) {
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(4.2f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setColor(color);
        if ("calendar".equals(kind)) {
            RectF rect = new RectF(cx - 20f, cy - 18f, cx + 20f, cy + 20f);
            canvas.drawRoundRect(rect, 6f, 6f, line);
            canvas.drawLine(rect.left, cy - 5f, rect.right, cy - 5f, line);
            return;
        }
        if ("music".equals(kind) || "media".equals(kind)) {
            canvas.drawLine(cx + 12f, cy - 20f, cx + 12f, cy + 12f, line);
            canvas.drawLine(cx + 12f, cy - 20f, cx - 12f, cy - 14f, line);
            canvas.drawCircle(cx - 14f, cy + 14f, 7f, line);
            return;
        }
        if ("weather".equals(kind)) {
            drawCloudIcon(canvas, cx, cy + 2f, line);
            return;
        }
        canvas.drawRoundRect(new RectF(cx - 20f, cy - 20f, cx + 20f, cy + 20f), 8f, 8f, line);
    }

    private static void drawContentCard(Context context, Canvas canvas, Snapshot snapshot, long now, ThemePalette palette) {
        boolean light = palette.light;
        RectF card = new RectF(42f, 382f + CONTENT_SHIFT, BASE_WIDTH - 42f, 1214f + CONTENT_SHIFT);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(palette.surface);
        canvas.drawRoundRect(card, 28f, 28f, cardPaint);
        Paint cardStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardStroke.setStyle(Paint.Style.STROKE);
        cardStroke.setStrokeWidth(1.8f);
        cardStroke.setColor(palette.border);
        canvas.drawRoundRect(card, 28f, 28f, cardStroke);

        int slot = snapshot.activeSlot(now);
        if (slot == 2 && TextUtils.isEmpty(snapshot.image2)) slot = 1;
        if (slot == 1 && TextUtils.isEmpty(snapshot.image1) && !TextUtils.isEmpty(snapshot.image2)) slot = 2;

        RectF tab1 = snapshot1TabBaseRect();
        RectF tab2 = snapshot2TabBaseRect();
        drawSnapshotTab(canvas, tab1, "Snapshot 1", slot == 1, palette);
        drawSnapshotTab(canvas, tab2, "Snapshot 2", slot == 2, palette);

        RectF imageRect = new RectF(70f, 508f + CONTENT_SHIFT, BASE_WIDTH - 70f, 1040f + CONTENT_SHIFT);
        DrawInfo imageInfo = drawCameraFrame(context, canvas, snapshot, imageRect, slot);
        drawAiCanvas(canvas, snapshot, imageInfo, imageRect, now, slot, light);

        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setColor(light ? 0xFF64748B : 0xFF7A8088);
        label.setTextSize(21f);
        label.setFakeBoldText(true);
        canvas.drawText("STATUS OBJEK", 78f, 1100f + CONTENT_SHIFT, label);

        List<Detection> detections = snapshot.detectionsForSlot(slot);
        String state = snapshot.analysisStateForSlot(slot);
        String statusText;
        int statusColor;
        if (!detections.isEmpty()) {
            statusText = detections.size() + " objek terkonfirmasi";
            statusColor = light ? 0xFF047857 : 0xFF9FE1CB;
        } else if ("done".equalsIgnoreCase(state)) {
            statusText = "Belum ada objek yang cukup yakin";
            statusColor = light ? 0xFF475569 : 0xFFB8C0CB;
        } else if ("error".equalsIgnoreCase(state)) {
            statusText = "Analisis akan dicoba kembali";
            statusColor = light ? 0xFFB91C1C : 0xFFFCA5A5;
        } else {
            statusText = "Mencari objek";
            statusColor = light ? 0xFFB45309 : 0xFFFAC775;
        }
        Paint statusPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        statusPaint.setColor(statusColor);
        statusPaint.setTextSize(29f);
        statusPaint.setFakeBoldText(true);
        drawTextLimited(canvas, statusText, 78f, 1144f + CONTENT_SHIFT, statusPaint, 610f);

        RectF action = detailBaseRect();
        Paint actionPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        actionPaint.setColor(palette.accent);
        canvas.drawRoundRect(action, 16f, 16f, actionPaint);
        Paint actionText = new Paint(Paint.ANTI_ALIAS_FLAG);
        actionText.setColor(palette.accentText);
        actionText.setTextSize(25f);
        actionText.setFakeBoldText(true);
        actionText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("Lihat rincian", action.centerX(), action.centerY() + 9f, actionText);
    }

    private static void drawSnapshotTab(Canvas canvas, RectF rect, String label, boolean active, ThemePalette palette) {
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setColor(active ? palette.accent : 0x00000000);
        canvas.drawRoundRect(rect, 16f, 16f, background);
        if (!active) {
            Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
            border.setStyle(Paint.Style.STROKE);
            border.setStrokeWidth(2f);
            border.setColor(palette.border);
            canvas.drawRoundRect(rect, 16f, 16f, border);
        }
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(active ? palette.accentText : palette.muted);
        text.setTextSize(25f);
        text.setFakeBoldText(true);
        text.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(label, rect.centerX(), rect.centerY() + 9f, text);
    }

    static RectF snapshot1TabBaseRect() {
        return new RectF(70f, 410f + CONTENT_SHIFT, 522f, 480f + CONTENT_SHIFT);
    }

    static RectF snapshot2TabBaseRect() {
        return new RectF(538f, 410f + CONTENT_SHIFT, BASE_WIDTH - 70f, 480f + CONTENT_SHIFT);
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

    private static DrawInfo drawBitmapInside(Canvas canvas, Bitmap image, RectF rect) {
        if (image == null || image.isRecycled() || image.getWidth() <= 0 || image.getHeight() <= 0) {
            return new DrawInfo(rect, 0, 0);
        }
        float scale = Math.min(rect.width() / image.getWidth(), rect.height() / image.getHeight());
        float drawWidth = image.getWidth() * scale;
        float drawHeight = image.getHeight() * scale;
        float left = rect.left + (rect.width() - drawWidth) / 2f;
        float top = rect.top + (rect.height() - drawHeight) / 2f;
        RectF dst = new RectF(left, top, left + drawWidth, top + drawHeight);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.drawBitmap(image, null, dst, paint);
        return new DrawInfo(dst, image.getWidth(), image.getHeight());
    }

    private static Bitmap loadAppIconBitmap(Context context, String packageName, int size) {
        if (context == null || TextUtils.isEmpty(packageName) || size <= 0) return null;
        try {
            Drawable drawable = context.getPackageManager().getApplicationIcon(packageName);
            if (drawable instanceof BitmapDrawable) {
                Bitmap source = ((BitmapDrawable) drawable).getBitmap();
                if (source != null && !source.isRecycled()) {
                    return Bitmap.createScaledBitmap(source, size, size, true);
                }
            }
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas iconCanvas = new Canvas(output);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(iconCanvas);
            return output;
        } catch (PackageManager.NameNotFoundException ignored) {
            return null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static void drawAiCanvas(Canvas canvas, Snapshot snapshot, DrawInfo drawInfo, RectF imageRect, long now, int slot, boolean light) {
        boolean scanning = snapshot.analysisRunningForSlot(slot);
        List<Detection> detections = snapshot.detectionsForSlot(slot);
        Detection primary = snapshot.primaryDetection(detections);
        if (scanning) {
            drawSearchReticle(canvas, imageRect, now);
        }
        if (primary != null) {
            drawDetections(canvas, detections, snapshot.frameWidthForSlot(slot), snapshot.frameHeightForSlot(slot), drawInfo, imageRect);
            drawObjectLock(canvas, primary, snapshot.frameWidthForSlot(slot), snapshot.frameHeightForSlot(slot), drawInfo, imageRect, now);
        }

        Paint chipBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipBg.setColor(light ? 0xDDF8FAFC : 0xCC0B1120);
        RectF chip = new RectF(imageRect.left + 20f, imageRect.bottom - 70f, imageRect.left + 496f, imageRect.bottom - 20f);
        canvas.drawRoundRect(chip, 25f, 25f, chipBg);
        Paint chipText = new Paint(Paint.ANTI_ALIAS_FLAG);
        chipText.setColor(light ? 0xFF0F172A : 0xFFD7FFF0);
        chipText.setTextSize(24f);
        chipText.setFakeBoldText(true);
        String chipLabel;
        if (primary != null) {
            chipLabel = detections.size() + " objek ditemukan";
        } else if (snapshot.analysisCompleteForSlot(slot)) {
            chipLabel = "Belum ada objek yang cukup yakin";
        } else if ("error".equalsIgnoreCase(snapshot.analysisStateForSlot(slot))) {
            chipLabel = "Analisis diulang";
        } else {
            chipLabel = "Mencari objek";
        }
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
            drawDetectionLabel(canvas, detection, box, color, imageRect);
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

    private static void drawDetectionLabel(Canvas canvas, Detection detection, RectF box, int color, RectF imageRect) {
        String label = detection.displayName() + " " + Math.round(detection.confidence * 100d) + "%";
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(23f);
        text.setFakeBoldText(true);
        float width = Math.min(330f, text.measureText(label) + 28f);
        float top = box.top - 39f;
        if (top < imageRect.top + 6f) top = box.top + 6f;
        float left = Math.min(Math.max(imageRect.left + 6f, box.left), imageRect.right - width - 6f);
        RectF bg = new RectF(left, top, left + width, top + 39f);
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
        canvas.drawText("STATUS OBJEK", panel.left + 28f, panel.top + 151f, label);
        String status = snapshot.detectionCount() > 0
            ? snapshot.detectionCount() + " objek terdeteksi"
            : "Memindai objek";
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
        meta.setColor(snapshot.online(now) ? boostAccent(lastDynamicAccent, false) : 0xFFFCA5A5);
        meta.setTextSize(22f);
        drawTextLimited(canvas, snapshot.timeText(), panel.left + 28f, panel.bottom - 28f, meta, panel.width() - 56f);
    }

    static RectF detailBaseRect() {
        return new RectF(BASE_WIDTH - 322f, 1070f + CONTENT_SHIFT, BASE_WIDTH - 78f, 1152f + CONTENT_SHIFT);
    }

    static RectF detailCloseBaseRect() {
        return new RectF(BASE_WIDTH - 118f, 468f, BASE_WIDTH - 48f, 538f);
    }

    static RectF notificationBaseRect() {
        return new RectF(42f, 302f, BASE_WIDTH - 42f, 392f);
    }

    static RectF notificationTouchBaseRect() {
        return new RectF(42f, 290f, BASE_WIDTH - 42f, 410f);
    }

    static RectF notificationDetailCloseBaseRect() {
        return new RectF(BASE_WIDTH - 118f, 438f, BASE_WIDTH - 48f, 508f);
    }

    static boolean hasNotifications(Context context) {
        return !NotificationInfo.loadAll(context).isEmpty();
    }

    static boolean hasFullWidget(Context context) {
        for (DynamicWidgetInfo widget : DynamicWidgetInfo.enabledForLockScreen(context)) {
            if (widget.full) return true;
        }
        return !DynamicWidgetInfo.enabledForLockScreen(context).isEmpty();
    }

    static int fullWidgetCount(Context context) {
        int count = 0;
        for (DynamicWidgetInfo widget : DynamicWidgetInfo.enabledForLockScreen(context)) {
            if (widget.full) count++;
        }
        if (count > 0) return count;
        return DynamicWidgetInfo.enabledForLockScreen(context).isEmpty() ? 0 : 1;
    }

    static void drawFullWidgetPage(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        int width,
        int height,
        long now,
        float progress
    ) {
        drawFullWidgetPage(context, canvas, snapshot, width, height, now, progress, 0);
    }

    static void drawFullWidgetPage(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        int width,
        int height,
        long now,
        float progress,
        int fullIndex
    ) {
        float pageProgress = clamp01(progress);
        if (pageProgress <= 0f) return;
        ThemePalette palette = ThemePalette.from(context, snapshot == null ? Snapshot.fallback() : snapshot, now);
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        if (widgets.isEmpty()) return;
        List<DynamicWidgetInfo> fullWidgets = new ArrayList<>();
        for (DynamicWidgetInfo widget : widgets) {
            if (shouldSuppressProviderBehindMedia(widgets, widget)) continue;
            if (widget.full) fullWidgets.add(widget);
        }
        if (fullWidgets.isEmpty()) {
            for (DynamicWidgetInfo widget : widgets) {
                if (shouldSuppressProviderBehindMedia(widgets, widget)) continue;
                fullWidgets.add(widget);
            }
        }
        int safeIndex = Math.max(0, Math.min(fullIndex, fullWidgets.size() - 1));
        DynamicWidgetInfo selected = fullWidgets.get(safeIndex);
        boolean hostedReady = selected.providerComponent != null && isHostedWidgetReady(context, selected.id);
        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        canvas.translate(-BASE_WIDTH * (1f - pageProgress), 0f);
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setShader(new LinearGradient(0f, 0f, 0f, BASE_HEIGHT, palette.backgroundTop, palette.backgroundBottom, Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, background);

        RectF preview = hostedFullWidgetPreviewBaseRect(selected);
        RectF hero = new RectF(preview.left, preview.top, preview.right, preview.bottom);
        Paint card = new Paint(Paint.ANTI_ALIAS_FLAG);
        card.setColor(palette.surface);
        canvas.drawRoundRect(hero, 34f, 34f, card);
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(1.8f);
        border.setColor(palette.border);
        canvas.drawRoundRect(hero, 34f, 34f, border);

        Bitmap art = selected.artwork != null && !selected.artwork.isRecycled() ? selected.artwork : null;
        Paint previewBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        previewBg.setColor(palette.light ? 0xFFF3F7F1 : 0xFF07100B);
        canvas.drawRoundRect(preview, 28f, 28f, previewBg);
        if (hostedReady) {
            Paint ready = new Paint(Paint.ANTI_ALIAS_FLAG);
            ready.setColor(palette.light ? 0x0FFFFFFF : 0x18000000);
            canvas.drawRoundRect(preview, 28f, 28f, ready);
        } else if (art != null && !art.isRecycled()) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(preview, 28f, 28f, Path.Direction.CW);
            canvas.clipPath(clip);
            drawBitmapCover(canvas, art, preview);
            Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
            veil.setColor(palette.light ? 0x33FFFFFF : 0x66000000);
            canvas.drawRect(preview, veil);
            canvas.restore();
        } else {
            drawLargeWidgetPreview(context, canvas, selected, preview, palette);
        }
        if (!hostedReady) {
            drawWidgetPreview(context, canvas, selected, new RectF(preview.left + 36f, preview.bottom - 130f, preview.left + 260f, preview.bottom - 36f), WIDGET_VIEW_LIST, palette);
        }

        if (fullWidgets.size() > 1) {
            Paint pageText = new Paint(Paint.ANTI_ALIAS_FLAG);
            pageText.setColor(palette.muted);
            pageText.setTextSize(24f);
            pageText.setTextAlign(Paint.Align.CENTER);
            canvas.drawText((safeIndex + 1) + "/" + fullWidgets.size(), BASE_WIDTH / 2f, preview.bottom + 54f, pageText);
            pageText.setTextAlign(Paint.Align.LEFT);
        }
        canvas.restore();
    }

    static void drawNotificationDetails(
        Context context,
        Canvas canvas,
        int width,
        int height,
        float progress
    ) {
        float sheetProgress = clamp01(progress);
        if (sheetProgress <= 0f) return;
        if (width >= 0) {
            drawLockSettingsSheet(context, canvas, width, height, sheetProgress, 0f, 0L);
            return;
        }
        List<NotificationInfo> notifications = NotificationInfo.loadReplyable(context);
        if (notifications.isEmpty()) return;
        boolean light = useLightTheme(context);

        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setColor(adjustAlpha(0xFF000000, Math.round(136f * sheetProgress)));
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, shade);

        RectF card = new RectF(0f, 390f, BASE_WIDTH, BASE_HEIGHT + 40f);
        float hiddenOffset = (BASE_HEIGHT - card.top + 40f) * (1f - sheetProgress);
        canvas.translate(0f, hiddenOffset);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(light ? 0xFFF8FAFC : 0xFF15181C);
        canvas.drawRoundRect(card, 44f, 44f, cardPaint);

        Paint handle = new Paint(Paint.ANTI_ALIAS_FLAG);
        handle.setColor(light ? 0x66344054 : 0x55FFFFFF);
        canvas.drawRoundRect(new RectF(BASE_WIDTH / 2f - 58f, 410f, BASE_WIDTH / 2f + 58f, 420f), 6f, 6f, handle);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(light ? 0xFF0F172A : Color.WHITE);
        title.setTextSize(39f);
        title.setFakeBoldText(true);
        canvas.drawText("Detail Notifikasi", 48f, 494f, title);

        RectF close = notificationDetailCloseBaseRect();
        Paint closePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        closePaint.setColor(light ? 0xFFE8EEF7 : 0x22FFFFFF);
        float xScale = width / (float) BASE_WIDTH;
        float yScale = height / (float) BASE_HEIGHT;
        float shapeYCompensation = yScale == 0f ? 1f : xScale / yScale;
        canvas.save();
        canvas.scale(1f, shapeYCompensation, close.centerX(), close.centerY());
        canvas.drawOval(close, closePaint);
        Paint closeText = new Paint(Paint.ANTI_ALIAS_FLAG);
        closeText.setColor(light ? 0xFF344054 : 0xFFB9C0CA);
        closeText.setTextSize(42f);
        closeText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("×", close.centerX(), close.centerY() + 14f, closeText);
        closeText.setTextAlign(Paint.Align.LEFT);
        canvas.restore();

        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(light ? 0x202A3442 : 0x22FFFFFF);
        divider.setStrokeWidth(2f);
        canvas.drawLine(48f, 536f, BASE_WIDTH - 48f, 536f, divider);

        Paint iconPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(light ? 0xFF526071 : 0xFFB9C4D3);
        body.setTextSize(23f);
        Paint app = new Paint(Paint.ANTI_ALIAS_FLAG);
        app.setColor(light ? 0xFF0F172A : Color.WHITE);
        app.setTextSize(29f);
        app.setFakeBoldText(true);
        Paint time = new Paint(Paint.ANTI_ALIAS_FLAG);
        time.setColor(light ? 0xFF687386 : 0xFF8EA1B8);
        time.setTextSize(22f);

        float top = 572f;
        int shown = 0;
        for (NotificationInfo notification : notifications) {
            if (shown >= 6) break;
            RectF row = new RectF(48f, top, BASE_WIDTH - 48f, top + 126f);
            Paint rowBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            rowBg.setColor(light ? 0xFFFFFFFF : 0xFF1A1E23);
            canvas.drawRoundRect(row, 22f, 22f, rowBg);

            RectF iconRect = new RectF(row.left + 18f, row.top + 24f, row.left + 96f, row.top + 102f);
            Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            iconBg.setColor(light ? 0x1F2563EB : 0x2438BDF8);
            canvas.drawRoundRect(iconRect, 20f, 20f, iconBg);
            Bitmap icon = notification.icon(context, 60);
            if (icon != null) {
                canvas.drawBitmap(icon, null, new RectF(iconRect.left + 9f, iconRect.top + 9f, iconRect.right - 9f, iconRect.bottom - 9f), iconPaint);
            } else {
                drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), light ? 0xFF2563EB : 0xFFD7FFF0);
            }

            float textLeft = row.left + 122f;
            drawTextLimited(canvas, notification.appName(context, "Notifikasi"), textLeft, row.top + 43f, app, row.width() - 272f);
            String secondary = notification.detailLine(context);
            drawTextLimited(canvas, secondary, textLeft, row.top + 78f, body, row.width() - 272f);
            canvas.drawText(notification.timeText(), textLeft, row.top + 108f, time);
            top += 142f;
            shown++;
        }
        canvas.restore();
    }

    static void drawNotificationDetails(
        Context context,
        Canvas canvas,
        int width,
        int height,
        float progress,
        float scrollY
    ) {
        drawNotificationDetails(context, canvas, width, height, progress, scrollY, 0L);
    }

    static void drawNotificationDetails(
        Context context,
        Canvas canvas,
        int width,
        int height,
        float progress,
        float scrollY,
        long openedAt
    ) {
        float sheetProgress = clamp01(progress);
        if (sheetProgress <= 0f) return;
        drawLockSettingsSheet(context, canvas, width, height, sheetProgress, Math.max(0f, scrollY), openedAt);
    }

    static void drawSettingsSheet(
        Context context,
        Canvas canvas,
        int width,
        int height,
        float progress,
        float scrollY,
        long openedAt
    ) {
        float sheetProgress = clamp01(progress);
        if (sheetProgress <= 0f) return;
        drawLockSettingsSheet(context, canvas, width, height, sheetProgress, Math.max(0f, scrollY), openedAt);
    }

    static void drawNotificationListDetails(
        Context context,
        Canvas canvas,
        int width,
        int height,
        float progress,
        float scrollY
    ) {
        float sheetProgress = clamp01(progress);
        if (sheetProgress <= 0f) return;
        List<NotificationInfo> notifications = NotificationInfo.loadAll(context);
        if (notifications.isEmpty()) return;
        ThemePalette palette = ThemePalette.from(context, null, System.currentTimeMillis());

        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setColor(adjustAlpha(0xFF000000, Math.round(136f * sheetProgress)));
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, shade);

        RectF card = new RectF(0f, 390f, BASE_WIDTH, BASE_HEIGHT + 40f);
        float hiddenOffset = (BASE_HEIGHT - card.top + 40f) * (1f - sheetProgress);
        canvas.translate(0f, hiddenOffset);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(palette.surface);
        canvas.drawRoundRect(card, 44f, 44f, cardPaint);

        Paint handle = new Paint(Paint.ANTI_ALIAS_FLAG);
        handle.setColor(adjustAlpha(palette.muted, 92));
        canvas.drawRoundRect(new RectF(BASE_WIDTH / 2f - 58f, 410f, BASE_WIDTH / 2f + 58f, 420f), 6f, 6f, handle);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(39f);
        title.setFakeBoldText(true);
        canvas.drawText("Detail Notifikasi", 48f, 494f, title);

        RectF close = notificationDetailCloseBaseRect();
        Paint closePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        closePaint.setColor(palette.surfaceAlt);
        float xScale = width / (float) BASE_WIDTH;
        float yScale = height / (float) BASE_HEIGHT;
        float shapeYCompensation = yScale == 0f ? 1f : xScale / yScale;
        canvas.save();
        canvas.scale(1f, shapeYCompensation, close.centerX(), close.centerY());
        canvas.drawOval(close, closePaint);
        Paint closeText = new Paint(Paint.ANTI_ALIAS_FLAG);
        closeText.setColor(palette.muted);
        closeText.setTextSize(42f);
        closeText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("x", close.centerX(), close.centerY() + 14f, closeText);
        closeText.setTextAlign(Paint.Align.LEFT);
        canvas.restore();

        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(palette.border);
        divider.setStrokeWidth(2f);
        canvas.drawLine(48f, 536f, BASE_WIDTH - 48f, 536f, divider);

        float boundedScroll = Math.min(Math.max(0f, scrollY), notificationListMaxScroll(context));
        canvas.save();
        canvas.clipRect(0f, 548f, BASE_WIDTH, BASE_HEIGHT + 40f);
        canvas.translate(0f, -boundedScroll);

        Paint iconPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(palette.muted);
        body.setTextSize(23f);
        Paint app = new Paint(Paint.ANTI_ALIAS_FLAG);
        app.setColor(palette.text);
        app.setTextSize(29f);
        app.setFakeBoldText(true);
        Paint time = new Paint(Paint.ANTI_ALIAS_FLAG);
        time.setColor(adjustAlpha(palette.muted, 210));
        time.setTextSize(22f);

        float top = 572f;
        float minVisible = boundedScroll + 548f - 160f;
        float maxVisible = boundedScroll + BASE_HEIGHT + 160f;
        for (NotificationInfo notification : notifications) {
            if (top + 126f < minVisible || top > maxVisible) {
                top += 142f;
                continue;
            }
            RectF row = new RectF(48f, top, BASE_WIDTH - 48f, top + 126f);
            Paint rowBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            rowBg.setColor(palette.surfaceAlt);
            canvas.drawRoundRect(row, 22f, 22f, rowBg);

            RectF iconRect = new RectF(row.left + 18f, row.top + 24f, row.left + 96f, row.top + 102f);
            Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            iconBg.setColor(palette.accentSoft);
            canvas.drawRoundRect(iconRect, 20f, 20f, iconBg);
            Bitmap icon = notification.icon(context, 60);
            if (icon != null) {
                canvas.drawBitmap(icon, null, new RectF(iconRect.left + 9f, iconRect.top + 9f, iconRect.right - 9f, iconRect.bottom - 9f), iconPaint);
            } else {
                drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), palette.accent);
            }

            float textLeft = row.left + 122f;
            drawTextLimited(canvas, notification.appName(context, "Notifikasi"), textLeft, row.top + 43f, app, row.width() - 272f);
            String secondary = notification.detailLine(context);
            drawTextLimited(canvas, secondary, textLeft, row.top + 78f, body, row.width() - 272f);
            canvas.drawText(notification.timeText(), textLeft, row.top + 108f, time);
            top += 142f;
        }
        canvas.restore();
        canvas.restore();
    }

    static float notificationListMaxScroll(Context context) {
        int count = NotificationInfo.loadAll(context).size();
        float contentBottom = 572f + Math.max(1, count) * 142f;
        return Math.max(0f, contentBottom - 1870f);
    }

    static float settingsMaxScroll(Context context) {
        List<DynamicWidgetInfo> widgets = settingsWidgets(context);
        int notificationCount = NotificationInfo.loadReplyable(context).size();
        List<RectF> widgetRects = settingsWidgetRects(widgets, widgetViewMode(context), SETTINGS_WIDGET_LIST_TOP);
        float rowTop = settingsWidgetsBottom(widgetRects, SETTINGS_WIDGET_LIST_TOP);
        float notifTop = rowTop + 68f;
        float contentBottom = notificationCount <= 0 ? notifTop + 86f : notifTop + notificationCount * SETTINGS_NOTIFICATION_ROW_STEP;
        return Math.max(0f, contentBottom - 1870f);
    }

    private static void drawLockSettingsSheet(Context context, Canvas canvas, int width, int height, float sheetProgress, float scrollY, long openedAt) {
        List<DynamicWidgetInfo> widgets = settingsWidgets(context);
        List<NotificationInfo> notifications = NotificationInfo.loadReplyable(context);
        ThemePalette palette = ThemePalette.from(context, null, System.currentTimeMillis());
        boolean light = palette.light;
        long age = openedAt <= 0L ? 3_000L : Math.max(0L, System.currentTimeMillis() - openedAt);

        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setColor(adjustAlpha(0xFF000000, Math.round(136f * sheetProgress)));
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, shade);

        RectF card = new RectF(0f, 390f, BASE_WIDTH, BASE_HEIGHT + 40f);
        float hiddenOffset = (BASE_HEIGHT - card.top + 40f) * (1f - sheetProgress);
        canvas.translate(0f, hiddenOffset);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(palette.surface);
        canvas.drawRoundRect(card, 42f, 42f, cardPaint);

        Paint handle = new Paint(Paint.ANTI_ALIAS_FLAG);
        handle.setColor(adjustAlpha(palette.muted, 92));
        canvas.drawRoundRect(new RectF(BASE_WIDTH / 2f - 58f, 410f, BASE_WIDTH / 2f + 58f, 420f), 6f, 6f, handle);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(37f);
        title.setFakeBoldText(true);
        canvas.drawText("Pengaturan layar kunci", 48f, 494f, title);

        RectF close = notificationDetailCloseBaseRect();
        Paint closePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        closePaint.setColor(palette.surfaceAlt);
        float xScale = width / (float) BASE_WIDTH;
        float yScale = height / (float) BASE_HEIGHT;
        float shapeYCompensation = yScale == 0f ? 1f : xScale / yScale;
        canvas.save();
        canvas.scale(1f, shapeYCompensation, close.centerX(), close.centerY());
        canvas.drawOval(close, closePaint);
        Paint closeText = new Paint(Paint.ANTI_ALIAS_FLAG);
        closeText.setColor(palette.muted);
        closeText.setTextSize(38f);
        closeText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("x", close.centerX(), close.centerY() + 13f, closeText);
        closeText.setTextAlign(Paint.Align.LEFT);
        canvas.restore();

        Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        label.setColor(palette.muted);
        label.setTextSize(23f);
        label.setFakeBoldText(true);
        canvas.drawText("Tema", 48f, 558f, label);

        RectF seg = new RectF(48f, 584f, BASE_WIDTH - 48f, 658f);
        Paint segBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        segBg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(seg, 18f, 18f, segBg);
        String mode = themeMode(context);
        drawThemeSegment(canvas, new RectF(48f, 584f, 376f, 658f), "Light", THEME_LIGHT.equals(mode), palette);
        drawThemeSegment(canvas, new RectF(376f, 584f, 704f, 658f), "Dark", THEME_DARK.equals(mode), palette);
        drawThemeSegment(canvas, new RectF(704f, 584f, BASE_WIDTH - 48f, 658f), "Auto", THEME_AUTO.equals(mode), palette);

        drawWidgetSearchControls(context, canvas, palette);

        canvas.drawText("Widget layar kunci", 48f, 824f, label);

        canvas.save();
        canvas.clipRect(0f, SETTINGS_SCROLL_TOP, BASE_WIDTH, BASE_HEIGHT + 40f);
        float boundedScroll = Math.min(Math.max(0f, scrollY), settingsMaxScroll(context));
        float minVisible = boundedScroll + SETTINGS_SCROLL_TOP - 180f;
        float maxVisible = boundedScroll + BASE_HEIGHT + 180f;
        canvas.translate(0f, -boundedScroll);

        String viewMode = widgetViewMode(context);
        List<RectF> widgetRects = settingsWidgetRects(widgets, viewMode, SETTINGS_WIDGET_LIST_TOP);
        if (widgets.isEmpty()) {
            String query = widgetSearchQuery(context);
            drawSheetEmpty(canvas, TextUtils.isEmpty(query) ? "Belum ada widget aplikasi yang ditemukan" : "Tidak ada widget untuk pencarian ini", 48f, SETTINGS_WIDGET_LIST_TOP, palette);
        } else {
            int visibleWidgets = stagedCount(widgets.size(), age, 5, 90L);
            for (int i = 0; i < widgets.size(); i++) {
                RectF item = widgetRects.get(i);
                boolean rowVisible = item.bottom >= minVisible && item.top <= maxVisible;
                if (rowVisible && i < visibleWidgets) {
                    drawSettingsWidgetItem(context, canvas, widgets.get(i), item, viewMode, palette);
                } else if (rowVisible && i < visibleWidgets + 4) {
                    drawSettingsWidgetSkeleton(canvas, item, viewMode, palette);
                }
            }
        }

        float rowTop = settingsWidgetsBottom(widgetRects, SETTINGS_WIDGET_LIST_TOP);
        float notifTop = rowTop + 68f;
        canvas.drawText("Notifikasi yang dapat dibalas", 48f, notifTop - 24f, label);
        if (notifications.isEmpty()) {
            drawSheetEmpty(canvas, "Belum ada notifikasi aktif dari aplikasi pesan", 48f, notifTop, palette);
        } else {
            int visibleNotifications = stagedCount(notifications.size(), Math.max(0L, age - 260L), 2, 120L);
            for (int i = 0; i < notifications.size(); i++) {
                boolean rowVisible = notifTop + 126f >= minVisible && notifTop <= maxVisible;
                if (rowVisible && i < visibleNotifications) {
                    drawSettingsNotificationRow(context, canvas, notifications.get(i), notifTop, palette);
                } else if (rowVisible && i < visibleNotifications + 2) {
                    drawSheetSkeletonRow(canvas, notifTop, 126f, palette);
                }
                notifTop += SETTINGS_NOTIFICATION_ROW_STEP;
            }
        }
        canvas.restore();
        canvas.restore();
    }

    private static void drawThemeSegment(Canvas canvas, RectF rect, String label, boolean active, ThemePalette palette) {
        if (active) {
            Paint activeBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            activeBg.setColor(palette.accent);
            canvas.drawRoundRect(new RectF(rect.left + 4f, rect.top + 4f, rect.right - 4f, rect.bottom - 4f), 15f, 15f, activeBg);
        }
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(24f);
        text.setFakeBoldText(true);
        text.setColor(active ? palette.accentText : palette.muted);
        canvas.drawText(label, rect.centerX(), rect.centerY() + 8f, text);
        text.setTextAlign(Paint.Align.LEFT);
    }

    private static void drawWidgetSearchControls(Context context, Canvas canvas, ThemePalette palette) {
        RectF search = widgetSearchBaseRect();
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(search, 28f, 28f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(search, 28f, 28f, stroke);

        Paint icon = new Paint(Paint.ANTI_ALIAS_FLAG);
        icon.setStyle(Paint.Style.STROKE);
        icon.setStrokeWidth(5f);
        icon.setStrokeCap(Paint.Cap.ROUND);
        icon.setColor(palette.muted);
        canvas.drawCircle(search.left + 50f, search.centerY() - 5f, 18f, icon);
        canvas.drawLine(search.left + 64f, search.centerY() + 9f, search.left + 82f, search.centerY() + 27f, icon);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(palette.text);
        text.setTextSize(32f);
        String query = widgetSearchQuery(context);
        if (TextUtils.isEmpty(query)) {
            text.setColor(palette.muted);
            query = "Cari widget";
        }
        drawTextLimited(canvas, query, search.left + 116f, search.centerY() + 11f, text, search.width() - 148f);

        RectF group = widgetViewGroupBaseRect();
        Paint groupBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        groupBg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(group, 26f, 26f, groupBg);
        Paint groupStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        groupStroke.setStyle(Paint.Style.STROKE);
        groupStroke.setStrokeWidth(1.4f);
        groupStroke.setColor(palette.border);
        canvas.drawRoundRect(group, 26f, 26f, groupStroke);

        String mode = widgetViewMode(context);
        drawWidgetViewButton(canvas, widgetViewListBaseRect(), WIDGET_VIEW_LIST.equals(mode), palette, 0);
        drawWidgetViewButton(canvas, widgetViewGridBaseRect(), WIDGET_VIEW_GRID.equals(mode), palette, 1);
        drawWidgetViewButton(canvas, widgetViewFlowBaseRect(), WIDGET_VIEW_FLOW.equals(mode), palette, 2);
    }

    private static void drawWidgetViewButton(Canvas canvas, RectF rect, boolean active, ThemePalette palette, int iconType) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(active ? palette.accent : palette.surface);
        canvas.drawRoundRect(rect, 20f, 20f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f);
        stroke.setColor(active ? adjustAlpha(palette.accentText, 136) : palette.border);
        canvas.drawRoundRect(rect, 20f, 20f, stroke);

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(4.4f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setColor(active ? palette.accentText : palette.text);
        float cx = rect.centerX();
        float cy = rect.centerY();
        if (iconType == 1) {
            float size = 18f;
            for (int row = 0; row < 2; row++) {
                for (int col = 0; col < 2; col++) {
                    RectF box = new RectF(cx - 24f + col * 31f, cy - 24f + row * 31f, cx - 24f + col * 31f + size, cy - 24f + row * 31f + size);
                    canvas.drawRoundRect(box, 5f, 5f, line);
                }
            }
            return;
        }
        if (iconType == 2) {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(active ? adjustAlpha(palette.accentText, 42) : adjustAlpha(palette.text, 26));
            RectF colA = new RectF(cx - 30f, cy - 25f, cx - 12f, cy + 24f);
            RectF colB = new RectF(cx - 4f, cy - 25f, cx + 14f, cy - 2f);
            RectF colC = new RectF(cx + 22f, cy - 25f, cx + 40f, cy + 24f);
            RectF colD = new RectF(cx - 4f, cy + 6f, cx + 14f, cy + 28f);
            canvas.drawRoundRect(colA, 6f, 6f, fill);
            canvas.drawRoundRect(colB, 6f, 6f, fill);
            canvas.drawRoundRect(colC, 6f, 6f, fill);
            canvas.drawRoundRect(colD, 6f, 6f, fill);
            canvas.drawRoundRect(colA, 6f, 6f, line);
            canvas.drawRoundRect(colB, 6f, 6f, line);
            canvas.drawRoundRect(colC, 6f, 6f, line);
            canvas.drawRoundRect(colD, 6f, 6f, line);
            return;
        }
        for (int i = 0; i < 3; i++) {
            float y = cy - 18f + i * 18f;
            canvas.drawCircle(cx - 28f, y, 3.8f, line);
            canvas.drawLine(cx - 14f, y, cx + 30f, y, line);
        }
    }

    private static void drawSettingsWidgetItem(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF item, String viewMode, ThemePalette palette) {
        if (WIDGET_VIEW_GRID.equals(viewMode) || WIDGET_VIEW_FLOW.equals(viewMode)) {
            drawSettingsWidgetTile(context, canvas, widget, item, viewMode, palette);
            return;
        }
        drawSettingsWidgetRow(context, canvas, widget, item.top, palette);
    }

    private static void drawSettingsWidgetRow(Context context, Canvas canvas, DynamicWidgetInfo widget, float top, ThemePalette palette) {
        RectF row = new RectF(48f, top, BASE_WIDTH - 48f, top + 106f);
        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(palette.border);
        canvas.drawLine(row.left, row.bottom, row.right, row.bottom, divider);

        RectF iconRect = new RectF(row.left, row.top + 12f, row.left + 62f, row.top + 74f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 16f, 16f, iconBg);
        Bitmap icon = widget.icon(context, 50);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 6f, iconRect.top + 6f, iconRect.right - 6f, iconRect.bottom - 6f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, iconRect.centerX(), iconRect.centerY(), widget.kind, palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(24f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, widget.title, row.left + 82f, row.top + 35f, title, 488f);
        Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
        sub.setColor(palette.muted);
        sub.setTextSize(19f);
        drawTextLimited(canvas, widget.subtitle, row.left + 82f, row.top + 64f, sub, 488f);

        RectF preview = new RectF(BASE_WIDTH - 408f, row.top + 16f, BASE_WIDTH - 262f, row.top + 90f);
        drawWidgetPreview(context, canvas, widget, preview, WIDGET_VIEW_LIST, palette);
        RectF button = new RectF(BASE_WIDTH - 250f, row.top + 25f, BASE_WIDTH - 48f, row.top + 81f);
        if (widget.isMediaSession()) {
            drawAddButton(canvas, button, "Aktif", true, palette);
        } else {
            boolean enabled = DynamicWidgetInfo.isEnabled(context, widget.id);
            boolean needsBind = enabled && widget.providerComponent != null && !widget.isMediaControl() && !isHostedWidgetReady(context, widget.id);
            drawAddButton(canvas, button, needsBind ? "Izinkan" : (enabled ? "Hapus" : "Tambah"), enabled && !needsBind, palette);
        }
    }

    private static void drawSettingsWidgetTile(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF tile, String viewMode, ThemePalette palette) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(tile, 22f, 22f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.2f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(tile, 22f, 22f, stroke);

        RectF iconRect = new RectF(tile.left + 18f, tile.top + 18f, tile.left + 76f, tile.top + 76f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 15f, 15f, iconBg);
        Bitmap icon = widget.icon(context, 48);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 6f, iconRect.top + 6f, iconRect.right - 6f, iconRect.bottom - 6f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, iconRect.centerX(), iconRect.centerY(), widget.kind, palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(22f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, widget.title, iconRect.right + 14f, tile.top + 42f, title, tile.width() - 118f);
        Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
        sub.setColor(palette.muted);
        sub.setTextSize(17f);
        drawTextLimited(canvas, widget.subtitle, iconRect.right + 14f, tile.top + 68f, sub, tile.width() - 118f);

        RectF preview = settingsWidgetPreviewRect(tile, viewMode);
        drawWidgetPreview(context, canvas, widget, preview, viewMode, palette);
        RectF button = settingsWidgetButtonRect(tile, viewMode);
        boolean enabled = DynamicWidgetInfo.isEnabled(context, widget.id);
        boolean needsBind = enabled && widget.providerComponent != null && !widget.isMediaControl() && !isHostedWidgetReady(context, widget.id);
        if (widget.isMediaSession()) drawAddButton(canvas, button, "Aktif", true, palette);
        else drawAddButton(canvas, button, needsBind ? "Izinkan" : (enabled ? "Hapus" : "Tambah"), enabled && !needsBind, palette);
    }

    private static void drawSettingsWidgetSkeleton(Canvas canvas, RectF item, String viewMode, ThemePalette palette) {
        if (WIDGET_VIEW_GRID.equals(viewMode) || WIDGET_VIEW_FLOW.equals(viewMode)) {
            Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
            bg.setColor(palette.surfaceAlt);
            canvas.drawRoundRect(item, 22f, 22f, bg);
            Paint shimmer = new Paint(Paint.ANTI_ALIAS_FLAG);
            shimmer.setColor(palette.light ? 0x16000000 : 0x18FFFFFF);
            canvas.drawRoundRect(new RectF(item.left + 18f, item.top + 18f, item.left + 76f, item.top + 76f), 15f, 15f, shimmer);
            canvas.drawRoundRect(new RectF(item.left + 96f, item.top + 28f, item.right - 36f, item.top + 42f), 7f, 7f, shimmer);
            canvas.drawRoundRect(new RectF(item.left + 96f, item.top + 56f, item.right - 88f, item.top + 68f), 6f, 6f, shimmer);
            canvas.drawRoundRect(settingsWidgetPreviewRect(item, viewMode), 17f, 17f, shimmer);
            canvas.drawRoundRect(settingsWidgetButtonRect(item, viewMode), 18f, 18f, shimmer);
            return;
        }
        drawSheetSkeletonRow(canvas, item.top, item.height(), palette);
    }

    private static void drawSettingsNotificationRow(Context context, Canvas canvas, NotificationInfo notification, float top, ThemePalette palette) {
        RectF row = new RectF(48f, top, BASE_WIDTH - 48f, top + 126f);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(row, 20f, 20f, bg);

        RectF iconRect = new RectF(row.left + 16f, row.top + 18f, row.left + 82f, row.top + 84f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 16f, 16f, iconBg);
        Bitmap icon = notification.icon(context, 52);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 7f, iconRect.top + 7f, iconRect.right - 7f, iconRect.bottom - 7f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawBellIcon(canvas, iconRect.centerX(), iconRect.centerY(), palette.accent);
        }

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(palette.text);
        title.setTextSize(23f);
        title.setFakeBoldText(true);
        drawTextLimited(canvas, notification.titleText(context), row.left + 102f, row.top + 39f, title, 560f);
        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(palette.muted);
        body.setTextSize(19f);
        drawTextLimited(canvas, notification.text, row.left + 102f, row.top + 68f, body, 560f);
        body.setTextSize(17f);
        canvas.drawText("Bisa dibalas - " + notification.timeText(), row.left + 102f, row.top + 97f, body);

        RectF button = new RectF(BASE_WIDTH - 250f, top + 35f, BASE_WIDTH - 48f, top + 91f);
        boolean enabled = NotificationInfo.isEnabled(context, notification.key);
        drawAddButton(canvas, button, enabled ? "Hapus" : "Tambah", enabled, palette);
    }

    private static void drawWidgetPreview(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF preview, String viewMode, ThemePalette palette) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.light ? 0xFFFFFFFF : 0xFF07100B);
        canvas.drawRoundRect(preview, 15f, 15f, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.2f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(preview, 15f, 15f, stroke);

        if (widget.artwork != null && !widget.artwork.isRecycled()) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(preview, 15f, 15f, Path.Direction.CW);
            canvas.clipPath(clip);
            RectF inset = new RectF(preview.left + 4f, preview.top + 4f, preview.right - 4f, preview.bottom - 4f);
            if (WIDGET_VIEW_GRID.equals(viewMode)) drawBitmapCover(canvas, widget.artwork, inset);
            else drawBitmapInside(canvas, widget.artwork, inset);
            canvas.restore();
            return;
        }

        Bitmap icon = widget.icon(context, 54);
        if (icon != null) {
            RectF art = new RectF(preview.left + 8f, preview.top + 8f, preview.left + 62f, preview.top + 62f);
            canvas.drawRoundRect(art, 12f, 12f, new Paint(Paint.ANTI_ALIAS_FLAG));
            canvas.drawBitmap(icon, null, art, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            RectF glyph = new RectF(preview.left + 10f, preview.top + 10f, preview.left + 58f, preview.top + 58f);
            Paint glyphBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            glyphBg.setColor(palette.accentSoft);
            canvas.drawRoundRect(glyph, 12f, 12f, glyphBg);
            drawWidgetGlyph(canvas, glyph.centerX(), glyph.centerY(), widget.kind, palette.accent);
        }

        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setColor(palette.accentSoft);
        canvas.drawRoundRect(new RectF(preview.left + 72f, preview.top + 16f, preview.right - 12f, preview.top + 27f), 6f, 6f, line);
        line.setColor(adjustAlpha(palette.muted, 58));
        canvas.drawRoundRect(new RectF(preview.left + 72f, preview.top + 37f, preview.right - 32f, preview.top + 47f), 6f, 6f, line);
        if (widget.full) {
            line.setColor(adjustAlpha(palette.accent, 72));
            canvas.drawRoundRect(new RectF(preview.left + 72f, preview.top + 56f, preview.right - 12f, preview.top + 64f), 5f, 5f, line);
        }
    }

    private static void drawLargeWidgetPreview(Context context, Canvas canvas, DynamicWidgetInfo widget, RectF preview, ThemePalette palette) {
        if (widget.artwork != null && !widget.artwork.isRecycled()) {
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(preview, 28f, 28f, Path.Direction.CW);
            canvas.clipPath(clip);
            drawBitmapInside(canvas, widget.artwork, new RectF(preview.left + 12f, preview.top + 12f, preview.right - 12f, preview.bottom - 12f));
            Paint veil = new Paint(Paint.ANTI_ALIAS_FLAG);
            veil.setColor(palette.light ? 0x18FFFFFF : 0x22000000);
            canvas.drawRect(preview, veil);
            canvas.restore();
            return;
        }
        Paint panel = new Paint(Paint.ANTI_ALIAS_FLAG);
        panel.setColor(palette.light ? 0xFFFFFFFF : 0xFF0A160E);
        RectF inner = new RectF(preview.left + 42f, preview.top + 42f, preview.right - 42f, preview.bottom - 42f);
        canvas.drawRoundRect(inner, 26f, 26f, panel);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.4f);
        stroke.setColor(palette.border);
        canvas.drawRoundRect(inner, 26f, 26f, stroke);

        RectF iconRect = new RectF(inner.left + 44f, inner.top + 44f, inner.left + 168f, inner.top + 168f);
        Paint iconBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        iconBg.setColor(palette.accentSoft);
        canvas.drawRoundRect(iconRect, 30f, 30f, iconBg);
        Bitmap icon = widget.icon(context, 108);
        if (icon != null) {
            canvas.drawBitmap(icon, null, new RectF(iconRect.left + 10f, iconRect.top + 10f, iconRect.right - 10f, iconRect.bottom - 10f), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        } else {
            drawWidgetGlyph(canvas, iconRect.centerX(), iconRect.centerY(), widget.kind, palette.accent);
        }

        Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        bar.setColor(palette.accentSoft);
        canvas.drawRoundRect(new RectF(iconRect.right + 38f, inner.top + 58f, inner.right - 56f, inner.top + 88f), 15f, 15f, bar);
        bar.setColor(adjustAlpha(palette.muted, palette.light ? 56 : 68));
        canvas.drawRoundRect(new RectF(iconRect.right + 38f, inner.top + 112f, inner.right - 160f, inner.top + 136f), 12f, 12f, bar);
        canvas.drawRoundRect(new RectF(iconRect.right + 38f, inner.top + 158f, inner.right - 260f, inner.top + 180f), 11f, 11f, bar);

        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(adjustAlpha(palette.accent, 42));
        float tileTop = inner.top + 236f;
        float tileWidth = (inner.width() - 110f) / 3f;
        for (int i = 0; i < 3; i++) {
            RectF tile = new RectF(inner.left + 44f + i * (tileWidth + 11f), tileTop, inner.left + 44f + i * (tileWidth + 11f) + tileWidth, tileTop + 142f);
            canvas.drawRoundRect(tile, 20f, 20f, grid);
            bar.setColor(i == 0 ? palette.accent : adjustAlpha(palette.muted, 54));
            canvas.drawRoundRect(new RectF(tile.left + 18f, tile.top + 24f, tile.right - 18f, tile.top + 44f), 10f, 10f, bar);
            bar.setColor(adjustAlpha(palette.muted, 42));
            canvas.drawRoundRect(new RectF(tile.left + 18f, tile.top + 70f, tile.right - 44f, tile.top + 88f), 9f, 9f, bar);
        }
    }

    private static void drawSheetSkeletonRow(Canvas canvas, float top, float height, ThemePalette palette) {
        RectF row = new RectF(48f, top, BASE_WIDTH - 48f, top + height);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surfaceAlt);
        canvas.drawRoundRect(row, 18f, 18f, bg);
        Paint shimmer = new Paint(Paint.ANTI_ALIAS_FLAG);
        shimmer.setColor(adjustAlpha(palette.muted, palette.light ? 32 : 44));
        canvas.drawRoundRect(new RectF(row.left + 18f, row.top + 18f, row.left + 82f, row.top + 82f), 16f, 16f, shimmer);
        canvas.drawRoundRect(new RectF(row.left + 104f, row.top + 24f, row.left + 560f, row.top + 42f), 9f, 9f, shimmer);
        canvas.drawRoundRect(new RectF(row.left + 104f, row.top + 58f, row.left + 430f, row.top + 74f), 8f, 8f, shimmer);
        canvas.drawRoundRect(new RectF(row.right - 220f, row.top + 28f, row.right - 18f, row.top + 82f), 15f, 15f, shimmer);
    }

    private static int stagedCount(int total, long ageMs, int initial, long stepMs) {
        if (total <= 0) return 0;
        int count = initial + (int) Math.max(0L, ageMs) / (int) Math.max(1L, stepMs);
        return Math.max(0, Math.min(total, count));
    }

    private static void drawAddButton(Canvas canvas, RectF button, String label, boolean added, ThemePalette palette) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(added ? palette.surfaceAlt : palette.accent);
        canvas.drawRoundRect(button, 15f, 15f, bg);
        if (added) {
            Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(1.4f);
            stroke.setColor(palette.border);
            canvas.drawRoundRect(button, 15f, 15f, stroke);
        }
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(20f);
        text.setFakeBoldText(true);
        text.setColor(added ? palette.muted : palette.accentText);
        canvas.drawText(label, button.centerX(), button.centerY() + 7f, text);
        text.setTextAlign(Paint.Align.LEFT);
    }

    private static void drawMiniActionButton(Canvas canvas, RectF rect, String label, boolean primary, boolean light) {
        int accent = lastDynamicAccent == 0 ? (light ? 0xFF16A34A : 0xFF22C55E) : lastDynamicAccent;
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(primary ? accent : (light ? 0xFFFFFFFF : blend(0xFF07100B, accent, 0.08f)));
        canvas.drawRoundRect(rect, 14f, 14f, bg);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(18f);
        text.setFakeBoldText(true);
        text.setColor(primary ? readableTextOn(accent) : (light ? 0xFF102014 : 0xFFF8FAFC));
        canvas.drawText(label, rect.centerX(), rect.centerY() + 6f, text);
        text.setTextAlign(Paint.Align.LEFT);
    }

    private static void drawSheetEmpty(Canvas canvas, String label, float left, float top, ThemePalette palette) {
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.surfaceAlt);
        RectF rect = new RectF(left, top, BASE_WIDTH - 48f, top + 86f);
        canvas.drawRoundRect(rect, 18f, 18f, bg);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(palette.muted);
        text.setTextSize(21f);
        text.setFakeBoldText(true);
        drawTextLimited(canvas, label, rect.left + 20f, rect.centerY() + 7f, text, rect.width() - 40f);
    }

    static void drawDetectionDetails(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        int width,
        int height,
        float progress
    ) {
        float sheetProgress = clamp01(progress);
        if (sheetProgress <= 0f) return;
        boolean light = useLightTheme(context);
        canvas.save();
        canvas.scale(width / (float) BASE_WIDTH, height / (float) BASE_HEIGHT);
        Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        shade.setColor(adjustAlpha(0xFF000000, Math.round(154f * sheetProgress)));
        canvas.drawRect(0f, 0f, BASE_WIDTH, BASE_HEIGHT, shade);

        RectF card = new RectF(0f, 420f, BASE_WIDTH, BASE_HEIGHT + 40f);
        float hiddenOffset = (BASE_HEIGHT - card.top + 40f) * (1f - sheetProgress);
        canvas.translate(0f, hiddenOffset);
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(light ? 0xFFF8FAFC : 0xFF15181C);
        canvas.drawRoundRect(card, 44f, 44f, cardPaint);

        Paint handle = new Paint(Paint.ANTI_ALIAS_FLAG);
        handle.setColor(light ? 0x66344054 : 0x55FFFFFF);
        canvas.drawRoundRect(new RectF(BASE_WIDTH / 2f - 58f, 440f, BASE_WIDTH / 2f + 58f, 450f), 6f, 6f, handle);

        Paint title = new Paint(Paint.ANTI_ALIAS_FLAG);
        title.setColor(light ? 0xFF0F172A : Color.WHITE);
        title.setTextSize(38f);
        title.setFakeBoldText(true);
        canvas.drawText("Rincian deteksi", 48f, 516f, title);

        RectF close = detailCloseBaseRect();
        Paint closePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        closePaint.setColor(light ? 0xFFE8EEF7 : 0x22FFFFFF);
        float xScale = width / (float) BASE_WIDTH;
        float yScale = height / (float) BASE_HEIGHT;
        float shapeYCompensation = yScale == 0f ? 1f : xScale / yScale;
        canvas.save();
        canvas.scale(1f, shapeYCompensation, close.centerX(), close.centerY());
        canvas.drawOval(close, closePaint);
        Paint closeText = new Paint(Paint.ANTI_ALIAS_FLAG);
        closeText.setColor(light ? 0xFF344054 : 0xFFB9C0CA);
        closeText.setTextSize(42f);
        closeText.setTextAlign(Paint.Align.CENTER);
        canvas.drawText("×", close.centerX(), close.centerY() + 14f, closeText);
        closeText.setTextAlign(Paint.Align.LEFT);
        canvas.restore();

        List<Detection> detections = snapshot.allDetections();
        Detection primary = snapshot.primaryDetection(detections);
        int primarySlot = detectionSlot(snapshot, primary);
        RectF preview = new RectF(48f, 558f, BASE_WIDTH - 48f, 906f);
        drawDetectionThumbnail(context, canvas, snapshot, primary, primarySlot, preview, false);

        RectF countCard = new RectF(48f, 934f, BASE_WIDTH - 48f, 1026f);
        Paint countBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        countBg.setColor(light ? 0xFFFFFFFF : 0xFF1A1E23);
        canvas.drawRoundRect(countCard, 20f, 20f, countBg);
        Paint countText = new Paint(Paint.ANTI_ALIAS_FLAG);
        countText.setColor(light ? 0xFF344054 : 0xFFCFD3D8);
        countText.setTextSize(27f);
        countText.setFakeBoldText(true);
        canvas.drawText("Objek terkonfirmasi (gabungan)", countCard.left + 24f, countCard.top + 57f, countText);
        countText.setColor(light ? 0xFF0F172A : Color.WHITE);
        countText.setTextSize(42f);
        countText.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(String.valueOf(detections.size()), countCard.right - 24f, countCard.top + 62f, countText);
        countText.setTextAlign(Paint.Align.LEFT);

        Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
        body.setColor(light ? 0xFF526071 : 0xFFD7DFEA);
        body.setTextSize(25f);
        if (detections.isEmpty()) {
            RectF info = new RectF(48f, 1080f, BASE_WIDTH - 48f, 1228f);
            Paint infoPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            infoPaint.setColor(0x145DCAA5);
            canvas.drawRoundRect(info, 20f, 20f, infoPaint);
            drawTextLimited(canvas, "Belum ada objek yang cukup yakin. Analisis diulang pada snapshot berikutnya.", info.left + 28f, info.top + 58f, body, info.width() - 56f);
            canvas.restore();
            return;
        }

        float rowTop = 1056f;
        int index = 1;
        for (Detection detection : detections) {
            if (index > 5) break;
            RectF row = new RectF(48f, rowTop, BASE_WIDTH - 48f, rowTop + 124f);
            Paint rowBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            rowBg.setColor(light ? 0xFFFFFFFF : 0xFF1A1E23);
            canvas.drawRoundRect(row, 20f, 20f, rowBg);
            RectF thumb = new RectF(row.left + 14f, row.top + 12f, row.left + 114f, row.bottom - 12f);
            drawDetectionThumbnail(context, canvas, snapshot, detection, detectionSlot(snapshot, detection), thumb, true);
            Paint name = new Paint(Paint.ANTI_ALIAS_FLAG);
            name.setColor(light ? 0xFF0F172A : Color.WHITE);
            name.setTextSize(29f);
            name.setFakeBoldText(true);
            canvas.drawText(detection.displayName(), row.left + 138f, row.top + 48f, name);
            body.setTextSize(22f);
            canvas.drawText("Akurasi " + Math.round(detection.confidence * 100d) + "% · " + detection.sizeText(), row.left + 138f, row.top + 86f, body);
            Paint badge = new Paint(Paint.ANTI_ALIAS_FLAG);
            badge.setColor(0x225DCAA5);
            canvas.drawCircle(row.right - 46f, row.centerY(), 28f, badge);
            Paint badgeText = new Paint(Paint.ANTI_ALIAS_FLAG);
            badgeText.setColor(0xFF9FE1CB);
            badgeText.setTextSize(22f);
            badgeText.setFakeBoldText(true);
            badgeText.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(String.valueOf(index), row.right - 46f, row.centerY() + 8f, badgeText);
            rowTop += 138f;
            index++;
        }
        canvas.restore();
    }

    private static int detectionSlot(Snapshot snapshot, Detection detection) {
        if (detection != null && snapshot.detectionsForSlot(2).contains(detection)) return 2;
        return 1;
    }

    private static void drawDetectionThumbnail(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        Detection detection,
        int slot,
        RectF destination,
        boolean circular
    ) {
        Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
        background.setColor(0xFF0E1420);
        canvas.drawRoundRect(destination, circular ? destination.width() / 2f : 22f, circular ? destination.height() / 2f : 22f, background);
        Bitmap image = snapshot.imageBitmap(context, slot);
        if (image == null || image.isRecycled()) return;

        int frameWidth = Math.max(1, snapshot.frameWidthForSlot(slot));
        int frameHeight = Math.max(1, snapshot.frameHeightForSlot(slot));
        Rect source = new Rect(0, 0, image.getWidth(), image.getHeight());
        if (detection != null && frameWidth > 1 && frameHeight > 1) {
            float expandX = (float) detection.width * 0.16f;
            float expandY = (float) detection.height * 0.16f;
            int left = Math.round((float) Math.max(0d, detection.x - expandX) / frameWidth * image.getWidth());
            int top = Math.round((float) Math.max(0d, detection.y - expandY) / frameHeight * image.getHeight());
            int right = Math.round((float) Math.min(frameWidth, detection.x + detection.width + expandX) / frameWidth * image.getWidth());
            int bottom = Math.round((float) Math.min(frameHeight, detection.y + detection.height + expandY) / frameHeight * image.getHeight());
            if (right - left >= 2 && bottom - top >= 2) source = new Rect(left, top, right, bottom);
        }

        canvas.save();
        Path clip = new Path();
        if (circular) clip.addOval(destination, Path.Direction.CW);
        else clip.addRoundRect(destination, 22f, 22f, Path.Direction.CW);
        canvas.clipPath(clip);
        Paint bitmapPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.drawBitmap(image, source, destination, bitmapPaint);
        canvas.restore();

        if (!circular && detection != null) {
            Paint overlay = new Paint(Paint.ANTI_ALIAS_FLAG);
            overlay.setColor(0xB00B1120);
            RectF labelRect = new RectF(destination.left + 18f, destination.bottom - 62f, destination.left + 360f, destination.bottom - 18f);
            canvas.drawRoundRect(labelRect, 18f, 18f, overlay);
            Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
            text.setColor(0xFFD7FFF0);
            text.setTextSize(23f);
            text.setFakeBoldText(true);
            drawTextLimited(canvas, detection.displayName() + " " + Math.round(detection.confidence * 100d) + "%", labelRect.left + 18f, labelRect.top + 29f, text, labelRect.width() - 36f);
        }
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
        canvas.drawText(detection == null ? "Mencari objek" : "Detail objek", 82f, top + 34f, title);

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
            drawTextLimited(canvas, snapshot.vehicleCount() > 0 ? "Agregat objek terdeteksi" : "Belum ada objek terkunci", info.left + 28f, info.top + 88f, value, info.width() - 56f);
            label.setTextSize(25f);
            drawTextLimited(canvas, snapshot.breakdownText(), info.left + 28f, info.top + 145f, label, info.width() - 56f);
            drawTextLimited(canvas, "Kotak deteksi muncul setelah analisis selesai.", info.left + 28f, info.top + 190f, label, info.width() - 56f);
            return;
        }

        canvas.drawText("NAMA OBJEK", info.left + 28f, info.top + 44f, label);
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

    private static void drawFooter(
        Context context,
        Canvas canvas,
        Snapshot snapshot,
        long now,
        float swipeProgress,
        int shortcutDrag,
        float shortcutProgress,
        boolean fingerprintActive,
        boolean interactive,
        ThemePalette palette,
        float shapeYCompensation
    ) {
        boolean light = palette.light;
        int footerAccent = lastDynamicAccent == 0 ? palette.accent : boostAccent(lastDynamicAccent, light);
        palette = new ThemePalette(
            light,
            palette.backgroundTop,
            palette.backgroundBottom,
            palette.surface,
            blend(palette.surfaceAlt, footerAccent, light ? 0.08f : 0.14f),
            adjustAlpha(footerAccent, light ? 60 : 86),
            palette.text,
            palette.muted,
            footerAccent,
            adjustAlpha(footerAccent, light ? 36 : 54),
            boostAccent(footerAccent, false),
            readableTextOn(footerAccent)
        );
        RectF slider = sliderBaseRect();
        drawShortcutSwipeGuide(canvas, leftShortcutBaseRect(), -1, shortcutDrag, shortcutProgress, palette, shapeYCompensation);
        drawShortcutSwipeGuide(canvas, rightShortcutBaseRect(), 1, shortcutDrag, shortcutProgress, palette, shapeYCompensation);
        drawFooterShortcut(canvas, leftShortcutBaseRect(), true, palette, shortcutDrag == -1 ? shortcutProgress : 0f, shapeYCompensation);
        drawFooterShortcut(canvas, rightShortcutBaseRect(), false, palette, shortcutDrag == 1 ? shortcutProgress : 0f, shapeYCompensation);
        BatteryState battery = batteryState(context, now);
        drawChargingBubbles(canvas, slider, fingerprintBaseRect(), battery, palette, now, shapeYCompensation);
        drawFingerprintButton(canvas, fingerprintBaseRect(), palette, now, fingerprintActive, shapeYCompensation);

        Paint sliderBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        sliderBg.setColor(light ? 0xFFFFFFFF : palette.surfaceAlt);
        canvas.drawRoundRect(slider, 52f, 52f, sliderBg);
        Paint sliderStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        sliderStroke.setStyle(Paint.Style.STROKE);
        sliderStroke.setStrokeWidth(2f);
        sliderStroke.setColor(adjustAlpha(palette.accent, interactive ? 102 : 52));
        canvas.drawRoundRect(slider, 52f, 52f, sliderStroke);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setColor(adjustAlpha(palette.accent, light ? 52 : 58));
        RectF fill = new RectF(slider.left, slider.top, slider.left + slider.width() * Math.max(0.18f, swipeProgress), slider.bottom);
        canvas.drawRoundRect(fill, 52f, 52f, track);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(30f);
        text.setFakeBoldText(true);
        text.setColor(palette.text);
        String label = swipeProgress > 0.72f ? "Lepas untuk buka" : "Geser untuk buka";
        float labelWidth = text.measureText(label);
        String percent = battery.percent + "%";
        Paint batteryText = new Paint(text);
        batteryText.setTextSize(23f);
        float batteryWidth = 54f + batteryText.measureText(percent);
        float groupWidth = labelWidth + 18f + batteryWidth;
        float labelX = slider.centerX() - groupWidth / 2f;
        Paint.FontMetrics fm = text.getFontMetrics();
        float labelY = slider.centerY() - (fm.ascent + fm.descent) / 2f;
        text.setTextAlign(Paint.Align.LEFT);
        canvas.drawText(label, labelX, labelY, text);
        drawBatteryIndicator(canvas, labelX + labelWidth + 18f, slider.centerY(), battery, palette, batteryText);

        canvas.save();
        canvas.scale(1f, shapeYCompensation, slider.centerX(), slider.centerY());
        // Chevron dengan sudut lebih tajam (tidak gepeng)
        Paint chevron = new Paint(Paint.ANTI_ALIAS_FLAG);
        chevron.setStyle(Paint.Style.STROKE);
        chevron.setStrokeWidth(4f);
        chevron.setStrokeCap(Paint.Cap.ROUND);
        chevron.setStrokeJoin(Paint.Join.ROUND);
        chevron.setColor(adjustAlpha(palette.accent, 115));
        float phase = ((now % 1100L) / 1100f) * 18f;
        float chevronAlpha = swipeProgress > 0.72f ? 0f : 1f;
        chevron.setAlpha((int) (chevronAlpha * 115));
        drawChevronSharp(canvas, slider.right - 124f + phase, slider.centerY(), chevron);
        drawChevronSharp(canvas, slider.right - 88f + phase, slider.centerY(), chevron);

        float knobRadius = 48f;
        float knobX = slider.left + knobRadius + (slider.width() - knobRadius * 2f) * swipeProgress;
        Paint knob = new Paint(Paint.ANTI_ALIAS_FLAG);
        knob.setShader(new LinearGradient(
            knobX - knobRadius,
            slider.top,
            knobX + knobRadius,
            slider.bottom,
            palette.accentStrong,
            palette.accent,
            Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(knobX, slider.centerY(), knobRadius, knob);

        // Panah dengan sudut lebih tajam, proporsional, tidak gepeng
        Paint arrow = new Paint(Paint.ANTI_ALIAS_FLAG);
        arrow.setStyle(Paint.Style.STROKE);
        arrow.setStrokeWidth(7f);
        arrow.setStrokeCap(Paint.Cap.ROUND);
        arrow.setStrokeJoin(Paint.Join.ROUND);
        arrow.setColor(Color.WHITE);
        canvas.drawLine(knobX - 16f, slider.centerY(), knobX + 14f, slider.centerY(), arrow);
        canvas.drawLine(knobX + 4f, slider.centerY() - 18f, knobX + 18f, slider.centerY(), arrow);
        canvas.drawLine(knobX + 4f, slider.centerY() + 18f, knobX + 18f, slider.centerY(), arrow);
        canvas.restore();
    }

    private static BatteryState batteryState(Context context, long now) {
        if (context == null) return cachedBatteryState;
        if (now - cachedBatteryStateAt < 2_000L) return cachedBatteryState;
        try {
            Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (battery == null) return cachedBatteryState;
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = Math.max(1, battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100));
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN);
            boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;
            int percent = level >= 0 ? Math.round(level * 100f / scale) : cachedBatteryState.percent;
            cachedBatteryState = new BatteryState(percent, charging);
            cachedBatteryStateAt = now;
        } catch (RuntimeException ignored) {
        }
        return cachedBatteryState;
    }

    private static void drawBatteryIndicator(Canvas canvas, float left, float cy, BatteryState battery, ThemePalette palette, Paint text) {
        float iconW = 38f;
        float iconH = 20f;
        RectF body = new RectF(left, cy - iconH / 2f, left + iconW, cy + iconH / 2f);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2.4f);
        stroke.setColor(adjustAlpha(palette.text, 210));
        canvas.drawRoundRect(body, 5f, 5f, stroke);
        RectF nub = new RectF(body.right + 2f, cy - 5f, body.right + 6f, cy + 5f);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(adjustAlpha(palette.text, 210));
        canvas.drawRoundRect(nub, 2f, 2f, fill);
        RectF level = new RectF(body.left + 4f, body.top + 4f, body.left + 4f + (body.width() - 8f) * battery.percent / 100f, body.bottom - 4f);
        fill.setColor(battery.charging ? palette.accent : adjustAlpha(palette.text, 188));
        canvas.drawRoundRect(level, 3f, 3f, fill);
        if (battery.charging) {
            Paint bolt = new Paint(Paint.ANTI_ALIAS_FLAG);
            bolt.setStyle(Paint.Style.FILL);
            bolt.setColor(palette.accentText);
            Path path = new Path();
            path.moveTo(body.centerX() + 1f, body.top + 2f);
            path.lineTo(body.centerX() - 7f, cy + 1f);
            path.lineTo(body.centerX() + 1f, cy + 1f);
            path.lineTo(body.centerX() - 3f, body.bottom - 1f);
            path.lineTo(body.centerX() + 9f, cy - 4f);
            path.lineTo(body.centerX() + 1f, cy - 4f);
            path.close();
            canvas.drawPath(path, bolt);
        }
        text.setColor(palette.text);
        text.setFakeBoldText(true);
        canvas.drawText(battery.percent + "%", body.right + 14f, cy + 8f, text);
    }

    private static void drawChargingBubbles(
        Canvas canvas,
        RectF slider,
        RectF fingerprint,
        BatteryState battery,
        ThemePalette palette,
        long now,
        float shapeYCompensation
    ) {
        if (battery == null || !battery.charging) return;
        canvas.save();
        canvas.scale(1f, shapeYCompensation, fingerprint.centerX(), fingerprint.centerY());
        Paint bubble = new Paint(Paint.ANTI_ALIAS_FLAG);
        int color = palette.accent;
        for (int i = 0; i < 15; i++) {
            float phase = ((now + i * 137L) % 2200L) / 2200f;
            float eased = 1f - (float) Math.pow(1f - phase, 2.2d);
            float startX = slider.left + 72f + (i % 5) * 42f;
            float startY = slider.bottom + 18f + (i % 3) * 16f;
            float endX = fingerprint.centerX() + (float) Math.sin(i * 1.7d + now / 420d) * 64f;
            float endY = fingerprint.centerY() + (float) Math.cos(i * 1.3d + now / 520d) * 50f;
            float x = startX + (endX - startX) * eased;
            float y = startY + (endY - startY) * eased;
            float size = 7f + (i % 4) * 3.7f + (float) Math.sin(now / 180d + i) * 1.8f;
            int alpha = Math.round(38f + 118f * (float) Math.sin(Math.PI * phase));
            bubble.setColor(adjustAlpha(color, alpha));
            canvas.drawCircle(x, y, Math.max(3f, size), bubble);
        }
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(3.4f);
        ring.setColor(adjustAlpha(color, 82));
        float pulse = ((now % 1300L) / 1300f);
        canvas.drawCircle(fingerprint.centerX(), fingerprint.centerY(), 70f + pulse * 30f, ring);
        canvas.restore();
    }

    // Helper baru: chevron dengan sudut tajam, bukan landai/pipih
    private static void drawChevronSharp(Canvas canvas, float x, float y, Paint paint) {
        Path p = new Path();
        p.moveTo(x - 4f, y - 9f);
        p.lineTo(x + 5f, y);
        p.lineTo(x - 4f, y + 9f);
        canvas.drawPath(p, paint);
    }

    static RectF sliderBaseRect() {
        return new RectF(222f, 1718f, BASE_WIDTH - 222f, 1828f);
    }

    static RectF leftShortcutBaseRect() {
        return new RectF(42f, 1708f, 160f, 1826f);
    }

    static RectF rightShortcutBaseRect() {
        return new RectF(BASE_WIDTH - 160f, 1708f, BASE_WIDTH - 42f, 1826f);
    }

    static RectF fingerprintBaseRect() {
        return new RectF(BASE_WIDTH / 2f - 60f, 1588f, BASE_WIDTH / 2f + 60f, 1708f);
    }

    static RectF themeButtonBaseRect() {
        return new RectF(BASE_WIDTH - 126f, 58f, BASE_WIDTH - 42f, 138f);
    }

    static void cycleTheme(Context context) {
        String mode = themeMode(context);
        String next = THEME_AUTO.equals(mode) ? THEME_DARK : THEME_DARK.equals(mode) ? THEME_LIGHT : THEME_AUTO;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_THEME_MODE, next)
            .apply();
    }

    private static String themeMode(Context context) {
        String mode = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_THEME_MODE, THEME_AUTO);
        if (THEME_DARK.equals(mode) || THEME_LIGHT.equals(mode)) return mode;
        return THEME_AUTO;
    }

    private static boolean useLightTheme(Context context) {
        String mode = themeMode(context);
        if (THEME_LIGHT.equals(mode)) return true;
        if (THEME_DARK.equals(mode)) return false;
        int mask = context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mask != Configuration.UI_MODE_NIGHT_YES;
    }

    private static void drawShortcutSwipeGuide(Canvas canvas, RectF rect, int direction, int activeDirection, float progress, ThemePalette palette, float shapeYCompensation) {
        if (direction != activeDirection || progress <= 0f) return;
        float safeProgress = clamp01(progress);
        float cx = rect.centerX();
        float cy = rect.centerY();
        float endX = cx + direction * (78f + 42f * safeProgress);
        canvas.save();
        canvas.scale(1f, shapeYCompensation, cx, cy);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeWidth(8f);
        line.setColor(adjustAlpha(palette.accent, Math.round(68f + safeProgress * 112f)));
        canvas.drawLine(cx, cy, endX, cy, line);

        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(adjustAlpha(palette.accent, Math.round(72f + safeProgress * 110f)));
        canvas.drawCircle(endX, cy, 8f + 8f * safeProgress, dot);
        canvas.restore();
    }

    private static void drawFooterShortcut(Canvas canvas, RectF rect, boolean dialer, ThemePalette palette, float progress, float shapeYCompensation) {
        float safeProgress = clamp01(progress);
        float direction = dialer ? -1f : 1f;
        RectF moved = new RectF(rect);
        moved.offset(direction * 92f * safeProgress, 0f);
        float scale = 1f + 0.09f * safeProgress;
        float cx = moved.centerX();
        float cy = moved.centerY();

        canvas.save();
        canvas.scale(1f, shapeYCompensation, cx, cy);
        if (safeProgress > 0f) {
            Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
            glow.setColor(adjustAlpha(palette.accent, Math.round(48f + safeProgress * 84f)));
            canvas.drawCircle(cx, cy, moved.width() * (0.62f + 0.16f * safeProgress), glow);
        }

        canvas.save();
        canvas.scale(scale, scale, cx, cy);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.light ? 0xF4FFFFFF : 0xDD171A20);
        canvas.drawOval(moved, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2.4f + safeProgress * 1.4f);
        stroke.setColor(adjustAlpha(palette.accent, Math.round((palette.light ? 72f : 82f) + safeProgress * 96f)));
        canvas.drawOval(moved, stroke);
        Paint icon = new Paint(Paint.ANTI_ALIAS_FLAG);
        icon.setStyle(Paint.Style.STROKE);
        icon.setStrokeWidth(5.3f);
        icon.setStrokeCap(Paint.Cap.ROUND);
        icon.setStrokeJoin(Paint.Join.ROUND);
        icon.setColor(palette.light ? 0xFF111827 : 0xFFF8FAFC);
        canvas.save();
        canvas.translate(moved.centerX(), moved.centerY());
        canvas.scale(1.58f, 1.58f);
        if (dialer) {
            drawPhoneIcon(canvas, 0f, 0f, icon);
        } else {
            drawCameraIcon(canvas, 0f, 0f, icon);
        }
        canvas.restore();
        canvas.restore();
        canvas.restore();
    }

    private static void drawFingerprintButton(Canvas canvas, RectF rect, ThemePalette palette, long now, boolean active, float shapeYCompensation) {
        float loop = ((now % 1400L) / 1400f);
        float idlePulse = (float) ((Math.sin(loop * Math.PI * 2d) + 1d) * 0.5d);
        float activePulse = active ? ((now % 520L) / 520f) : 0f;
        float pulse = active ? activePulse : idlePulse * 0.32f;
        int accent = palette.accent;

        canvas.save();
        canvas.scale(1f, shapeYCompensation, rect.centerX(), rect.centerY());
        Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        halo.setStyle(Paint.Style.STROKE);
        halo.setStrokeWidth(active ? 5f : 2.6f);
        halo.setColor(adjustAlpha(accent, Math.round(active ? 150f * (1f - activePulse) : 36f + idlePulse * 28f)));
        canvas.drawCircle(rect.centerX(), rect.centerY(), rect.width() * (0.50f + 0.24f * pulse), halo);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(palette.light ? 0xF2FFFFFF : 0xAA171A20);
        canvas.drawOval(rect, bg);
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(active ? 3.4f : 2.2f);
        stroke.setColor(adjustAlpha(accent, active ? 170 : 92));
        canvas.drawOval(rect, stroke);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(4.7f);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setColor(accent);
        canvas.save();
        canvas.translate(rect.centerX(), rect.centerY() + 2f);
        canvas.scale(1.62f + (active ? 0.04f * (1f - activePulse) : 0f), 1.62f + (active ? 0.04f * (1f - activePulse) : 0f));
        drawFingerprintIcon(canvas, 0f, 0f, line);
        canvas.restore();
        canvas.restore();
    }

    private static void drawCameraIcon(Canvas canvas, float cx, float cy, Paint p) {
        RectF body = new RectF(cx - 17f, cy - 9f, cx + 17f, cy + 13f);
        canvas.drawRoundRect(body, 5.5f, 5.5f, p);
        canvas.drawLine(cx - 8f, cy - 9f, cx - 4f, cy - 15f, p);
        canvas.drawLine(cx - 4f, cy - 15f, cx + 6f, cy - 15f, p);
        canvas.drawLine(cx + 6f, cy - 15f, cx + 10f, cy - 9f, p);
        canvas.drawCircle(cx, cy + 2f, 7.4f, p);
        Paint dot = new Paint(p);
        dot.setStyle(Paint.Style.FILL);
        canvas.drawCircle(cx + 10.5f, cy - 2.5f, 2f, dot);
    }

    private static void drawPhoneIcon(Canvas canvas, float cx, float cy, Paint p) {
        Paint receiver = new Paint(p);
        receiver.setStrokeWidth(6.4f);
        receiver.setStrokeCap(Paint.Cap.ROUND);
        receiver.setStrokeJoin(Paint.Join.ROUND);
        Path phone = new Path();
        phone.moveTo(cx - 12.8f, cy - 12f);
        phone.cubicTo(cx - 18f, cy - 6f, cx - 16.2f, cy + 4.5f, cx - 8f, cy + 11.8f);
        phone.cubicTo(cx - 0.2f, cy + 18.8f, cx + 9.2f, cy + 17.2f, cx + 14.5f, cy + 11.6f);
        canvas.drawPath(phone, receiver);

        Paint caps = new Paint(p);
        caps.setStrokeWidth(7.4f);
        caps.setStrokeCap(Paint.Cap.ROUND);
        caps.setStrokeJoin(Paint.Join.ROUND);
        canvas.drawLine(cx - 12.5f, cy - 12f, cx - 6.6f, cy - 6.4f, caps);
        canvas.drawLine(cx + 8.2f, cy + 5.6f, cx + 14.2f, cy + 11.3f, caps);
    }

    private static void drawFingerprintIcon(Canvas canvas, float cx, float cy, Paint p) {
        Paint ridge = new Paint(p);
        ridge.setStrokeWidth(3.8f);
        ridge.setStrokeCap(Paint.Cap.ROUND);
        ridge.setStrokeJoin(Paint.Join.ROUND);

        Path outer = new Path();
        outer.moveTo(cx - 22f, cy - 2f);
        outer.cubicTo(cx - 22f, cy - 16f, cx - 12f, cy - 25f, cx, cy - 25f);
        outer.cubicTo(cx + 13f, cy - 25f, cx + 23f, cy - 15f, cx + 23f, cy - 1f);
        outer.cubicTo(cx + 23f, cy + 9f, cx + 18f, cy + 18f, cx + 10f, cy + 23f);
        canvas.drawPath(outer, ridge);

        Path second = new Path();
        second.moveTo(cx - 16f, cy + 2f);
        second.cubicTo(cx - 16f, cy - 10f, cx - 9f, cy - 18f, cx, cy - 18f);
        second.cubicTo(cx + 10f, cy - 18f, cx + 17f, cy - 10f, cx + 17f, cy);
        second.cubicTo(cx + 17f, cy + 9f, cx + 11f, cy + 16f, cx + 3f, cy + 20f);
        canvas.drawPath(second, ridge);

        Path third = new Path();
        third.moveTo(cx - 9.5f, cy + 3f);
        third.cubicTo(cx - 10f, cy - 5f, cx - 5.5f, cy - 11f, cx + 0.2f, cy - 11f);
        third.cubicTo(cx + 6.5f, cy - 11f, cx + 10.5f, cy - 5.5f, cx + 10.5f, cy + 0.5f);
        third.cubicTo(cx + 10.5f, cy + 8f, cx + 5.5f, cy + 13.5f, cx - 1.5f, cy + 16.5f);
        canvas.drawPath(third, ridge);

        Path core = new Path();
        core.moveTo(cx - 2.5f, cy + 1.5f);
        core.cubicTo(cx - 2.5f, cy - 2.4f, cx - 0.6f, cy - 5f, cx + 1.8f, cy - 5f);
        core.cubicTo(cx + 4.4f, cy - 5f, cx + 5.8f, cy - 2.8f, cx + 5.8f, cy + 0.5f);
        core.cubicTo(cx + 5.8f, cy + 5.4f, cx + 2.8f, cy + 9.4f, cx - 2.6f, cy + 11.8f);
        canvas.drawPath(core, ridge);
    }

    private static void drawSunIcon(Canvas canvas, float cx, float cy, Paint p) {
        canvas.drawCircle(cx, cy, 6f, p);
        for (int i = 0; i < 8; i++) {
            double a = Math.toRadians(i * 45d);
            float cos = (float) Math.cos(a);
            float sin = (float) Math.sin(a);
            canvas.drawLine(cx + cos * 10f, cy + sin * 10f, cx + cos * 14f, cy + sin * 14f, p);
        }
    }

    private static void drawMoonIcon(Canvas canvas, float cx, float cy, Paint p) {
        Path moon = new Path();
        moon.moveTo(cx + 2f, cy - 14f);
        moon.cubicTo(cx - 8f, cy - 12f, cx - 14f, cy - 5f, cx - 14f, cy + 2f);
        moon.cubicTo(cx - 14f, cy + 10f, cx - 8f, cy + 14f, cx + 2f, cy + 14f);
        moon.cubicTo(cx - 2f, cy + 12f, cx - 6f, cy + 8f, cx - 6f, cy + 2f);
        moon.cubicTo(cx - 6f, cy - 5f, cx - 2f, cy - 10f, cx + 2f, cy - 14f);
        moon.close();
        canvas.drawPath(moon, p);
    }

    private static void drawAutoThemeIcon(Canvas canvas, float cx, float cy, Paint p) {
        canvas.drawArc(new RectF(cx - 7f, cy - 7f, cx + 7f, cy + 7f), 90f, 180f, false, p);

        Path half = new Path();
        half.moveTo(cx, cy - 7f);
        half.cubicTo(cx + 7f, cy - 7f, cx + 7f, cy + 7f, cx, cy + 7f);
        half.close();
        Paint fill = new Paint(p);
        fill.setStyle(Paint.Style.FILL);
        canvas.drawPath(half, fill);

        canvas.drawLine(cx, cy - 7f, cx, cy + 7f, p);
        for (int i = 0; i < 8; i++) {
            double a = Math.toRadians(i * 45d);
            float cos = (float) Math.cos(a);
            float sin = (float) Math.sin(a);
            canvas.drawLine(cx + cos * 10f, cy + sin * 10f, cx + cos * 14f, cy + sin * 14f, p);
        }
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

    private static void drawTextLimitedCentered(Canvas canvas, String value, float centerX, float y, Paint paint, float maxWidth) {
        Paint.Align original = paint.getTextAlign();
        float originalSize = paint.getTextSize();
        paint.setTextAlign(Paint.Align.CENTER);

        float size = originalSize;
        float minSize = originalSize * 0.72f;
        while (size > minSize && paint.measureText(value) > maxWidth) {
            size -= 1f;
            paint.setTextSize(size);
        }
        String text = ellipsize(value, paint, maxWidth);
        canvas.drawText(text, centerX, y, paint);

        paint.setTextAlign(original);
        paint.setTextSize(originalSize);
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
        String value = TextUtils.isEmpty(label) ? "object" : label.trim().toLowerCase(Locale.ROOT);
        int hash = Math.abs(value.hashCode());
        float hue = (hash % 360 + 28f) % 360f;
        float saturation = 0.68f + ((hash >> 4) % 18) / 100f;
        float brightness = 0.88f + ((hash >> 9) % 10) / 100f;
        return Color.HSVToColor(new float[] { hue, Math.min(0.88f, saturation), Math.min(0.98f, brightness) });
    }

    private static int boostAccent(int color, boolean light) {
        float[] hsv = new float[3];
        Color.colorToHSV(color, hsv);
        if (hsv[1] < 0.18f) {
            hsv[0] = 145f;
        }
        hsv[1] = Math.max(light ? 0.48f : 0.54f, Math.min(0.86f, hsv[1] * 1.18f));
        hsv[2] = light
            ? Math.max(0.52f, Math.min(0.82f, hsv[2]))
            : Math.max(0.72f, Math.min(0.96f, hsv[2] + 0.12f));
        return Color.HSVToColor(hsv);
    }

    private static int blend(int base, int overlay, float amount) {
        float t = Math.max(0f, Math.min(1f, amount));
        int a = Math.round(Color.alpha(base) * (1f - t) + Color.alpha(overlay) * t);
        int r = Math.round(Color.red(base) * (1f - t) + Color.red(overlay) * t);
        int g = Math.round(Color.green(base) * (1f - t) + Color.green(overlay) * t);
        int b = Math.round(Color.blue(base) * (1f - t) + Color.blue(overlay) * t);
        return Color.argb(a, r, g, b);
    }

    static int activeDynamicAccent(boolean light) {
        int fallback = light ? 0xFF16A34A : 0xFF22C55E;
        int accent = lastDynamicAccent == 0 ? fallback : lastDynamicAccent;
        return boostAccent(accent, light);
    }

    private static int readableTextOn(int color) {
        int brightness = Math.round(Color.red(color) * 0.299f + Color.green(color) * 0.587f + Color.blue(color) * 0.114f);
        return brightness > 146 ? 0xFF061018 : 0xFFFFFFFF;
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

    static final class SheetAction {
        final String type;
        final String value;
        final int index;

        SheetAction(String type, String value, int index) {
            this.type = type == null ? "" : type;
            this.value = value == null ? "" : value;
            this.index = index;
        }
    }

    static final class HostedWidgetSpec {
        final String id;
        final ComponentName provider;
        final String title;
        final boolean full;
        final int mainIndex;
        final int fullIndex;
        final float mainTop;
        final float mainHeight;
        final float fullHeight;

        HostedWidgetSpec(String id, ComponentName provider, String title, boolean full, int mainIndex, int fullIndex, float mainTop, float mainHeight, float fullHeight) {
            this.id = id == null ? "" : id;
            this.provider = provider;
            this.title = TextUtils.isEmpty(title) ? "Widget aplikasi" : title;
            this.full = full;
            this.mainIndex = Math.max(0, mainIndex);
            this.fullIndex = fullIndex;
            this.mainTop = Math.max(MAIN_WIDGET_TOP, mainTop);
            this.mainHeight = Math.max(HOSTED_WIDGET_MIN_HEIGHT, mainHeight);
            this.fullHeight = Math.max(360f, Math.min(1296f, fullHeight));
        }
    }

    static List<HostedWidgetSpec> hostedWidgetSpecs(Context context) {
        List<HostedWidgetSpec> out = new ArrayList<>();
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        boolean hasProviderWidget = hasProviderWidget(widgets);
        boolean hasFull = false;
        for (DynamicWidgetInfo widget : widgets) {
            if (widget.full) {
                hasFull = true;
                break;
            }
        }
        int fullCursor = 0;
        int mainCursor = 0;
        float top = MAIN_WIDGET_TOP;
        for (int i = 0; i < widgets.size(); i++) {
            DynamicWidgetInfo widget = widgets.get(i);
            if (!shouldShowMainWidget(widgets, widget)) continue;
            int fullIndex = hasFull ? (widget.full ? fullCursor++ : -1) : i;
            float height = hostedWidgetMainHeight(widget);
            int visualIndex = mainCursor++;
            if (widget.providerComponent != null) {
                out.add(new HostedWidgetSpec(
                    widget.id,
                    widget.providerComponent,
                    widget.title,
                    widget.full,
                    visualIndex,
                    fullIndex,
                    top,
                    height,
                    hostedWidgetFullHeight(widget)
                ));
            }
            top += height + WIDGET_GAP;
        }
        return out;
    }

    static List<HostedWidgetSpec> hostedFullWidgetSpecs(Context context) {
        List<HostedWidgetSpec> out = new ArrayList<>();
        for (HostedWidgetSpec spec : hostedWidgetSpecs(context)) {
            if (spec.full) out.add(spec);
        }
        if (out.isEmpty()) out.addAll(hostedWidgetSpecs(context));
        return out;
    }

    static HostedWidgetSpec hostedWidgetSpec(Context context, String id) {
        if (TextUtils.isEmpty(id)) return null;
        for (HostedWidgetSpec spec : hostedWidgetSpecs(context)) {
            if (id.equals(spec.id)) return spec;
        }
        for (DynamicWidgetInfo widget : DynamicWidgetInfo.available(context)) {
            if (!id.equals(widget.id) || widget.providerComponent == null) continue;
            return new HostedWidgetSpec(
                widget.id,
                widget.providerComponent,
                widget.title,
                widget.full,
                0,
                widget.full ? 0 : -1,
                MAIN_WIDGET_TOP,
                hostedWidgetMainHeight(widget),
                hostedWidgetFullHeight(widget)
            );
        }
        return null;
    }

    static boolean isDynamicWidgetEnabled(Context context, String id) {
        return DynamicWidgetInfo.isEnabled(context, id);
    }

    static boolean isHostedWidgetReady(Context context, String id) {
        if (TextUtils.isEmpty(id)) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return readIdSet(prefs.getString(PREF_HOSTED_WIDGET_BOUND_IDS, "")).contains(id);
    }

    static void invalidateDynamicWidgetCache() {
        DynamicWidgetInfo.invalidateCache();
    }

    static void setHostedWidgetReady(Context context, String id, boolean ready) {
        if (TextUtils.isEmpty(id)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = readIdSet(prefs.getString(PREF_HOSTED_WIDGET_BOUND_IDS, ""));
        if (ready) ids.add(id);
        else ids.remove(id);
        prefs.edit().putString(PREF_HOSTED_WIDGET_BOUND_IDS, writeIdSet(ids)).apply();
    }

    static int mainHostedWidgetLimit(Context context) {
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        return mainVisibleWidgetLimit(widgets, !NotificationInfo.enabledForLockScreen(context).isEmpty());
    }

    static void setThemeMode(Context context, String mode) {
        String safeMode = THEME_LIGHT.equals(mode) || THEME_DARK.equals(mode) ? mode : THEME_AUTO;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_THEME_MODE, safeMode)
            .apply();
    }

    static void toggleDynamicWidget(Context context, String id) {
        if (TextUtils.isEmpty(id)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        List<DynamicWidgetInfo> available = DynamicWidgetInfo.available(context);
        Set<String> ids = DynamicWidgetInfo.enabledWidgetIds(prefs, available);
        DynamicWidgetInfo target = findAvailableWidget(available, id);
        if (!prefs.getBoolean(PREF_WIDGET_CONFIGURED, false)) {
            for (DynamicWidgetInfo widget : available) {
                if (widget.defaultEnabled) ids.add(widget.id);
            }
        }
        boolean enabled = target == null ? ids.contains(id) : DynamicWidgetInfo.widgetEnabledByIdOrPackage(ids, target);
        if (enabled) {
            ids.remove(id);
            removeEnabledAliases(ids, target);
        } else {
            ids.add(id);
        }
        prefs.edit()
            .putBoolean(PREF_WIDGET_CONFIGURED, true)
            .putString(PREF_ENABLED_WIDGET_IDS, writeIdSet(ids))
            .apply();
    }

    private static void removeEnabledAliases(Set<String> ids, DynamicWidgetInfo target) {
        if (ids == null || target == null || TextUtils.isEmpty(target.packageName)) return;
        if (!"com.spotify.music".equals(target.packageName)) return;
        List<String> remove = new ArrayList<>();
        for (String existing : ids) {
            if (!TextUtils.isEmpty(existing) && existing.contains(target.packageName)) remove.add(existing);
        }
        for (String existing : remove) ids.remove(existing);
    }

    private static DynamicWidgetInfo findAvailableWidget(List<DynamicWidgetInfo> widgets, String id) {
        if (widgets == null || TextUtils.isEmpty(id)) return null;
        for (DynamicWidgetInfo widget : widgets) {
            if (widget != null && id.equals(widget.id)) return widget;
        }
        return null;
    }

    static void toggleReplyableNotification(Context context, String key) {
        if (TextUtils.isEmpty(key)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> keys = readIdSet(prefs.getString(PREF_ENABLED_NOTIF_KEYS, ""));
        if (!prefs.getBoolean(PREF_NOTIF_CONFIGURED, false)) {
            for (NotificationInfo notification : NotificationInfo.loadReplyable(context)) {
                keys.add(notification.key);
            }
        }
        if (keys.contains(key)) keys.remove(key);
        else keys.add(key);
        prefs.edit()
            .putBoolean(PREF_NOTIF_CONFIGURED, true)
            .putString(PREF_ENABLED_NOTIF_KEYS, writeIdSet(keys))
            .apply();
    }

    static SheetAction inlineNotificationActionAt(Context context, float baseX, float baseY) {
        List<NotificationInfo> replyCards = NotificationInfo.enabledForLockScreen(context);
        if (replyCards.isEmpty()) return null;
        int precedingWidgets = mainDisplayedWidgetCount(DynamicWidgetInfo.enabledForLockScreen(context));
        NotificationInfo notification = replyCards.get(0);
        RectF card = replyNotificationCardBaseRect(context, precedingWidgets);
        if (!card.contains(baseX, baseY)) return null;
        if (inlineNotificationReadRect(card).contains(baseX, baseY)) {
            return new SheetAction(SHEET_ACTION_READ, notification.key, 0);
        }
        if (inlineNotificationOpenRect(card).contains(baseX, baseY)) {
            return new SheetAction(SHEET_ACTION_OPEN, notification.key, 0);
        }
        if (inlineNotificationReplyRect(card).contains(baseX, baseY)) {
            return new SheetAction(SHEET_ACTION_REPLY, notification.key, 0);
        }
        return null;
    }

    static SheetAction mainWidgetActionAt(Context context, float baseX, float baseY, float scrollY) {
        float safeScroll = Math.max(0f, Math.min(scrollY, mainWidgetMaxScroll(context)));
        List<DynamicWidgetInfo> widgets = DynamicWidgetInfo.enabledForLockScreen(context);
        List<NotificationInfo> replyCards = NotificationInfo.enabledForLockScreen(context);
        if (widgets.isEmpty() && replyCards.isEmpty()) return null;
        float[] yCandidates = safeScroll > 1f ? new float[] { baseY + safeScroll, baseY } : new float[] { baseY };
        for (float y : yCandidates) {
            int shownWidgets = 0;
            float top = MAIN_WIDGET_TOP;
            for (DynamicWidgetInfo widget : widgets) {
                if (!shouldShowMainWidget(widgets, widget)) continue;
                RectF card = mainWidgetCardBaseRect(widget, top);
                if (card.contains(baseX, y)) {
                    if (widget.isMediaControl()) {
                        if (mediaFavoriteRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_FAVORITE, mediaFavoriteKey(widget), shownWidgets);
                        if (mediaTranscriptRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_TRANSCRIPT, widget.packageName, shownWidgets);
                        if (mediaRepeatRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_REPEAT, widget.packageName, shownWidgets);
                        if (mediaMuteRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_MUTE, widget.packageName, shownWidgets);
                        if (mediaDeviceRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_DEVICE, widget.packageName, shownWidgets);
                        if (mediaQueueRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_QUEUE, widget.packageName, shownWidgets);
                        if (mediaProgressHitRect(card).contains(baseX, y)) {
                            RectF progress = mediaProgressRect(card);
                            int seek = Math.round(clamp01((baseX - progress.left) / Math.max(1f, progress.width())) * 1000f);
                            return new SheetAction(SHEET_ACTION_MEDIA_SEEK, widget.packageName, seek);
                        }
                        if (mediaPreviousPreviewRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_PREVIOUS, widget.packageName, shownWidgets);
                        if (mediaNextPreviewRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_NEXT, widget.packageName, shownWidgets);
                        if (mediaPreviousRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_PREVIOUS, widget.packageName, shownWidgets);
                        if (mediaPlayPauseRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_PLAY_PAUSE, widget.packageName, shownWidgets);
                        if (mediaNextRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_MEDIA_NEXT, widget.packageName, shownWidgets);
                    }
                    if (widget.providerComponent != null && !isHostedWidgetReady(context, widget.id)) {
                        return new SheetAction(SHEET_ACTION_WIDGET, widget.id, shownWidgets);
                    }
                    if (widget.full) {
                        return new SheetAction(SHEET_ACTION_FULL_WIDGET, widget.id, fullWidgetIndexFor(widgets, widget.id));
                    }
                }
                shownWidgets++;
                top = card.bottom + WIDGET_GAP;
            }
            for (int i = 0; i < replyCards.size(); i++) {
                NotificationInfo notification = replyCards.get(i);
                RectF card = replyNotificationCardBaseRect(top, i);
                if (card.contains(baseX, y)) {
                    if (inlineNotificationReadRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_READ, notification.key, i);
                    if (inlineNotificationOpenRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_OPEN, notification.key, i);
                    if (inlineNotificationReplyRect(card).contains(baseX, y)) return new SheetAction(SHEET_ACTION_REPLY, notification.key, i);
                }
            }
        }
        return null;
    }

    private static int mainDisplayedWidgetCount(List<DynamicWidgetInfo> widgets) {
        if (widgets == null || widgets.isEmpty()) return 0;
        int count = 0;
        for (DynamicWidgetInfo widget : widgets) {
            if (!shouldShowMainWidget(widgets, widget)) continue;
            count++;
        }
        return count;
    }

    private static int fullWidgetIndexFor(List<DynamicWidgetInfo> widgets, String id) {
        if (widgets == null || TextUtils.isEmpty(id)) return 0;
        int fullIndex = 0;
        for (DynamicWidgetInfo widget : widgets) {
            if (widget == null || !widget.full) continue;
            if (shouldSuppressProviderBehindMedia(widgets, widget)) continue;
            if (id.equals(widget.id)) return fullIndex;
            fullIndex++;
        }
        return 0;
    }

    static SheetAction settingsActionAt(Context context, float baseX, float baseY) {
        return settingsActionAt(context, baseX, baseY, 0f);
    }

    static SheetAction settingsActionAt(Context context, float baseX, float baseY, float scrollY) {
        RectF light = new RectF(48f, 584f, 376f, 658f);
        RectF dark = new RectF(376f, 584f, 704f, 658f);
        RectF auto = new RectF(704f, 584f, BASE_WIDTH - 48f, 658f);
        if (light.contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_THEME, THEME_LIGHT, -1);
        if (dark.contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_THEME, THEME_DARK, -1);
        if (auto.contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_THEME, THEME_AUTO, -1);

        if (widgetSearchBaseRect().contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_WIDGET_SEARCH, "", -1);
        if (widgetViewListBaseRect().contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_WIDGET_VIEW, WIDGET_VIEW_LIST, -1);
        if (widgetViewGridBaseRect().contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_WIDGET_VIEW, WIDGET_VIEW_GRID, -1);
        if (widgetViewFlowBaseRect().contains(baseX, baseY)) return new SheetAction(SHEET_ACTION_WIDGET_VIEW, WIDGET_VIEW_FLOW, -1);
        if (baseY < SETTINGS_SCROLL_TOP) return null;

        float contentY = baseY + Math.max(0f, Math.min(scrollY, settingsMaxScroll(context)));
        List<DynamicWidgetInfo> widgets = settingsWidgets(context);
        String viewMode = widgetViewMode(context);
        List<RectF> widgetRects = settingsWidgetRects(widgets, viewMode, SETTINGS_WIDGET_LIST_TOP);
        for (int i = 0; i < widgets.size(); i++) {
            RectF add = settingsWidgetButtonRect(widgetRects.get(i), viewMode);
            if (add.contains(baseX, contentY) && !widgets.get(i).isMediaSession()) return new SheetAction(SHEET_ACTION_WIDGET, widgets.get(i).id, i);
        }

        List<NotificationInfo> notifications = NotificationInfo.loadReplyable(context);
        float notifTop = settingsWidgetsBottom(widgetRects, SETTINGS_WIDGET_LIST_TOP) + 68f;
        for (int i = 0; i < notifications.size(); i++) {
            NotificationInfo notification = notifications.get(i);
            RectF add = new RectF(BASE_WIDTH - 250f, notifTop + 35f, BASE_WIDTH - 48f, notifTop + 91f);
            if (add.contains(baseX, contentY)) return new SheetAction(SHEET_ACTION_NOTIFICATION, notification.key, i);
            notifTop += SETTINGS_NOTIFICATION_ROW_STEP;
        }
        return null;
    }

    static String widgetSearchQuery(Context context) {
        if (context == null) return "";
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_WIDGET_SEARCH_QUERY, "")
            .trim();
    }

    static void setWidgetSearchQuery(Context context, String query) {
        if (context == null) return;
        String safe = query == null ? "" : query.trim();
        if (safe.length() > 80) safe = safe.substring(0, 80);
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_WIDGET_SEARCH_QUERY, safe)
            .apply();
    }

    static String widgetViewMode(Context context) {
        if (context == null) return WIDGET_VIEW_LIST;
        String mode = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_WIDGET_VIEW_MODE, WIDGET_VIEW_LIST);
        if (WIDGET_VIEW_GRID.equals(mode) || WIDGET_VIEW_FLOW.equals(mode)) return mode;
        return WIDGET_VIEW_LIST;
    }

    static void setWidgetViewMode(Context context, String mode) {
        if (context == null) return;
        String safe = WIDGET_VIEW_GRID.equals(mode) || WIDGET_VIEW_FLOW.equals(mode) ? mode : WIDGET_VIEW_LIST;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_WIDGET_VIEW_MODE, safe)
            .apply();
    }

    private static List<DynamicWidgetInfo> settingsWidgets(Context context) {
        List<DynamicWidgetInfo> all = DynamicWidgetInfo.available(context);
        String query = widgetSearchQuery(context).toLowerCase(Locale.ROOT);
        List<DynamicWidgetInfo> filtered = new ArrayList<>();
        for (DynamicWidgetInfo widget : all) {
            if (widget == null) continue;
            if (widget.isMediaSession()) continue;
            if (TextUtils.isEmpty(query)) {
                filtered.add(widget);
                continue;
            }
            String haystack = (String.valueOf(widget.title) + " " + String.valueOf(widget.subtitle) + " " + String.valueOf(widget.packageName) + " " + String.valueOf(widget.kind)).toLowerCase(Locale.ROOT);
            if (haystack.contains(query)) filtered.add(widget);
        }
        return filtered;
    }

    private static List<RectF> settingsWidgetRects(List<DynamicWidgetInfo> widgets, String viewMode, float top) {
        List<RectF> rects = new ArrayList<>();
        if (widgets == null || widgets.isEmpty()) return rects;
        if (WIDGET_VIEW_GRID.equals(viewMode)) {
            float left = 48f;
            float gap = 24f;
            float width = (BASE_WIDTH - 96f - gap) / 2f;
            for (int i = 0; i < widgets.size(); i++) {
                int row = i / 2;
                int col = i % 2;
                float x = left + col * (width + gap);
                float y = top + row * 634f;
                rects.add(new RectF(x, y, x + width, y + 610f));
            }
            return rects;
        }
        if (WIDGET_VIEW_FLOW.equals(viewMode)) {
            float left = 48f;
            float gap = 24f;
            float width = (BASE_WIDTH - 96f - gap) / 2f;
            float leftY = top;
            float rightY = top + 42f;
            for (int i = 0; i < widgets.size(); i++) {
                DynamicWidgetInfo widget = widgets.get(i);
                float previewRatio = widget == null ? 0.42f : widget.previewAspectRatio();
                float previewHeight = Math.max(132f, Math.min(520f, (width - 36f) * previewRatio));
                float height = 100f + previewHeight + 78f;
                boolean useLeft = leftY <= rightY;
                float x = useLeft ? left : left + width + gap;
                float y = useLeft ? leftY : rightY;
                rects.add(new RectF(x, y, x + width, y + height));
                if (useLeft) leftY = y + height + 24f;
                else rightY = y + height + 24f;
            }
            return rects;
        }
        for (int i = 0; i < widgets.size(); i++) {
            float y = top + i * SETTINGS_WIDGET_ROW_STEP;
            rects.add(new RectF(48f, y, BASE_WIDTH - 48f, y + 106f));
        }
        return rects;
    }

    private static float settingsWidgetsBottom(List<RectF> widgetRects, float top) {
        if (widgetRects == null || widgetRects.isEmpty()) return top + SETTINGS_WIDGET_ROW_STEP;
        float bottom = top;
        for (RectF rect : widgetRects) {
            if (rect != null) bottom = Math.max(bottom, rect.bottom);
        }
        return bottom;
    }

    private static RectF settingsWidgetButtonRect(RectF item, String viewMode) {
        if (item == null) return new RectF();
        if (WIDGET_VIEW_GRID.equals(viewMode) || WIDGET_VIEW_FLOW.equals(viewMode)) {
            return new RectF(item.right - 176f, item.bottom - 68f, item.right - 18f, item.bottom - 18f);
        }
        return new RectF(BASE_WIDTH - 250f, item.top + 25f, BASE_WIDTH - 48f, item.top + 81f);
    }

    private static RectF settingsWidgetPreviewRect(RectF item, String viewMode) {
        if (item == null) return new RectF();
        if (WIDGET_VIEW_GRID.equals(viewMode)) {
            float side = item.width() - 36f;
            return new RectF(item.left + 18f, item.top + 92f, item.right - 18f, item.top + 92f + side);
        }
        if (WIDGET_VIEW_FLOW.equals(viewMode)) {
            return new RectF(item.left + 18f, item.top + 92f, item.right - 18f, item.bottom - 80f);
        }
        return new RectF(BASE_WIDTH - 408f, item.top + 16f, BASE_WIDTH - 262f, item.top + 90f);
    }

    private static RectF widgetSearchBaseRect() {
        return new RectF(48f, 690f, 686f, 770f);
    }

    private static RectF widgetViewGroupBaseRect() {
        return new RectF(714f, 690f, BASE_WIDTH - 48f, 770f);
    }

    private static RectF widgetViewListBaseRect() {
        return new RectF(726f, 700f, 812f, 760f);
    }

    private static RectF widgetViewGridBaseRect() {
        return new RectF(824f, 700f, 910f, 760f);
    }

    private static RectF widgetViewFlowBaseRect() {
        return new RectF(922f, 700f, 1016f, 760f);
    }

    private static Set<String> readIdSet(String raw) {
        Set<String> out = new HashSet<>();
        if (TextUtils.isEmpty(raw)) return out;
        String[] parts = raw.split("\\n");
        for (String part : parts) {
            String id = part == null ? "" : part.trim();
            if (!TextUtils.isEmpty(id)) out.add(id);
        }
        return out;
    }

    private static String writeIdSet(Set<String> ids) {
        if (ids == null || ids.isEmpty()) return "";
        StringBuilder builder = new StringBuilder();
        for (String id : ids) {
            if (TextUtils.isEmpty(id)) continue;
            if (builder.length() > 0) builder.append('\n');
            builder.append(id.trim());
        }
        return builder.toString();
    }

    private static final class DynamicWidgetInfo {
        private static volatile List<DynamicWidgetInfo> cachedProviderWidgets;
        private static volatile long cachedProviderWidgetsAt;
        private static final Map<String, Bitmap> iconCache = new HashMap<>();
        private static final Map<String, Boolean> lockFeaturePackageCache = new HashMap<>();

        final String id;
        final String packageName;
        final String title;
        final String subtitle;
        final String kind;
        final boolean defaultEnabled;
        final Bitmap artwork;
        final boolean full;
        final ComponentName providerComponent;
        final int lockScreenRank;
        final int minWidthDp;
        final int minHeightDp;
        final long mediaDurationMs;
        final long mediaPositionMs;
        final long mediaUpdatedAtMs;
        final boolean mediaPlaying;
        final boolean mediaRemote;
        final List<String> mediaQueue;

        DynamicWidgetInfo(String id, String packageName, String title, String subtitle, String kind, boolean defaultEnabled, Bitmap artwork) {
            this(id, packageName, title, subtitle, kind, defaultEnabled, artwork, false, null, 0);
        }

        DynamicWidgetInfo(String id, String packageName, String title, String subtitle, String kind, boolean defaultEnabled, Bitmap artwork, boolean full) {
            this(id, packageName, title, subtitle, kind, defaultEnabled, artwork, full, null, 0);
        }

        DynamicWidgetInfo(String id, String packageName, String title, String subtitle, String kind, boolean defaultEnabled, Bitmap artwork, boolean full, ComponentName providerComponent) {
            this(id, packageName, title, subtitle, kind, defaultEnabled, artwork, full, providerComponent, 0);
        }

        DynamicWidgetInfo(String id, String packageName, String title, String subtitle, String kind, boolean defaultEnabled, Bitmap artwork, boolean full, ComponentName providerComponent, int lockScreenRank) {
            this(id, packageName, title, subtitle, kind, defaultEnabled, artwork, full, providerComponent, lockScreenRank, 0, 0);
        }

        DynamicWidgetInfo(String id, String packageName, String title, String subtitle, String kind, boolean defaultEnabled, Bitmap artwork, boolean full, ComponentName providerComponent, int lockScreenRank, int minWidthDp, int minHeightDp) {
            this(id, packageName, title, subtitle, kind, defaultEnabled, artwork, full, providerComponent, lockScreenRank, minWidthDp, minHeightDp, 0L, 0L, 0L, false, false, null);
        }

        DynamicWidgetInfo(
            String id,
            String packageName,
            String title,
            String subtitle,
            String kind,
            boolean defaultEnabled,
            Bitmap artwork,
            boolean full,
            ComponentName providerComponent,
            int lockScreenRank,
            int minWidthDp,
            int minHeightDp,
            long mediaDurationMs,
            long mediaPositionMs,
            long mediaUpdatedAtMs,
            boolean mediaPlaying,
            boolean mediaRemote,
            List<String> mediaQueue
        ) {
            this.id = id == null ? "" : id.trim();
            this.packageName = packageName == null ? "" : packageName.trim();
            this.title = TextUtils.isEmpty(title) ? "Widget aplikasi" : title.trim();
            this.subtitle = TextUtils.isEmpty(subtitle) ? "Tersedia di perangkat" : subtitle.trim();
            this.kind = TextUtils.isEmpty(kind) ? "widget" : kind.trim();
            this.defaultEnabled = defaultEnabled;
            this.artwork = artwork;
            this.full = full;
            this.providerComponent = providerComponent;
            this.lockScreenRank = lockScreenRank;
            this.minWidthDp = Math.max(0, minWidthDp);
            this.minHeightDp = Math.max(0, minHeightDp);
            this.mediaDurationMs = Math.max(0L, mediaDurationMs);
            this.mediaPositionMs = Math.max(0L, mediaPositionMs);
            this.mediaUpdatedAtMs = Math.max(0L, mediaUpdatedAtMs);
            this.mediaPlaying = mediaPlaying;
            this.mediaRemote = mediaRemote;
            this.mediaQueue = mediaQueue == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(mediaQueue));
        }

        boolean isMediaSession() {
            return id.startsWith("media:");
        }

        boolean isMediaControl() {
            return isMediaSession();
        }

        float aspectRatio() {
            if (minWidthDp > 0 && minHeightDp > 0) {
                return Math.max(0.18f, Math.min(1.18f, minHeightDp / (float) minWidthDp));
            }
            String value = (String.valueOf(title) + " " + String.valueOf(id)).toLowerCase(Locale.ROOT);
            if (value.contains("large") || value.contains("4x4")) return 0.82f;
            if (value.contains("2x2")) return 0.70f;
            if (value.contains("small") || value.contains("1x1")) return 0.64f;
            return HOSTED_WIDGET_DEFAULT_HEIGHT / (BASE_WIDTH - 84f);
        }

        float previewAspectRatio() {
            if (artwork != null && !artwork.isRecycled() && artwork.getWidth() > 0 && artwork.getHeight() > 0) {
                return Math.max(0.22f, Math.min(1.05f, artwork.getHeight() / (float) artwork.getWidth()));
            }
            return Math.max(0.24f, Math.min(0.95f, aspectRatio()));
        }

        boolean isMediaPlaying() {
            return mediaPlaying;
        }

        static List<DynamicWidgetInfo> enabledForLockScreen(Context context) {
            List<DynamicWidgetInfo> available = available(context);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean configured = prefs.getBoolean(PREF_WIDGET_CONFIGURED, false);
            Set<String> ids = enabledWidgetIds(prefs, available);
            if (!configured && !ids.isEmpty() && legacyWidgetConfigured(prefs)) {
                configured = true;
                prefs.edit().putBoolean(PREF_WIDGET_CONFIGURED, true).apply();
            }
            if (configured && !ids.isEmpty() && !hasAnyAvailableId(ids, available)) {
                configured = false;
            }
            List<DynamicWidgetInfo> out = new ArrayList<>();
            Set<String> enabledProviderPackages = new HashSet<>();
            for (DynamicWidgetInfo widget : available) {
                boolean enabled = configured ? widgetEnabledByIdOrPackage(ids, widget) : widget.defaultEnabled;
                if (enabled && widget.providerComponent != null && !TextUtils.isEmpty(widget.packageName)) {
                    enabledProviderPackages.add(widget.packageName);
                }
            }
            for (DynamicWidgetInfo widget : available) {
                boolean enabled = widget.isMediaSession() || (configured ? widgetEnabledByIdOrPackage(ids, widget) : widget.defaultEnabled);
                if (enabled) out.add(widget);
            }
            return out;
        }

        static boolean isEnabled(Context context, String id) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean configured = prefs.getBoolean(PREF_WIDGET_CONFIGURED, false);
            List<DynamicWidgetInfo> available = available(context);
            Set<String> ids = enabledWidgetIds(prefs, available);
            if (!configured && !ids.isEmpty() && legacyWidgetConfigured(prefs)) {
                configured = true;
                prefs.edit().putBoolean(PREF_WIDGET_CONFIGURED, true).apply();
            }
            if (configured && !ids.isEmpty() && !hasAnyAvailableId(ids, available)) {
                configured = false;
            }
            for (DynamicWidgetInfo widget : available) {
                if (!widget.id.equals(id)) continue;
                if (widget.isMediaSession()) return true;
                return configured ? widgetEnabledByIdOrPackage(ids, widget) : widget.defaultEnabled;
            }
            return false;
        }

        private static boolean widgetEnabledByIdOrPackage(Set<String> ids, DynamicWidgetInfo widget) {
            if (ids == null || widget == null) return false;
            if (ids.contains(widget.id)) return true;
            if (TextUtils.isEmpty(widget.packageName)) return false;
            if (!"com.spotify.music".equals(widget.packageName)) return false;
            for (String id : ids) {
                if (!TextUtils.isEmpty(id) && id.contains(widget.packageName)) return true;
            }
            return false;
        }

        private static Set<String> enabledWidgetIds(SharedPreferences prefs, List<DynamicWidgetInfo> available) {
            Set<String> ids = readIdSet(prefs.getString(PREF_ENABLED_WIDGET_IDS, ""));
            if (prefs.getBoolean(PREF_WIDGET_LEGACY_MERGED, false)) return ids;
            Set<String> availableIds = new HashSet<>();
            if (available != null) {
                for (DynamicWidgetInfo widget : available) {
                    if (widget != null && !TextUtils.isEmpty(widget.id)) availableIds.add(widget.id);
                }
            }
            String[] legacyKeys = {
                "lock_enabled_widget_ids_v5",
                "lock_enabled_widget_ids_v4",
                "lock_enabled_widget_ids_v3",
                "lock_enabled_widget_ids_v2",
                "lock_enabled_widget_ids_v1"
            };
            boolean changed = false;
            for (String key : legacyKeys) {
                for (String legacyId : readIdSet(prefs.getString(key, ""))) {
                    if (availableIds.contains(legacyId) && ids.add(legacyId)) changed = true;
                }
            }
            SharedPreferences.Editor editor = prefs.edit().putBoolean(PREF_WIDGET_LEGACY_MERGED, true);
            if (changed) editor.putString(PREF_ENABLED_WIDGET_IDS, writeIdSet(ids));
            editor.apply();
            return ids;
        }

        private static boolean legacyWidgetConfigured(SharedPreferences prefs) {
            if (prefs == null) return false;
            return prefs.getBoolean("lock_widget_configured_v5", false)
                || prefs.getBoolean("lock_widget_configured_v4", false)
                || prefs.getBoolean("lock_widget_configured_v3", false)
                || prefs.getBoolean("lock_widget_configured_v2", false)
                || prefs.getBoolean("lock_widget_configured_v1", false);
        }

        private static boolean hasAnyAvailableId(Set<String> ids, List<DynamicWidgetInfo> available) {
            if (ids == null || ids.isEmpty() || available == null || available.isEmpty()) return false;
            for (DynamicWidgetInfo widget : available) {
                if (widget != null && ids.contains(widget.id)) return true;
            }
            return false;
        }

        static List<DynamicWidgetInfo> available(Context context) {
            long now = System.currentTimeMillis();
            List<DynamicWidgetInfo> out = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            addMediaSessions(context, out, seen);
            List<DynamicWidgetInfo> providers = cachedProviderWidgets;
            if (providers == null || now - cachedProviderWidgetsAt >= WIDGET_CACHE_MS) {
                List<DynamicWidgetInfo> providerOnly = new ArrayList<>();
                addWidgetProviders(context, providerOnly, new HashSet<>());
                providers = new ArrayList<>(providerOnly);
                cachedProviderWidgets = providers;
                cachedProviderWidgetsAt = now;
            }
            out.addAll(providers);
            if (out.isEmpty()) {
                out.add(new DynamicWidgetInfo("builtin:music", "", "Kontrol musik", "Tidak ada yang diputar", "music", true, null));
                out.add(new DynamicWidgetInfo("builtin:calendar", "", "Kalender", "Widget kalender belum ditemukan", "calendar", true, null));
            }
            return out;
        }

        static void invalidateCache() {
            cachedProviderWidgets = null;
            cachedProviderWidgetsAt = 0L;
        }

        private static void addMediaSessions(Context context, List<DynamicWidgetInfo> out, Set<String> seen) {
            try {
                MediaSessionManager manager = (MediaSessionManager) context.getSystemService(Context.MEDIA_SESSION_SERVICE);
                if (manager == null) return;
                ComponentName listener = new ComponentName(context, ItsNotificationListenerService.class);
                List<MediaController> sessions = manager.getActiveSessions(listener);
                if (sessions == null) return;
                for (MediaController controller : sessions) {
                    if (controller == null || TextUtils.isEmpty(controller.getPackageName())) continue;
                    MediaMetadata metadata = controller.getMetadata();
                    PlaybackState state = controller.getPlaybackState();
                    if (metadata == null && state == null) continue;
                    String title = metadata == null ? "" : firstNonEmpty(
                        metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
                        metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
                    );
                    String artist = metadata == null ? "" : firstNonEmpty(
                        metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
                        metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
                    );
                    String id = "media:" + controller.getPackageName();
                    if (!seen.add(id)) continue;
                    boolean playing = state != null && state.getState() == PlaybackState.STATE_PLAYING;
                    Bitmap art = metadata == null ? null : metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null && metadata != null) art = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
                    trackPreviousSong(controller.getPackageName(), title, artist, art); // <-- PINDAH KE SINI
                    long duration = metadata == null ? 0L : Math.max(0L, metadata.getLong(MediaMetadata.METADATA_KEY_DURATION));
                    trackPlayHistory(controller.getPackageName(), title, artist, art, duration);
                    long position = state == null ? 0L : Math.max(0L, state.getPosition());
                    long updatedAt = state == null ? 0L : Math.max(0L, state.getLastPositionUpdateTime());
                    boolean remote = false;
                    MediaController.PlaybackInfo playbackInfo = controller.getPlaybackInfo();
                    if (playbackInfo != null) {
                        remote = playbackInfo.getPlaybackType() == MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE;
                    }
                    List<String> queueTitles = mediaQueueTitles(controller);
                    String appName = appName(context, controller.getPackageName(), "Kontrol musik");
                    String cardTitle = TextUtils.isEmpty(title) ? appName : title;
                    String subtitle = TextUtils.isEmpty(artist)
                        ? (playing ? "Sedang diputar" : "Media siap dikontrol")
                        : artist + (playing ? " - diputar" : "");
                    out.add(new DynamicWidgetInfo(
                        id,
                        controller.getPackageName(),
                        cardTitle,
                        subtitle,
                        "media",
                        true,
                        art,
                        false,
                        null,
                        0,
                        0,
                        0,
                        duration,
                        position,
                        updatedAt,
                        playing,
                        remote,
                        queueTitles
                    ));
                }
            } catch (RuntimeException ignored) {
            }
        }

        private static List<String> mediaQueueTitles(MediaController controller) {
            List<String> titles = new ArrayList<>();
            if (controller == null) return titles;
            try {
                List<MediaSession.QueueItem> queue = controller.getQueue();
                Log.d("ITS-MediaQueue", controller.getPackageName() + " queue = " + (queue == null ? "null" : queue.size() + " item"));

                if (queue == null) {
                    nextArtByPackage.remove(controller.getPackageName());
                    return titles;
                }

                int index = 0;
                for (MediaSession.QueueItem item : queue) {
                    if (item == null || item.getDescription() == null) continue;
                    CharSequence title = item.getDescription().getTitle();
                    CharSequence subtitle = item.getDescription().getSubtitle();
                    String value = title == null ? "" : title.toString().trim();
                    String sub = subtitle == null ? "" : subtitle.toString().trim();
                    if (TextUtils.isEmpty(value)) continue;

                    // Ambil bitmap cover dari item riwayat/queue pertama bila aplikasi membagikannya.
                    if (index == 0) {
                        Bitmap nextBitmap = item.getDescription().getIconBitmap();
                        if (nextBitmap != null && !nextBitmap.isRecycled()) {
                            nextArtByPackage.put(controller.getPackageName(), nextBitmap);
                        } else {
                            nextArtByPackage.remove(controller.getPackageName());
                        }
                    }

                    if (!TextUtils.isEmpty(sub)) value = value + " - " + sub;
                    titles.add(value);
                    index++;
                    if (titles.size() >= 5) break;
                }

                if (titles.isEmpty()) {
                    nextArtByPackage.remove(controller.getPackageName());
                }
            } catch (RuntimeException ignored) {
            }
            return titles;
        }

        private static void addWidgetProviders(Context context, List<DynamicWidgetInfo> out, Set<String> seen) {
            List<DynamicWidgetInfo> lockWidgets = new ArrayList<>();
            PackageManager packageManager = context.getPackageManager();
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(context);
                List<AppWidgetProviderInfo> providers = installedWidgetProviders(context, manager);
                if (providers != null) {
                    for (AppWidgetProviderInfo provider : providers) {
                        if (provider == null || provider.provider == null) continue;
                        String packageName = provider.provider.getPackageName();
                        String component = provider.provider.flattenToShortString();
                        String id = "provider:" + component;
                        if (!seen.add(id)) continue;
                        CharSequence rawLabel = provider.loadLabel(packageManager);
                        String label = rawLabel == null ? appName(context, packageName, "Widget aplikasi") : rawLabel.toString();
                        String appName = appName(context, packageName, "Aplikasi");
                        int rank = lockScreenWidgetRank(context, provider, label, packageName);
                        if (rank <= 0) continue;
                        String kind = classifyWidget(label + " " + component, packageName);
                        boolean full = true;
                        String description = providerDescription(context, provider, appName, kind);
                        lockWidgets.add(new DynamicWidgetInfo(
                            id,
                            packageName,
                            label,
                            description,
                            kind,
                            false,
                            providerPreviewBitmap(context, provider),
                            full,
                            provider.provider,
                            rank,
                            providerDimensionDp(context, provider.minWidth),
                            providerDimensionDp(context, provider.minHeight)
                        ));
                    }
                }
            } catch (RuntimeException ignored) {
            }
            addKnownLockWidgetFallbacks(context, lockWidgets, seen);
            Collections.sort(lockWidgets, (left, right) -> right.lockScreenRank - left.lockScreenRank);
            Set<String> listedVariants = new HashSet<>();
            int providerCount = 0;
            int defaultSlots = 0;
            for (DynamicWidgetInfo widget : lockWidgets) {
                String variantKey = normalizedWidgetVariantKey(widget);
                if (!listedVariants.add(variantKey)) continue;
                boolean defaultEnabled = providerCount < defaultSlots && shouldAutoEnableWidgetProvider(widget);
                if (defaultEnabled) providerCount++;
                out.add(new DynamicWidgetInfo(
                    widget.id,
                    widget.packageName,
                    widget.title,
                    widget.subtitle,
                    widget.kind,
                    defaultEnabled,
                    widget.artwork,
                    widget.full,
                    widget.providerComponent,
                    widget.lockScreenRank,
                    widget.minWidthDp,
                    widget.minHeightDp
                ));
            }
        }

        private static String normalizedWidgetVariantKey(DynamicWidgetInfo widget) {
            if (widget == null) return "";
            if ("com.spotify.music".equals(widget.packageName)) return "com.spotify.music:music-control";
            String title = TextUtils.isEmpty(widget.title) ? widget.id : widget.title;
            String normalizedTitle = title
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\p{L}]+", "");
            if (TextUtils.isEmpty(normalizedTitle)) normalizedTitle = widget.id;
            String component = widget.providerComponent == null ? widget.id : widget.providerComponent.getClassName();
            String componentKey = component
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\p{L}]+", "");
            return String.valueOf(widget.packageName) + ":" + normalizedTitle + ":" + componentKey;
        }

        private static String providerDescription(Context context, AppWidgetProviderInfo provider, String appName, String kind) {
            CharSequence description = null;
            if (context != null && provider != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    description = provider.loadDescription(context);
                } catch (RuntimeException ignored) {
                }
            }
            if (!TextUtils.isEmpty(description)) return description.toString().trim();
            int width = provider == null ? 0 : providerDimensionDp(context, provider.minWidth);
            int height = provider == null ? 0 : providerDimensionDp(context, provider.minHeight);
            String type;
            if ("music".equals(kind)) type = "musik";
            else if ("weather".equals(kind)) type = "cuaca";
            else if ("calendar".equals(kind)) type = "kalender";
            else if ("message".equals(kind)) type = "pesan";
            else type = "aplikasi";
            if (width > 0 && height > 0) return "Widget " + type + " - " + width + "x" + height + " dp";
            if (!TextUtils.isEmpty(appName)) return "Widget " + type + " siap ditambahkan";
            return "Widget aplikasi siap ditambahkan";
        }

        private static String semanticWidgetVariant(String raw) {
            String value = String.valueOf(raw).toLowerCase(Locale.ROOT);
            if (value.contains("chatswidget") || value.contains("chatwidget") || value.contains("conversation")) return "chat";
            if (value.contains("contactswidget") || value.contains("contactwidget")) return "contacts";
            if (value.contains("calendar") && value.contains("month")) return "month";
            if (value.contains("calendar") && value.contains("list")) return "list";
            if (value.contains("calendar") && value.contains("countdown")) return "countdown";
            if (value.contains("weather") && value.contains("clock")) return "weather-clock";
            if (value.contains("cover") && !value.contains("discover")) return "cover";
            return "";
        }

        private static Bitmap providerPreviewBitmap(Context context, AppWidgetProviderInfo provider) {
            if (context == null || provider == null) return null;
            Drawable drawable = null;
            try {
                drawable = provider.loadPreviewImage(context, 0);
            } catch (RuntimeException ignored) {
            }
            if (drawable == null && provider.previewImage != 0 && provider.provider != null) {
                try {
                    Resources resources = context.getPackageManager().getResourcesForApplication(provider.provider.getPackageName());
                    drawable = resources.getDrawable(provider.previewImage);
                } catch (RuntimeException ignored) {
                } catch (PackageManager.NameNotFoundException ignored) {
                }
            }
            return drawableToBitmap(drawable, 320);
        }

        private static int providerDimensionDp(Context context, int rawValue) {
            if (context == null || rawValue <= 0) return 0;
            float density = Math.max(0.1f, context.getResources().getDisplayMetrics().density);
            if (rawValue > 4096) {
                if ((rawValue & 0xFF) == TypedValue.COMPLEX_UNIT_DIP) {
                    return Math.max(1, rawValue >> 8);
                }
                try {
                    return Math.max(1, Math.round(TypedValue.complexToDimension(rawValue, context.getResources().getDisplayMetrics()) / density));
                } catch (RuntimeException ignored) {
                }
            }
            return Math.max(1, Math.round(rawValue / density));
        }

        private static void addKnownLockWidgetFallbacks(Context context, List<DynamicWidgetInfo> lockWidgets, Set<String> seen) {
            addKnownLockWidget(context, lockWidgets, seen, "com.eup.hanzii", ".widget.LargeWidget", "Hanzii Dict", "Kamus cepat di layar kunci", "widget", 950);
            addKnownLockWidget(context, lockWidgets, seen, "com.eup.hanzii", ".widget.MediumWidget", "Hanzii Dict", "Kamus cepat di layar kunci", "widget", 940);
            addKnownLockWidget(context, lockWidgets, seen, "com.eup.hanzii", ".widget.SmallWidget", "Hanzii Dict", "Kamus cepat di layar kunci", "widget", 930);
            addKnownLockWidget(context, lockWidgets, seen, "com.spotify.music", "com.spotify.proactiveplatforms.npvwidget.CoverScreenWidgetProvider", "Spotify Cover", "Kontrol musik Spotify", "music", 760);
        }

        private static void addKnownLockWidget(
            Context context,
            List<DynamicWidgetInfo> lockWidgets,
            Set<String> seen,
            String packageName,
            String className,
            String title,
            String subtitle,
            String kind,
            int rank
        ) {
            if (context == null || lockWidgets == null || seen == null || TextUtils.isEmpty(packageName) || TextUtils.isEmpty(className)) return;
            String fullClass = className.startsWith(".") ? packageName + className : className;
            ComponentName componentName = new ComponentName(packageName, fullClass);
            try {
                ActivityInfo receiver = context.getPackageManager().getReceiverInfo(componentName, PackageManager.GET_META_DATA);
                if (receiver == null) return;
                CharSequence label = receiver.loadLabel(context.getPackageManager());
                if (!TextUtils.isEmpty(label)) title = label.toString();
            } catch (RuntimeException ignored) {
                return;
            } catch (PackageManager.NameNotFoundException ignored) {
                return;
            }
            String id = "provider:" + componentName.flattenToShortString();
            if (!seen.add(id)) return;
            lockWidgets.add(new DynamicWidgetInfo(
                id,
                packageName,
                title,
                subtitle,
                kind,
                false,
                null,
                true,
                componentName,
                rank
            ));
        }

        private static boolean hasDefaultEnabled(List<DynamicWidgetInfo> widgets) {
            if (widgets == null) return false;
            for (DynamicWidgetInfo widget : widgets) {
                if (widget != null && widget.defaultEnabled) return true;
            }
            return false;
        }

        private static boolean shouldAutoEnableWidgetProvider(DynamicWidgetInfo widget) {
            return false;
        }

        private static List<AppWidgetProviderInfo> installedWidgetProviders(Context context, AppWidgetManager manager) {
            if (manager == null) return new ArrayList<>();
            List<AppWidgetProviderInfo> out = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            try {
                appendProviderInfos(out, seen, manager.getInstalledProviders());
            } catch (RuntimeException ignored) {
            }
            try {
                PackageManager packageManager = context.getPackageManager();
                List<ResolveInfo> receivers = packageManager.queryBroadcastReceivers(
                    new android.content.Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE),
                    PackageManager.GET_META_DATA
                );
                Set<String> packages = new HashSet<>();
                if (receivers != null) {
                    for (ResolveInfo receiver : receivers) {
                        if (receiver != null && receiver.activityInfo != null && !TextUtils.isEmpty(receiver.activityInfo.packageName)) {
                            packages.add(receiver.activityInfo.packageName);
                            appendProviderInfo(out, seen, parseAppWidgetProviderInfo(context, packageManager, receiver.activityInfo));
                        }
                    }
                }
                for (String packageName : packages) {
                    try {
                        appendProviderInfos(out, seen, manager.getInstalledProvidersForPackage(packageName, android.os.Process.myUserHandle()));
                    } catch (RuntimeException ignored) {
                    }
                }
            } catch (RuntimeException ignored) {
            }
            try {
                PackageManager packageManager = context.getPackageManager();
                List<PackageInfo> packages = packageManager.getInstalledPackages(
                    PackageManager.GET_RECEIVERS
                        | PackageManager.GET_META_DATA
                        | PackageManager.GET_DISABLED_COMPONENTS
                );
                if (packages != null) {
                    for (PackageInfo packageInfo : packages) {
                        if (packageInfo == null || packageInfo.receivers == null) continue;
                        for (ActivityInfo receiver : packageInfo.receivers) {
                            if (receiver == null || receiver.metaData == null) continue;
                            if (!receiver.metaData.containsKey(AppWidgetManager.META_DATA_APPWIDGET_PROVIDER)) continue;
                            appendProviderInfo(out, seen, parseAppWidgetProviderInfo(context, packageManager, receiver));
                        }
                    }
                }
            } catch (RuntimeException ignored) {
            }
            return out;
        }

        private static void appendProviderInfos(List<AppWidgetProviderInfo> out, Set<String> seen, List<AppWidgetProviderInfo> providers) {
            if (out == null || seen == null || providers == null) return;
            for (AppWidgetProviderInfo provider : providers) {
                appendProviderInfo(out, seen, provider);
            }
        }

        private static void appendProviderInfo(List<AppWidgetProviderInfo> out, Set<String> seen, AppWidgetProviderInfo provider) {
            if (out == null || seen == null || provider == null || provider.provider == null) return;
            String key = provider.provider.flattenToString();
            if (TextUtils.isEmpty(key) || !seen.add(key)) return;
            out.add(provider);
        }

        private static AppWidgetProviderInfo parseAppWidgetProviderInfo(Context context, PackageManager packageManager, ActivityInfo receiver) {
            if (context == null || packageManager == null || receiver == null || receiver.metaData == null) return null;
            int resourceId = receiver.metaData.getInt(AppWidgetManager.META_DATA_APPWIDGET_PROVIDER, 0);
            if (resourceId == 0) return null;
            XmlResourceParser parser = null;
            try {
                Resources resources = packageManager.getResourcesForApplication(receiver.applicationInfo);
                parser = resources.getXml(resourceId);
                int type;
                do {
                    type = parser.next();
                } while (type != XmlPullParser.START_TAG && type != XmlPullParser.END_DOCUMENT);
                if (type != XmlPullParser.START_TAG || !"appwidget-provider".equals(parser.getName())) return null;

                AppWidgetProviderInfo info = new AppWidgetProviderInfo();
                info.provider = new ComponentName(receiver.packageName, receiver.name);
                CharSequence label = receiver.loadLabel(packageManager);
                info.label = label == null ? receiver.name : label.toString();
                info.icon = receiver.icon != 0 ? receiver.icon : receiver.applicationInfo.icon;
                info.initialLayout = readResourceAttr(parser, "initialLayout");
                info.initialKeyguardLayout = readResourceAttr(parser, "initialKeyguardLayout");
                info.previewImage = readResourceAttr(parser, "previewImage");
                info.autoAdvanceViewId = readResourceAttr(parser, "autoAdvanceViewId");
                info.minWidth = readDimensionAttr(resources, parser, "minWidth");
                info.minHeight = readDimensionAttr(resources, parser, "minHeight");
                info.minResizeWidth = readDimensionAttr(resources, parser, "minResizeWidth");
                info.minResizeHeight = readDimensionAttr(resources, parser, "minResizeHeight");
                info.resizeMode = readIntAttr(parser, "resizeMode", AppWidgetProviderInfo.RESIZE_NONE);
                info.updatePeriodMillis = readIntAttr(parser, "updatePeriodMillis", 0);
                info.widgetCategory = readIntAttr(parser, "widgetCategory", AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN);
                info.configure = readComponentAttr(receiver.packageName, parser, "configure");
                return info;
            } catch (Exception ignored) {
                return null;
            } finally {
                if (parser != null) parser.close();
            }
        }

        private static int readResourceAttr(XmlResourceParser parser, String name) {
            if (parser == null) return 0;
            return parser.getAttributeResourceValue(ANDROID_NS, name, 0);
        }

        private static int readIntAttr(XmlResourceParser parser, String name, int fallback) {
            if (parser == null) return fallback;
            return parser.getAttributeIntValue(ANDROID_NS, name, fallback);
        }

        private static int readDimensionAttr(Resources resources, XmlResourceParser parser, String name) {
            if (resources == null || parser == null) return 0;
            int resourceId = parser.getAttributeResourceValue(ANDROID_NS, name, 0);
            if (resourceId != 0) {
                try {
                    return resources.getDimensionPixelSize(resourceId);
                } catch (Resources.NotFoundException ignored) {
                }
            }
            return parser.getAttributeIntValue(ANDROID_NS, name, 0);
        }

        private static ComponentName readComponentAttr(String packageName, XmlResourceParser parser, String name) {
            if (TextUtils.isEmpty(packageName) || parser == null) return null;
            String value = parser.getAttributeValue(ANDROID_NS, name);
            if (TextUtils.isEmpty(value)) return null;
            if (value.startsWith(".")) return new ComponentName(packageName, packageName + value);
            if (value.indexOf('/') >= 0) return ComponentName.unflattenFromString(value);
            return new ComponentName(packageName, value);
        }

        private static int lockScreenWidgetRank(Context context, AppWidgetProviderInfo provider, String label, String packageName) {
            if (provider == null || provider.provider == null) return 0;
            if (context != null && context.getPackageName().equals(packageName)) return 0;
            String component = provider.provider.flattenToString();
            String value = (String.valueOf(label) + " " + String.valueOf(component) + " " + String.valueOf(packageName)).toLowerCase(Locale.ROOT);
            int rank = 0;
            boolean explicitLockWidget = false;
            boolean systemPackage = isSystemPackage(context, packageName);
            boolean packageHasLockFeature = !systemPackage && packageAdvertisesLockScreen(context, packageName);
            boolean knownLockWidgetFallback = isKnownLockWidgetFallbackPackage(packageName);
            boolean keyguardCategory = false;
            boolean hasKeyguardLayout = false;
            try {
                keyguardCategory = (provider.widgetCategory & AppWidgetProviderInfo.WIDGET_CATEGORY_KEYGUARD) != 0;
            } catch (RuntimeException ignored) {
            }
            try {
                hasKeyguardLayout = provider.initialKeyguardLayout != 0;
            } catch (RuntimeException ignored) {
            }
            if (value.contains("coverscreen") || value.contains("cover_screen") || value.contains("cover screen")) {
                rank += 190;
                explicitLockWidget = true;
            }
            if (value.contains("coverface") || value.contains("daycover") || value.contains("todaycover") || value.contains("listcover")) {
                rank += 175;
                explicitLockWidget = true;
            }
            if (value.contains("cover") && !value.contains("discover") && !value.contains("recovery")) {
                rank += 145;
                explicitLockWidget = true;
            }
            if (value.contains("keyguard") || value.contains("lockscreen") || value.contains("lock_screen") || value.contains("lock screen")) {
                rank += 170;
                explicitLockWidget = true;
            }
            if (knownLockWidgetFallback) {
                rank += 920;
                explicitLockWidget = true;
            }
            if (value.contains("spotify") && value.contains("npvwidgetprovider")) {
                rank += 1280;
                explicitLockWidget = true;
            }
            if (value.contains("spotify") && (value.contains("spotifywidget") || value.contains("widgetimpl"))) {
                rank += 560;
                explicitLockWidget = true;
            }
            if (value.contains("spotify") && value.contains("cover")) {
                rank += 150;
                explicitLockWidget = true;
            }
            if (keyguardCategory) {
                rank += 90;
                explicitLockWidget = true;
            }
            if (hasKeyguardLayout) {
                rank += packageHasLockFeature ? 70 : 45;
                explicitLockWidget = true;
            }
            if (!explicitLockWidget) {
                if (looksUsefulOnLockScreen(value, systemPackage)) {
                    rank += systemPackage ? 45 : 70;
                } else {
                    rank += systemPackage ? 18 : 34;
                }
            }
            if (value.contains("weather") && value.contains("cover")) rank += 130;
            if ((value.contains("calendar") || value.contains("kalender")) && value.contains("cover")) rank += 125;
            if ((value.contains("contact") || value.contains("dialer") || value.contains("recents")) && value.contains("cover")) rank += 115;
            if (value.contains("chat") || value.contains("message") || value.contains("telegram") || value.contains("whatsapp")) rank += 70;
            if (value.contains("weather") || value.contains("cuaca")) rank += 62;
            if (value.contains("calendar") || value.contains("kalender") || value.contains("agenda")) rank += 56;
            if (value.contains("music") || value.contains("spotify") || value.contains("audio")) rank += 54;
            if (value.contains("battery") || value.contains("baterai") || value.contains("clock") || value.contains("jam")) rank += 42;
            if (value.contains("largewidget") || value.contains("large widget")) rank += 18;
            if (value.contains("mediumwidget") || value.contains("medium widget")) rank += 12;
            if (value.contains("smallwidget") || value.contains("small widget")) rank += 6;
            if (value.contains("searchwidget") || value.contains("bookmark") || value.contains("quickaction") || value.contains("toolbar")) rank -= 120;
            if (rank <= 0) rank = systemPackage ? 3 : 8;
            return rank;
        }

        private static boolean looksUsefulOnLockScreen(String value, boolean systemPackage) {
            if (TextUtils.isEmpty(value)) return false;
            if (value.contains("searchwidget") || value.contains("bookmark") || value.contains("quickaction") || value.contains("toolbar")) return false;
            if (value.contains("weather")
                || value.contains("cuaca")
                || value.contains("calendar")
                || value.contains("kalender")
                || value.contains("agenda")
                || value.contains("chat")
                || value.contains("message")
                || value.contains("telegram")
                || value.contains("whatsapp")
                || value.contains("music")
                || value.contains("audio")
                || value.contains("spotify")
                || value.contains("battery")
                || value.contains("baterai")
                || value.contains("clock")
                || value.contains("jam")
                || value.contains("dictionary")
                || value.contains("hanzii")) {
                return true;
            }
            return !systemPackage;
        }

        private static boolean isKnownLockWidgetFallbackPackage(String packageName) {
            return "com.eup.hanzii".equals(packageName)
                || "com.spotify.music".equals(packageName);
        }

        private static boolean packageAdvertisesLockScreen(Context context, String packageName) {
            if (context == null || TextUtils.isEmpty(packageName)) return false;
            synchronized (lockFeaturePackageCache) {
                Boolean cached = lockFeaturePackageCache.get(packageName);
                if (cached != null) return cached;
            }
            boolean found = false;
            try {
                PackageManager packageManager = context.getPackageManager();
                PackageInfo info = packageManager.getPackageInfo(
                    packageName,
                    PackageManager.GET_ACTIVITIES
                        | PackageManager.GET_RECEIVERS
                        | PackageManager.GET_SERVICES
                        | PackageManager.GET_DISABLED_COMPONENTS
                        | PackageManager.GET_META_DATA
                );
                found = containsLockFeature(info.activities)
                    || containsLockFeature(info.receivers)
                    || containsLockFeature(info.services);
            } catch (RuntimeException ignored) {
            } catch (PackageManager.NameNotFoundException ignored) {
            }
            synchronized (lockFeaturePackageCache) {
                lockFeaturePackageCache.put(packageName, found);
            }
            return found;
        }

        private static boolean isSystemPackage(Context context, String packageName) {
            if (context == null || TextUtils.isEmpty(packageName)) return true;
            try {
                ApplicationInfo info = context.getPackageManager().getApplicationInfo(packageName, 0);
                return (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0
                    || (info.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
            } catch (RuntimeException ignored) {
            } catch (PackageManager.NameNotFoundException ignored) {
            }
            return true;
        }

        private static boolean containsLockFeature(ActivityInfo[] infos) {
            if (infos == null) return false;
            for (ActivityInfo info : infos) {
                if (info != null && looksLikeLockFeature(info.name)) return true;
            }
            return false;
        }

        private static boolean containsLockFeature(ServiceInfo[] infos) {
            if (infos == null) return false;
            for (ServiceInfo info : infos) {
                if (info != null && looksLikeLockFeature(info.name)) return true;
            }
            return false;
        }

        private static boolean looksLikeLockFeature(String name) {
            if (TextUtils.isEmpty(name)) return false;
            String value = name.toLowerCase(Locale.ROOT);
            return value.contains("lock_screen")
                || value.contains("lockscreen")
                || value.contains(".lock.")
                || value.contains(".keyguard.")
                || value.contains("keyguard")
                || value.contains("coverscreen")
                || value.contains("cover_screen");
        }

        private static String classifyWidget(String label, String packageName) {
            String value = (String.valueOf(label) + " " + String.valueOf(packageName)).toLowerCase(Locale.ROOT);
            if (value.contains("weather") || value.contains("cuaca")) return "weather";
            if (value.contains("calendar") || value.contains("kalender") || value.contains("agenda")) return "calendar";
            if (value.contains("spotify") || value.contains("music") || value.contains("musik") || value.contains("audio")) return "music";
            if (value.contains("clock") || value.contains("jam")) return "clock";
            if (value.contains("map") || value.contains("maps") || value.contains("peta")) return "map";
            if (value.contains("message") || value.contains("chat") || value.contains("whatsapp") || value.contains("telegram")) return "message";
            return "widget";
        }

        Bitmap icon(Context context, int size) {
            String cacheKey = (TextUtils.isEmpty(packageName) ? id : packageName) + ":" + size + ":" + (artwork != null);
            synchronized (iconCache) {
                Bitmap cached = iconCache.get(cacheKey);
                if (cached != null && !cached.isRecycled()) return cached;
            }
            Bitmap output = null;
            if (isMediaSession() && artwork != null && !artwork.isRecycled()) {
                output = Bitmap.createScaledBitmap(artwork, size, size, true);
            } else if (!TextUtils.isEmpty(packageName) && size > 0) {
                try {
                    Drawable drawable = context.getPackageManager().getApplicationIcon(packageName);
                    output = drawableToBitmap(drawable, size);
                } catch (PackageManager.NameNotFoundException ignored) {
                    output = null;
                }
            }
            if (output != null) {
                synchronized (iconCache) {
                    if (iconCache.size() > 96) iconCache.clear();
                    iconCache.put(cacheKey, output);
                }
            }
            return output;
        }

        private static String firstNonEmpty(String first, String fallback) {
            if (first != null && !first.trim().isEmpty()) return first.trim();
            return fallback == null ? "" : fallback.trim();
        }

        private static String appName(Context context, String packageName, String fallback) {
            if (TextUtils.isEmpty(packageName)) return fallback == null ? "" : fallback;
            PackageManager manager = context.getPackageManager();
            try {
                CharSequence label = manager.getApplicationLabel(manager.getApplicationInfo(packageName, 0));
                return label == null ? fallback : label.toString();
            } catch (PackageManager.NameNotFoundException ignored) {
                return fallback == null ? "" : fallback;
            }
        }

        private static Bitmap drawableToBitmap(Drawable drawable, int size) {
            if (drawable == null) return null;
            if (drawable instanceof BitmapDrawable) {
                Bitmap source = ((BitmapDrawable) drawable).getBitmap();
                if (source != null && !source.isRecycled()) return Bitmap.createScaledBitmap(source, size, size, true);
            }
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(canvas);
            return bitmap;
        }
    }

    private static final class NotificationInfo {
        private static final Map<String, Bitmap> iconCache = new HashMap<>();

        final String key;
        final String packageName;
        final String title;
        final String text;
        final long time;
        final boolean replyable;
        final boolean clearable;

        NotificationInfo(String key, String packageName, String title, String text, long time, boolean replyable, boolean clearable) {
            this.key = key == null ? "" : key.trim();
            this.packageName = packageName == null ? "" : packageName.trim();
            this.title = title == null ? "" : title.trim();
            this.text = text == null ? "" : text.trim();
            this.time = time;
            this.replyable = replyable;
            this.clearable = clearable;
        }

        static NotificationInfo load(Context context) {
            List<NotificationInfo> list = enabledForLockScreen(context);
            return list.isEmpty() ? null : list.get(0);
        }

        static List<NotificationInfo> loadAll(Context context) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            List<NotificationInfo> out = new ArrayList<>();
            String raw = prefs.getString(PREF_NOTIF_LIST, "");
            if (!TextUtils.isEmpty(raw)) {
                try {
                    JSONArray array = new JSONArray(raw);
                    for (int i = 0; i < array.length() && out.size() < 48; i++) {
                        JSONObject object = array.optJSONObject(i);
                        if (object == null) continue;
                        NotificationInfo info = new NotificationInfo(
                            object.optString("key", ""),
                            object.optString("packageName", ""),
                            object.optString("title", ""),
                            object.optString("text", ""),
                            object.optLong("time", 0L),
                            object.optBoolean("replyable", false),
                            object.optBoolean("clearable", true)
                        );
                        if (!info.empty()) out.add(info);
                    }
                } catch (Exception ignored) {
                }
            }

            if (out.isEmpty()) {
                NotificationInfo info = new NotificationInfo(
                    "",
                    prefs.getString(PREF_NOTIF_PACKAGE, ""),
                    prefs.getString(PREF_NOTIF_TITLE, ""),
                    prefs.getString(PREF_NOTIF_TEXT, ""),
                    prefs.getLong(PREF_NOTIF_TIME, 0L),
                    false,
                    true
                );
                if (!info.empty()) out.add(info);
            }
            return out;
        }

        static List<NotificationInfo> loadReplyable(Context context) {
            List<NotificationInfo> out = new ArrayList<>();
            for (NotificationInfo info : loadAll(context)) {
                if (info != null && info.replyable && !TextUtils.isEmpty(info.key)) out.add(info);
            }
            return out;
        }

        static List<NotificationInfo> enabledForLockScreen(Context context) {
            List<NotificationInfo> available = loadReplyable(context);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean configured = prefs.getBoolean(PREF_NOTIF_CONFIGURED, false);
            Set<String> keys = readIdSet(prefs.getString(PREF_ENABLED_NOTIF_KEYS, ""));
            List<NotificationInfo> out = new ArrayList<>();
            for (NotificationInfo notification : available) {
                boolean enabled = configured ? keys.contains(notification.key) : true;
                if (enabled) out.add(notification);
            }
            return out;
        }

        static boolean isEnabled(Context context, String key) {
            if (TextUtils.isEmpty(key)) return false;
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean configured = prefs.getBoolean(PREF_NOTIF_CONFIGURED, false);
            if (!configured) return true;
            return readIdSet(prefs.getString(PREF_ENABLED_NOTIF_KEYS, "")).contains(key);
        }

        static NotificationInfo firstWithBody(List<NotificationInfo> list) {
            if (list == null) return null;
            for (NotificationInfo item : list) {
                if (item != null && item.hasBody()) return item;
            }
            return null;
        }

        static NotificationInfo firstReplyable(List<NotificationInfo> list) {
            if (list == null) return null;
            for (NotificationInfo item : list) {
                if (item != null && item.replyable && !TextUtils.isEmpty(item.key)) return item;
            }
            return null;
        }

        boolean empty() {
            return TextUtils.isEmpty(packageName) && TextUtils.isEmpty(title) && TextUtils.isEmpty(text);
        }

        boolean hasBody() {
            return !TextUtils.isEmpty(title) || !TextUtils.isEmpty(text);
        }

        String titleText(Context context) {
            if (!TextUtils.isEmpty(title)) return title;
            String appName = appName(context, "");
            return TextUtils.isEmpty(appName) ? "Notifikasi" : appName;
        }

        String detailLine(Context context) {
            if (!TextUtils.isEmpty(title) && !TextUtils.isEmpty(text)) return title + " - " + text;
            if (!TextUtils.isEmpty(title)) return title;
            if (!TextUtils.isEmpty(text)) return text;
            return "Ikon notifikasi aktif";
        }

        String timeText() {
            long value = time > 0L ? time : System.currentTimeMillis();
            return new SimpleDateFormat("HH.mm", new Locale("id", "ID")).format(new Date(value));
        }

        Bitmap icon(Context context, int size) {
            if (TextUtils.isEmpty(packageName) || size <= 0) return null;
            String cacheKey = packageName + ":" + size;
            synchronized (iconCache) {
                Bitmap cached = iconCache.get(cacheKey);
                if (cached != null && !cached.isRecycled()) return cached;
            }
            try {
                Drawable drawable = context.getPackageManager().getApplicationIcon(packageName);
                Bitmap bitmap = drawableToBitmap(drawable, size);
                synchronized (iconCache) {
                    if (iconCache.size() > 64) iconCache.clear();
                    iconCache.put(cacheKey, bitmap);
                }
                return bitmap;
            } catch (PackageManager.NameNotFoundException ignored) {
                return null;
            }
        }

        private String appName(Context context, String fallback) {
            if (TextUtils.isEmpty(packageName)) return "";
            PackageManager manager = context.getPackageManager();
            try {
                CharSequence label = manager.getApplicationLabel(manager.getApplicationInfo(packageName, 0));
                return label == null ? "" : label.toString();
            } catch (PackageManager.NameNotFoundException ignored) {
                return fallback == null ? "" : fallback;
            }
        }

        private static Bitmap drawableToBitmap(Drawable drawable, int size) {
            if (drawable == null) return null;
            if (drawable instanceof BitmapDrawable) {
                Bitmap source = ((BitmapDrawable) drawable).getBitmap();
                if (source != null && !source.isRecycled()) {
                    return Bitmap.createScaledBitmap(source, size, size, true);
                }
            }
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(canvas);
            return bitmap;
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
            return IndonesianObjectLabels.display(label);
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
        final long deviceLastSeen;
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
        private volatile String analysisState1;
        private volatile String analysisState2;
        private volatile String analysisNote1;
        private volatile String analysisNote2;
        private volatile int selectedSlot;
        private volatile long selectedSlotUntil;
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
            long deviceLastSeen,
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
            this.deviceLastSeen = deviceLastSeen;
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
            this.detections1 = new ArrayList<>();
            this.detections2 = new ArrayList<>();
            this.detectorFrameWidth1 = 0;
            this.detectorFrameHeight1 = 0;
            this.detectorFrameWidth2 = 0;
            this.detectorFrameHeight2 = 0;
            this.analysisState1 = TextUtils.isEmpty(image1) ? "empty" : "pending";
            this.analysisState2 = TextUtils.isEmpty(image2) ? "empty" : "pending";
            this.analysisNote1 = "";
            this.analysisNote2 = "";
        }

        static Snapshot fallback() {
            return new Snapshot("", "", "offline", "offline", "offline", "Lokasi sistem", 0L, 0L, "", 0, 0, 0, 0, 0, 0, 0, 0, new ArrayList<>());
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
            String structuredLocation = cleanLocationLabel(locationFromObject(device.optJSONObject("location")));
            String positionLocation = cleanLocationLabel(locationFromObject(device.optJSONObject("position")));
            String deviceRoadLocation = cleanLocationLabel(firstStringAny(device, "roadName", "address", "placeName", "locationName", "raspberryLocation", "deviceLocation", "locationLabel"));
            String datasetLocation = cleanLocationLabel(firstStringAny(dataset, "roadName", "address", "placeName", "locationLabel", "locationName", "raspberryLocation", "deviceLocation"));
            String deviceLocation = cleanLocationLabel(firstStringAny(device, "locationLabel", "locationName", "road", "raspberryLocation", "deviceLocation"));
            String locationLabel = firstNonEmpty(
                deviceRoadLocation,
                firstNonEmpty(
                    structuredLocation,
                    firstNonEmpty(
                        positionLocation,
                        firstNonEmpty(datasetLocation, deviceLocation)
                    )
                )
            );
            String status = firstNonEmpty(
                firstStringAny(device, "status", "systemStatus", "deviceStatus", "state"),
                firstStringAny(dataset, "status", "systemStatus", "deviceStatus", "state")
            );

            return new Snapshot(
                imageValue(dataset, "image1", "gambar1", "snapshot1Url", "image1Url", "frame1", "frame1Url", "nama1"),
                imageValue(dataset, "image2", "gambar2", "snapshot2Url", "image2Url", "frame2", "frame2Url", "nama2"),
                firstNonEmpty(status, "offline"),
                firstNonEmpty(
                    firstStringAny(device, "cameraStatus", "cameraState", "streamStatus"),
                    firstStringAny(dataset, "cameraStatus", "cameraState", "streamStatus")
                ),
                firstNonEmpty(
                    firstStringAny(dataset, "detectorStatus", "aiStatus", "modelStatus"),
                    firstStringAny(device, "detectorStatus", "aiStatus", "modelStatus")
                ),
                firstNonEmpty(locationLabel, "Lokasi sistem"),
                normalizeEpoch(optLongAny(dataset, optLongAny(device, 0L, "lastSeen", "updatedAt"), "updatedAt", "timestamp", "createdAt", "time")),
                latestDeviceTelemetry(device),
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

        int activeSlot(long now) {
            if (selectedSlotUntil > now && (selectedSlot == 1 || selectedSlot == 2)) return selectedSlot;
            return ((now / CAROUSEL_INTERVAL_MS) % 2L) == 0L ? 1 : 2;
        }

        void selectSlot(int slot, long now) {
            selectedSlot = slot == 2 ? 2 : 1;
            selectedSlotUntil = now + CAROUSEL_INTERVAL_MS;
        }

        void copySelectionFrom(Snapshot source) {
            if (source == null) return;
            selectedSlot = source.selectedSlot;
            selectedSlotUntil = source.selectedSlotUntil;
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

        synchronized void updateAnalysis(
            int slot,
            String state,
            String note,
            int frameWidth,
            int frameHeight,
            List<Detection> next
        ) {
            String safeState = TextUtils.isEmpty(state) ? "pending" : state;
            String safeNote = note == null ? "" : note;
            if (slot == 2) {
                analysisState2 = safeState;
                analysisNote2 = safeNote;
            } else {
                analysisState1 = safeState;
                analysisNote1 = safeNote;
            }
            if ("done".equalsIgnoreCase(safeState) || "error".equalsIgnoreCase(safeState)) {
                updateDetections(slot, frameWidth, frameHeight, next);
            }
        }

        synchronized void copySlotAnalysisFrom(Snapshot source, int slot) {
            if (source == null) return;
            updateDetections(slot, source.frameWidthForSlot(slot), source.frameHeightForSlot(slot), source.detectionsForSlot(slot));
            if (slot == 2) {
                analysisState2 = source.analysisStateForSlot(2);
                analysisNote2 = source.analysisNoteForSlot(2);
            } else {
                analysisState1 = source.analysisStateForSlot(1);
                analysisNote1 = source.analysisNoteForSlot(1);
            }
        }

        boolean matchesImage(int slot, int imageLength, String imageTail) {
            String value = slot == 2 ? image2 : image1;
            if (TextUtils.isEmpty(value) || value.length() != imageLength) return false;
            return TextUtils.isEmpty(imageTail) || value.endsWith(imageTail);
        }

        String analysisStateForSlot(int slot) {
            return slot == 2 ? analysisState2 : analysisState1;
        }

        String analysisNoteForSlot(int slot) {
            return slot == 2 ? analysisNote2 : analysisNote1;
        }

        boolean analysisRunningForSlot(int slot) {
            String state = analysisStateForSlot(slot);
            return "pending".equalsIgnoreCase(state)
                || "loading".equalsIgnoreCase(state)
                || "running".equalsIgnoreCase(state);
        }

        boolean analysisCompleteForSlot(int slot) {
            return "done".equalsIgnoreCase(analysisStateForSlot(slot));
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
            long latest = Math.max(deviceLastSeen, updatedAt);
            boolean fresh = latest > 0L && now - latest <= STALE_AFTER_MS && latest - now <= 300_000L;
            boolean deviceFresh = deviceLastSeen > 0L && now - deviceLastSeen <= STALE_AFTER_MS && deviceLastSeen - now <= 300_000L;
            if (statusOnline()) return deviceFresh || (deviceLastSeen <= 0L && fresh);
            return "degraded".equalsIgnoreCase(status)
                && deviceLastSeen > 0L
                && now - deviceLastSeen <= STALE_AFTER_MS
                && deviceLastSeen - now <= 300_000L;
        }

        boolean statusOnline() {
            return "online".equalsIgnoreCase(status)
                || "online".equalsIgnoreCase(cameraStatus)
                || detectorOnline();
        }

        private static long latestDeviceTelemetry(JSONObject device) {
            if (device == null) return 0L;
            long latest = Math.max(
                Math.max(device.optLong("lastSeen", 0L), device.optLong("updatedAt", 0L)),
                Math.max(device.optLong("cameraUpdatedAt", 0L), device.optLong("detectorUpdatedAt", 0L))
            );
            JSONObject camera = device.optJSONObject("camera");
            if (camera != null) latest = Math.max(latest, optLongAny(camera, 0L, "updatedAt", "heartbeatAt"));
            JSONObject runtime = device.optJSONObject("runtime");
            if (runtime != null) latest = Math.max(latest, optLongAny(runtime, 0L, "heartbeatAt", "updatedAt"));
            return normalizeEpoch(latest);
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
            String joined = parts.isEmpty() ? "Tidak ada rincian objek dari RTDB" : TextUtils.join(" • ", parts);
            return "Jumlah objek RTDB: " + detectionCount() + ". " + joined;
        }

        String locationLabel() {
            return TextUtils.isEmpty(locationLabel) ? "Lokasi sistem" : locationLabel;
        }

        String timeText() {
            long latest = Math.max(updatedAt, deviceLastSeen);
            if (latest <= 0L) return "Histori belum sinkron";
            SimpleDateFormat format = new SimpleDateFormat("HH.mm 'WIB' - dd MMM yyyy", new Locale("id", "ID"));
            return format.format(new Date(latest));
        }

        String aiStatus(long now) {
            if (!online(now) && !hasImage()) return "AI menunggu gambar RTDB";
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
            return "Live 10 dtk • " + source + " • " + detectionCount() + " objek • " + ageText;
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

        private static String firstStringAny(JSONObject object, String... keys) {
            if (object == null) return "";
            for (String key : keys) {
                String value = object.optString(key, "");
                if (!TextUtils.isEmpty(value) && !"null".equalsIgnoreCase(value.trim())) return value.trim();
            }
            return "";
        }

        private static String locationFromObject(JSONObject location) {
            if (location == null) return "";
            String label = firstStringAny(location, "label", "name", "title", "address", "roadName", "road", "placeName");
            if (!TextUtils.isEmpty(label)) return label;
            if ((location.has("lat") || location.has("latitude")) && (location.has("lng") || location.has("lon") || location.has("longitude"))) {
                double lat = location.optDouble("lat", location.optDouble("latitude", 0d));
                double lng = location.optDouble("lng", location.optDouble("lon", location.optDouble("longitude", 0d)));
                return String.format(Locale.US, "%.6f, %.6f", lat, lng);
            }
            return "";
        }

        private static String cleanLocationLabel(String value) {
            if (TextUtils.isEmpty(value)) return "";
            String safe = value.trim();
            if (looksLikeGpsWaitingLocation(safe)) return "";
            if ("lokasi sistem".equalsIgnoreCase(safe) || "jalan -".equalsIgnoreCase(safe)) return "";
            return safe;
        }

        private static boolean looksLikeGpsWaitingLocation(String value) {
            if (TextUtils.isEmpty(value)) return false;
            String safe = value.toLowerCase(Locale.ROOT);
            return safe.contains("mencari satelit")
                || safe.contains("gps aktif")
                || safe.contains("gps-waiting")
                || safe.contains("waiting");
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
