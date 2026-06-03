package id.ac.telkomuniversity.its;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends BridgeActivity {
	private boolean bootstrapHandled;
	private static final int REQ_LOCATION = 2001;
	private static final int REQ_BACKGROUND_LOCATION = 2002;
	private static final int REQ_NOTIFICATIONS = 2003;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
	}

	@Override
	public void onResume() {
		super.onResume();
		if (bootstrapHandled) {
			return;
		}
		bootstrapHandled = true;
		getWindow().getDecorView().post(this::bootstrapApp);
	}

	private void bootstrapApp() {
		requestLocationPermissionIfNeeded();
		requestNotificationPermissionIfNeeded();
		requestBackgroundLocationIfNeeded();
		requestIgnoreBatteryOptimizationIfNeeded();
		WidgetRealtimeService.start(this);
	}

	private boolean hasLocationPermission() {
		boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
		boolean coarseGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
		return fineGranted || coarseGranted;
	}

	private void requestLocationPermissionIfNeeded() {
		if (hasLocationPermission()) {
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
			&& ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
			ActivityCompat.requestPermissions(
				this,
				new String[] {
					Manifest.permission.ACCESS_FINE_LOCATION,
					Manifest.permission.ACCESS_COARSE_LOCATION
				},
				REQ_LOCATION
			);
		}
	}

	private void requestBackgroundLocationIfNeeded() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !hasLocationPermission()) {
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
			ActivityCompat.requestPermissions(
				this,
				new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
				REQ_BACKGROUND_LOCATION
			);
		}
	}

	private void requestNotificationPermissionIfNeeded() {
		if (Build.VERSION.SDK_INT < 33) {
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
			ActivityCompat.requestPermissions(
				this,
				new String[] { Manifest.permission.POST_NOTIFICATIONS },
				REQ_NOTIFICATIONS
			);
		}
	}

	private void requestIgnoreBatteryOptimizationIfNeeded() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
			return;
		}
		PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
		if (powerManager == null || powerManager.isIgnoringBatteryOptimizations(getPackageName())) {
			return;
		}
		try {
			Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
			intent.setData(Uri.parse("package:" + getPackageName()));
			startActivity(intent);
		} catch (RuntimeException ignored) {
		}
	}
}
