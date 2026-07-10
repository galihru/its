package id.ac.telkomuniversity.its;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;

public class ItsNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "ITS-Notification";
    private static final String PREFS_NAME = "its_widget_prefs";
    private static final String KEY_NOTIF_PACKAGE = "lock_notif_package";
    private static final String KEY_NOTIF_TITLE = "lock_notif_title";
    private static final String KEY_NOTIF_TEXT = "lock_notif_text";
    private static final String KEY_NOTIF_TIME = "lock_notif_time";
    private static final String KEY_NOTIF_LIST = "lock_notif_list";
    private static final int MAX_NOTIFICATIONS = 48;
    private static WeakReference<ItsNotificationListenerService> activeService = new WeakReference<>(null);

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        activeService = new WeakReference<>(this);
        syncActiveNotifications();
    }

    @Override
    public void onListenerDisconnected() {
        activeService = new WeakReference<>(null);
        super.onListenerDisconnected();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;
        Notification notification = sbn.getNotification();
        if (notification == null) return;
        rememberNotification(sbn);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        removeStoredNotification(this, sbn.getKey(), sbn.getPackageName());
        refreshWidgets();
    }

    public static boolean replyToNotification(Context context, String key, String message) {
        ItsNotificationListenerService service = activeService == null ? null : activeService.get();
        if (service == null) return false;
        return service.replyInternal(key, message);
    }

    public static boolean dismissNotification(Context context, String key) {
        ItsNotificationListenerService service = activeService == null ? null : activeService.get();
        if (service == null || TextUtils.isEmpty(key)) return false;
        try {
            service.cancelNotification(key);
            removeStoredNotification(service, key, "");
            service.refreshWidgets();
            return true;
        } catch (RuntimeException err) {
            Log.w(TAG, "Gagal menutup notifikasi " + key, err);
            return false;
        }
    }

    public static boolean openNotification(Context context, String key) {
        ItsNotificationListenerService service = activeService == null ? null : activeService.get();
        if (service == null || TextUtils.isEmpty(key)) return false;
        try {
            StatusBarNotification target = service.findActiveNotification(key);
            if (target == null || target.getNotification() == null || target.getNotification().contentIntent == null) {
                return false;
            }
            target.getNotification().contentIntent.send();
            service.cancelNotification(key);
            removeStoredNotification(service, key, target.getPackageName());
            service.refreshWidgets();
            return true;
        } catch (PendingIntent.CanceledException | RuntimeException err) {
            Log.w(TAG, "Gagal membuka notifikasi " + key, err);
            return false;
        }
    }

    private void syncActiveNotifications() {
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification item : active) {
                if (item == null || getPackageName().equals(item.getPackageName())) continue;
                rememberNotification(item);
            }
        } catch (RuntimeException err) {
            Log.w(TAG, "Tidak dapat membaca notifikasi aktif", err);
        }
    }

    private void rememberNotification(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        if (notification == null) return;
        String title = text(notification.extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = text(notification.extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = text(notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (!TextUtils.isEmpty(bigText)) text = bigText;

        CharSequence[] lines = notification.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if ((TextUtils.isEmpty(text)) && lines != null && lines.length > 0) {
            text = text(lines[lines.length - 1]);
        }
        int replyActionIndex = findReplyActionIndex(notification);
        boolean replyable = replyActionIndex >= 0;
        if (!replyable && TextUtils.isEmpty(title) && TextUtils.isEmpty(text)) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        JSONArray list = readList(prefs);
        JSONArray next = new JSONArray();
        try {
            JSONObject item = new JSONObject();
            item.put("key", sbn.getKey());
            item.put("packageName", sbn.getPackageName());
            item.put("title", title);
            item.put("text", text);
            item.put("time", sbn.getPostTime() > 0L ? sbn.getPostTime() : System.currentTimeMillis());
            item.put("replyable", replyable);
            item.put("replyActionIndex", replyActionIndex);
            item.put("clearable", sbn.isClearable());
            next.put(item);

            for (int i = 0; i < list.length() && next.length() < MAX_NOTIFICATIONS; i++) {
                JSONObject existing = list.optJSONObject(i);
                if (existing == null) continue;
                if (sbn.getKey().equals(existing.optString("key", ""))) continue;
                next.put(existing);
            }
        } catch (Exception ignored) {
        }

        prefs.edit()
            .putString(KEY_NOTIF_PACKAGE, sbn.getPackageName())
            .putString(KEY_NOTIF_TITLE, title)
            .putString(KEY_NOTIF_TEXT, text)
            .putLong(KEY_NOTIF_TIME, sbn.getPostTime() > 0L ? sbn.getPostTime() : System.currentTimeMillis())
            .putString(KEY_NOTIF_LIST, next.toString())
            .apply();
        refreshWidgets();
    }

    private static void removeStoredNotification(Context context, String key, String packageName) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        JSONArray list = readList(prefs);
        JSONArray next = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;
            String itemKey = item.optString("key", "");
            String itemPackage = item.optString("packageName", "");
            if (!TextUtils.isEmpty(key) && key.equals(itemKey)) continue;
            if (TextUtils.isEmpty(key) && !TextUtils.isEmpty(packageName) && packageName.equals(itemPackage)) continue;
            next.put(item);
        }

        SharedPreferences.Editor editor = prefs.edit().putString(KEY_NOTIF_LIST, next.toString());
        JSONObject first = next.optJSONObject(0);
        if (first == null) {
            editor.remove(KEY_NOTIF_PACKAGE)
                .remove(KEY_NOTIF_TITLE)
                .remove(KEY_NOTIF_TEXT)
                .remove(KEY_NOTIF_TIME);
        } else {
            editor.putString(KEY_NOTIF_PACKAGE, first.optString("packageName", ""))
                .putString(KEY_NOTIF_TITLE, first.optString("title", ""))
                .putString(KEY_NOTIF_TEXT, first.optString("text", ""))
                .putLong(KEY_NOTIF_TIME, first.optLong("time", 0L));
        }
        editor.apply();
    }

    private String text(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }

    private static JSONArray readList(SharedPreferences prefs) {
        try {
            String raw = prefs.getString(KEY_NOTIF_LIST, "[]");
            return TextUtils.isEmpty(raw) ? new JSONArray() : new JSONArray(raw);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private boolean replyInternal(String key, String message) {
        if (TextUtils.isEmpty(key) || TextUtils.isEmpty(message)) return false;
        try {
            StatusBarNotification target = findActiveNotification(key);
            if (target == null) return false;
            Notification notification = target.getNotification();
            Notification.Action action = findReplyAction(notification);
            if (action == null || action.actionIntent == null || action.getRemoteInputs() == null) return false;

            Intent replyIntent = new Intent();
            Bundle results = new Bundle();
            for (RemoteInput input : action.getRemoteInputs()) {
                if (input == null || TextUtils.isEmpty(input.getResultKey())) continue;
                results.putCharSequence(input.getResultKey(), message);
            }
            RemoteInput.addResultsToIntent(action.getRemoteInputs(), replyIntent, results);
            action.actionIntent.send(this, 0, replyIntent);
            cancelNotification(target.getKey());
            removeStoredNotification(this, target.getKey(), target.getPackageName());
            refreshWidgets();
            return true;
        } catch (PendingIntent.CanceledException | RuntimeException err) {
            Log.w(TAG, "Balasan notifikasi gagal dikirim", err);
            return false;
        }
    }

    private StatusBarNotification findActiveNotification(String key) {
        if (TextUtils.isEmpty(key)) return null;
        StatusBarNotification[] active = getActiveNotifications();
        if (active == null) return null;
        for (StatusBarNotification item : active) {
            if (item != null && key.equals(item.getKey())) return item;
        }
        return null;
    }

    private int findReplyActionIndex(Notification notification) {
        if (notification == null || notification.actions == null) return -1;
        for (int i = 0; i < notification.actions.length; i++) {
            Notification.Action action = notification.actions[i];
            if (action != null && hasFreeFormRemoteInput(action)) return i;
        }
        return -1;
    }

    private Notification.Action findReplyAction(Notification notification) {
        if (notification == null || notification.actions == null) return null;
        for (Notification.Action action : notification.actions) {
            if (action != null && hasFreeFormRemoteInput(action)) return action;
        }
        return null;
    }

    private boolean hasFreeFormRemoteInput(Notification.Action action) {
        RemoteInput[] inputs = action.getRemoteInputs();
        if (inputs == null || inputs.length == 0) return false;
        for (RemoteInput input : inputs) {
            if (input != null && input.getAllowFreeFormInput()) return true;
        }
        return true;
    }

    private void refreshWidgets() {
        Intent trafficUpdate = new Intent(this, TrafficDetectionWidgetProvider.class);
        trafficUpdate.setAction("id.ac.telkomuniversity.its.action.TRAFFIC_DETECTION_REFRESH");
        sendBroadcast(trafficUpdate);

        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        ComponentName traffic = new ComponentName(this, TrafficDetectionWidgetProvider.class);
        manager.notifyAppWidgetViewDataChanged(manager.getAppWidgetIds(traffic), android.R.id.list);
    }
}
