package id.ac.telkomuniversity.its;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            WidgetRealtimeService.start(context);
            sendWidgetUpdate(context, MapsWidgetProvider.class);
            sendWidgetUpdate(context, ChartWidgetProvider.class);
            sendWidgetUpdate(context, TrafficDetectionWidgetProvider.class);
            sendWidgetUpdate(context, AlertFullDataWidgetProvider.class);
        }
    }

    private void sendWidgetUpdate(Context context, Class<?> provider) {
        Intent update = new Intent(context, provider);
        update.setAction(android.appwidget.AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        context.sendBroadcast(update);
    }
}
