package id.ac.telkomuniversity.its;

import android.content.Context;

final class LockScreenPreferences {
    private static final String PREFS_NAME = "its_lock_screen";
    private static final String KEY_MONITORING_ENABLED = "monitoring_enabled";

    private LockScreenPreferences() {
    }

    static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_MONITORING_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_MONITORING_ENABLED, enabled)
            .apply();
    }
}
