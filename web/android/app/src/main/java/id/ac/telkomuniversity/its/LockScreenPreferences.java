package id.ac.telkomuniversity.its;

import android.content.Context;

final class LockScreenPreferences {
    private static final String PREFS_NAME = "its_lock_screen";
    private static final String KEY_MONITORING_ENABLED = "monitoring_enabled";
    private static final String KEY_USER_CONFIGURED = "user_configured_v2";

    private LockScreenPreferences() {
    }

    static boolean isEnabled(Context context) {
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return preferences.getBoolean(KEY_USER_CONFIGURED, false)
            && preferences.getBoolean(KEY_MONITORING_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_MONITORING_ENABLED, enabled)
            .putBoolean(KEY_USER_CONFIGURED, true)
            .apply();
    }
}
