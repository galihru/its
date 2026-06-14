package id.ac.telkomuniversity.its;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
	private boolean bootstrapHandled;
	private static final int REQ_LOCATION = 2001;
	private static final int REQ_BACKGROUND_LOCATION = 2002;
	private static final int REQ_NOTIFICATIONS = 2003;
	private static final String UPDATE_CHANNEL_ID = "its_app_updates";
	private static final int UPDATE_NOTIFICATION_ID = 2401;
	private final ExecutorService apkExecutor = Executors.newSingleThreadExecutor();

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		createUpdateNotificationChannel();
		registerApkInstallerBridge();
	}

	@Override
	public void onDestroy() {
		apkExecutor.shutdownNow();
		super.onDestroy();
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

	private void registerApkInstallerBridge() {
		try {
			WebView webView = getBridge() == null ? null : getBridge().getWebView();
			if (webView != null) {
				webView.addJavascriptInterface(new ApkInstallerBridge(), "ItsApkInstaller");
			}
		} catch (RuntimeException ignored) {
		}
	}

	public class ApkInstallerBridge {
		@JavascriptInterface
		public void installApk(String url, String fileName) {
			installApkFromUrl(url, fileName);
		}

		@JavascriptInterface
		public void notifyUpdate(String title, String message, String targetUrl) {
			showUpdateNotification(title, message, targetUrl);
		}
	}

	private void installApkFromUrl(String rawUrl, String rawFileName) {
		if (TextUtils.isEmpty(rawUrl)) {
			runOnUiThread(() -> Toast.makeText(this, "Link APK belum tersedia", Toast.LENGTH_SHORT).show());
			return;
		}
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
			requestApkInstallPermission();
			return;
		}

		String url = rawUrl.trim();
		String fileName = safeApkFileName(rawFileName);
		runOnUiThread(() -> Toast.makeText(this, "Mengunduh APK ITS terbaru", Toast.LENGTH_SHORT).show());
		apkExecutor.execute(() -> {
			try {
				File apk = downloadApk(url, fileName);
				runOnUiThread(() -> openPackageInstaller(apk));
			} catch (Exception err) {
				runOnUiThread(() -> Toast.makeText(this, "Gagal mengunduh APK: " + err.getMessage(), Toast.LENGTH_LONG).show());
			}
		});
	}

	private void requestApkInstallPermission() {
		runOnUiThread(() -> {
			Toast.makeText(this, "Izinkan install aplikasi dari ITS, lalu tekan Install terbaru lagi", Toast.LENGTH_LONG).show();
			if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
			try {
				Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
				intent.setData(Uri.parse("package:" + getPackageName()));
				startActivity(intent);
			} catch (ActivityNotFoundException err) {
				startActivity(new Intent(Settings.ACTION_SETTINGS));
			}
		});
	}

	private File downloadApk(String rawUrl, String fileName) throws Exception {
		File dir = new File(getCacheDir(), "apk-updates");
		if (!dir.exists() && !dir.mkdirs()) {
			throw new IllegalStateException("cache tidak siap");
		}
		File output = new File(dir, fileName);
		HttpURLConnection connection = (HttpURLConnection) new URL(rawUrl).openConnection();
		connection.setConnectTimeout(15_000);
		connection.setReadTimeout(90_000);
		connection.setRequestProperty("User-Agent", "ITS-Android-Updater");
		connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
		int code = connection.getResponseCode();
		if (code < 200 || code >= 300) {
			connection.disconnect();
			throw new IllegalStateException("HTTP " + code);
		}
		try (InputStream input = new BufferedInputStream(connection.getInputStream());
			 FileOutputStream outputStream = new FileOutputStream(output, false)) {
			byte[] buffer = new byte[32 * 1024];
			int read;
			while ((read = input.read(buffer)) != -1) {
				outputStream.write(buffer, 0, read);
			}
		} finally {
			connection.disconnect();
		}
		return output;
	}

	private String safeApkFileName(String rawFileName) {
		String name = TextUtils.isEmpty(rawFileName) ? "its-latest.apk" : rawFileName.trim();
		name = name.replaceAll("[^A-Za-z0-9._-]", "_");
		if (TextUtils.isEmpty(name)) name = "its-latest.apk";
		if (!name.toLowerCase(Locale.ROOT).endsWith(".apk")) name += ".apk";
		return name;
	}

	private void openPackageInstaller(File apk) {
		if (apk == null || !apk.exists()) {
			Toast.makeText(this, "File APK tidak ditemukan", Toast.LENGTH_SHORT).show();
			return;
		}
		try {
			Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
			Intent intent = new Intent(Intent.ACTION_VIEW);
			intent.setDataAndType(uri, "application/vnd.android.package-archive");
			intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
			intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			startActivity(intent);
		} catch (Exception err) {
			Toast.makeText(this, "Installer Android tidak dapat dibuka", Toast.LENGTH_LONG).show();
		}
	}

	private void createUpdateNotificationChannel() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
		NotificationChannel channel = new NotificationChannel(
			UPDATE_CHANNEL_ID,
			"Update APK ITS",
			NotificationManager.IMPORTANCE_DEFAULT
		);
		channel.setDescription("Notifikasi APK ITS versi terbaru");
		NotificationManager manager = getSystemService(NotificationManager.class);
		if (manager != null) {
			manager.createNotificationChannel(channel);
		}
	}

	private void showUpdateNotification(String title, String message, String targetUrl) {
		if (Build.VERSION.SDK_INT >= 33
			&& ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
			return;
		}
		String openUrl = TextUtils.isEmpty(targetUrl) ? "its://open?update=1" : targetUrl;
		Intent intent = new Intent(this, MainActivity.class);
		intent.setAction(Intent.ACTION_VIEW);
		intent.setData(Uri.parse(openUrl));
		intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
		PendingIntent pendingIntent = PendingIntent.getActivity(
			this,
			UPDATE_NOTIFICATION_ID,
			intent,
			PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
		);
		NotificationCompat.Builder builder = new NotificationCompat.Builder(this, UPDATE_CHANNEL_ID)
			.setSmallIcon(R.drawable.ic_alert_full_data_bell)
			.setContentTitle(TextUtils.isEmpty(title) ? "Update ITS tersedia" : title)
			.setContentText(TextUtils.isEmpty(message) ? "APK ITS versi terbaru siap diinstall" : message)
			.setStyle(new NotificationCompat.BigTextStyle().bigText(TextUtils.isEmpty(message) ? "APK ITS versi terbaru siap diinstall" : message))
			.setContentIntent(pendingIntent)
			.setAutoCancel(true)
			.setPriority(NotificationCompat.PRIORITY_DEFAULT);
		NotificationManagerCompat.from(this).notify(UPDATE_NOTIFICATION_ID, builder.build());
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
