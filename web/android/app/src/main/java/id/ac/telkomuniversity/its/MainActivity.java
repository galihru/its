package id.ac.telkomuniversity.its;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends BridgeActivity {
	private boolean bootstrapHandled;

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
				2001
			);
		}
	}
}
