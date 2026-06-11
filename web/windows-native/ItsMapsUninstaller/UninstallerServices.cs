using Microsoft.Win32;
using System.Diagnostics;
using System.IO;

namespace ItsMapsUninstaller;

public sealed record UninstallProgress(double Percent, string Message);
public sealed record UninstallOptions(bool RemoveAppData = true, bool RemoveMapCache = true, bool RemoveDeviceConfig = true);

public sealed class UninstallerServices
{
    private const string ProductName = "ITS Maps Windows";
    private const string RegistryKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ITS Maps Windows";

    public UninstallerServices()
    {
        InstallPath = ResolveInstallPath();
    }

    public string InstallPath { get; }

    public Task UninstallAsync(IProgress<UninstallProgress> progress) => UninstallAsync(new UninstallOptions(), progress);

    public async Task UninstallAsync(UninstallOptions options, IProgress<UninstallProgress> progress)
    {
        progress.Report(new UninstallProgress(8, "Menghapus shortcut Desktop dan Start Menu..."));
        DeleteShortcuts();
        await Task.Delay(260);

        progress.Report(new UninstallProgress(24, "Menghapus entry ITS Maps dari Installed apps Windows..."));
        DeleteRegistry();
        await Task.Delay(260);

        if (options.RemoveAppData)
        {
            progress.Report(new UninstallProgress(42, "Menghapus data aplikasi, history, Local Storage, dan cache Electron..."));
            DeleteAppData();
            await Task.Delay(320);
        }

        if (options.RemoveMapCache)
        {
            progress.Report(new UninstallProgress(58, "Menghapus cache peta, POI, tile, dan data offline..."));
            DeleteMapCache();
            await Task.Delay(320);
        }

        if (options.RemoveDeviceConfig)
        {
            progress.Report(new UninstallProgress(74, "Menghapus konfigurasi Raspberry Pi, kamera, dan sesi realtime..."));
            DeleteDeviceConfig();
            await Task.Delay(320);
        }

        progress.Report(new UninstallProgress(88, "Menyiapkan penghapusan file aplikasi dan model AI offline..."));
        await Task.Delay(320);

        progress.Report(new UninstallProgress(96, "Folder instalasi akan dihapus setelah wizard ditutup."));
    }

    public void StartDeferredCleanup()
    {
        var currentExe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(currentExe) || !File.Exists(currentExe))
        {
            return;
        }

        var tempDir = Path.Combine(Path.GetTempPath(), "ITSMapsUninstall", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var cleanupExe = Path.Combine(tempDir, Path.GetFileName(currentExe));
        File.Copy(currentExe, cleanupExe, overwrite: true);

        var pid = Environment.ProcessId.ToString();
        var args = $"--cleanup \"{InstallPath}\" \"{pid}\"";
        Process.Start(new ProcessStartInfo(cleanupExe, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    public static async Task RunCleanupModeAsync(string[] args)
    {
        if (args.Length < 3)
        {
            return;
        }

        var installPath = args[1];
        if (!int.TryParse(args[2], out var pid))
        {
            return;
        }

        try
        {
            var process = Process.GetProcessById(pid);
            await process.WaitForExitAsync();
        }
        catch
        {
            await Task.Delay(900);
        }

        await Task.Delay(300);
        TryDeleteInstallDirectory(installPath);
    }

    private static string ResolveInstallPath()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryKeyPath);
        var registryPath = key?.GetValue("InstallLocation") as string;
        if (!string.IsNullOrWhiteSpace(registryPath))
        {
            return registryPath;
        }

        var exe = Environment.ProcessPath;
        return string.IsNullOrWhiteSpace(exe)
            ? Environment.CurrentDirectory
            : Path.GetDirectoryName(exe) ?? Environment.CurrentDirectory;
    }

    private static void DeleteRegistry()
    {
        try
        {
            Registry.CurrentUser.DeleteSubKeyTree(RegistryKeyPath, throwOnMissingSubKey: false);
        }
        catch
        {
            // Keep uninstall resilient; file cleanup is more important than registry failure.
        }
    }

    private static void DeleteShortcuts()
    {
        var startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", ProductName);
        TryDeleteDirectory(startMenuDir);

        var desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), $"{ProductName}.lnk");
        TryDeleteFile(desktopShortcut);
    }

    private static void DeleteAppData()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ProductName),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), ProductName),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "its-maps-windows"),
            Path.Combine(Path.GetTempPath(), "ITSMapsUninstall")
        };

        foreach (var path in candidates)
        {
            TryDeleteDirectory(path);
        }
    }

    private static void DeleteMapCache()
    {
        var roots = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ProductName),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), ProductName)
        };

        foreach (var root in roots)
        {
            TryDeleteDirectory(Path.Combine(root, "Cache"));
            TryDeleteDirectory(Path.Combine(root, "GPUCache"));
            TryDeleteDirectory(Path.Combine(root, "Network"));
            TryDeleteDirectory(Path.Combine(root, "Local Storage"));
            TryDeleteDirectory(Path.Combine(root, "Session Storage"));
        }
    }

    private static void DeleteDeviceConfig()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "its-maps-windows"),
            Path.Combine(Path.GetTempPath(), "ITSMapsUninstall")
        };

        foreach (var path in candidates)
        {
            TryDeleteDirectory(path);
        }
    }

    private static void TryDeleteInstallDirectory(string installPath)
    {
        var fullPath = Path.GetFullPath(installPath);
        if (!Directory.Exists(fullPath) || !IsSafeInstallDirectory(fullPath))
        {
            return;
        }

        TryDeleteDirectory(fullPath);
    }

    private static bool IsSafeInstallDirectory(string path)
    {
        var root = Path.GetPathRoot(path);
        if (string.IsNullOrWhiteSpace(root))
        {
            return false;
        }

        var trimmedPath = path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var trimmedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return !trimmedPath.Equals(trimmedRoot, StringComparison.OrdinalIgnoreCase)
               && trimmedPath.EndsWith(ProductName, StringComparison.OrdinalIgnoreCase);
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // Best effort cleanup; locked files can be removed by running uninstall again.
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Best effort cleanup; shortcut remnants are harmless.
        }
    }
}
