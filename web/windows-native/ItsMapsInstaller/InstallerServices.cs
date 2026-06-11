using Microsoft.Win32;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

namespace ItsMapsInstaller;

internal sealed record InstallerProgress(double Percent, string Message);

internal sealed class InstallerServices
{
    private const string ProductName = "ITS Maps Windows";
    private const string Version = "1.0.13";
    private const string Publisher = "Hanifa Septhi Larasati - Telkom University";
    private const string RegistryKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ITS Maps Windows";

    public static string GetDefaultInstallPath(bool allUsers)
    {
        var root = allUsers
            ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
        return Path.Combine(root, ProductName);
    }

    public async Task InstallAsync(string installPath, bool createDesktopShortcut, bool runAfterInstall, IProgress<InstallerProgress> progress)
    {
        installPath = Path.GetFullPath(installPath);
        ValidateInstallPath(installPath);

        progress.Report(new InstallerProgress(4, "Menyiapkan folder instalasi..."));
        PrepareInstallDirectory(installPath);

        progress.Report(new InstallerProgress(10, "Mengekstrak aplikasi, model AI, data peta, dan kamera..."));
        await ExtractPayloadAsync(installPath, progress);

        progress.Report(new InstallerProgress(82, "Menyiapkan uninstaller..."));
        await WriteUninstallerAsync(installPath);

        progress.Report(new InstallerProgress(88, "Mendaftarkan aplikasi di Windows..."));
        RegisterInstalledApp(installPath);

        progress.Report(new InstallerProgress(94, "Membuat shortcut..."));
        CreateShortcuts(installPath, createDesktopShortcut);

        progress.Report(new InstallerProgress(100, runAfterInstall ? "Siap menjalankan aplikasi..." : "Instalasi selesai."));
    }

    private static void ValidateInstallPath(string installPath)
    {
        if (string.IsNullOrWhiteSpace(installPath))
        {
            throw new InvalidOperationException("Folder instalasi tidak boleh kosong.");
        }

        var root = Path.GetPathRoot(installPath);
        if (string.IsNullOrWhiteSpace(root) || installPath.TrimEnd(Path.DirectorySeparatorChar).Equals(root.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Folder instalasi tidak valid.");
        }
    }

    private static void PrepareInstallDirectory(string installPath)
    {
        Directory.CreateDirectory(installPath);

        foreach (var directory in Directory.EnumerateDirectories(installPath))
        {
            Directory.Delete(directory, recursive: true);
        }

        foreach (var file in Directory.EnumerateFiles(installPath))
        {
            File.Delete(file);
        }
    }

    private static async Task ExtractPayloadAsync(string installPath, IProgress<InstallerProgress> progress)
    {
        var safeInstallRoot = installPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        await using var payload = GetRequiredResource("app.zip");
        using var archive = new ZipArchive(payload, ZipArchiveMode.Read);
        var entries = archive.Entries.ToArray();
        var totalFiles = Math.Max(1, entries.Count(entry => !string.IsNullOrEmpty(entry.Name)));
        var extractedFiles = 0;

        foreach (var entry in entries)
        {
            var destinationPath = Path.GetFullPath(Path.Combine(installPath, entry.FullName));
            if (!destinationPath.StartsWith(safeInstallRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Payload instalasi berisi path yang tidak aman.");
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(destinationPath);
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
            entry.ExtractToFile(destinationPath, overwrite: true);
            extractedFiles++;

            if (extractedFiles % 12 == 0 || extractedFiles == totalFiles)
            {
                var percent = 10 + (extractedFiles / (double)totalFiles * 72);
                progress.Report(new InstallerProgress(percent, $"Menyalin {InstallComponentFor(entry.FullName)}... {extractedFiles}/{totalFiles}"));
                await Task.Yield();
            }
        }
    }

    private static string InstallComponentFor(string entryName)
    {
        var lower = entryName.Replace('\\', '/').ToLowerInvariant();
        if (lower.Contains("yolo") || lower.EndsWith(".onnx")) return "model AI YOLO offline";
        if (lower.Contains("itscontroller") || lower.Contains("controller") || lower.EndsWith(".jar")) return "controller Raspberry Pi";
        if (lower.Contains("/data/") || lower.Contains("poi") || lower.Contains("map")) return "data peta dan POI";
        if (lower.Contains("hls") || lower.Contains("camera") || lower.Contains("webrtc")) return "modul kamera realtime";
        if (lower.EndsWith(".exe") || lower.Contains("electron")) return "runtime aplikasi Windows";
        if (lower.EndsWith(".png") || lower.EndsWith(".svg") || lower.EndsWith(".ico")) return "asset UI dan ikon";
        return "file aplikasi";
    }

    private static async Task WriteUninstallerAsync(string installPath)
    {
        await using var uninstaller = GetRequiredResource("uninstaller.exe");
        var destination = Path.Combine(installPath, "Uninstall ITS Maps.exe");
        await using var output = File.Create(destination);
        await uninstaller.CopyToAsync(output);
    }

    private static Stream GetRequiredResource(string logicalName)
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(logicalName);
        if (stream == null)
        {
            throw new InvalidOperationException($"Resource installer '{logicalName}' tidak ditemukan. Build ulang installer custom.");
        }

        return stream;
    }

    private static void RegisterInstalledApp(string installPath)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RegistryKeyPath);
        if (key == null)
        {
            throw new InvalidOperationException("Gagal menulis registry Installed apps.");
        }

        var appExe = Path.Combine(installPath, "ITS Maps Windows.exe");
        var uninstallerExe = Path.Combine(installPath, "Uninstall ITS Maps.exe");
        key.SetValue("DisplayName", ProductName, RegistryValueKind.String);
        key.SetValue("DisplayVersion", Version, RegistryValueKind.String);
        key.SetValue("Publisher", Publisher, RegistryValueKind.String);
        key.SetValue("InstallLocation", installPath, RegistryValueKind.String);
        key.SetValue("DisplayIcon", $"{appExe},0", RegistryValueKind.String);
        key.SetValue("UninstallString", $"\"{uninstallerExe}\"", RegistryValueKind.String);
        key.SetValue("QuietUninstallString", $"\"{uninstallerExe}\" --silent", RegistryValueKind.String);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        key.SetValue("EstimatedSize", EstimateSizeKb(installPath), RegistryValueKind.DWord);
    }

    private static int EstimateSizeKb(string installPath)
    {
        try
        {
            var bytes = Directory.EnumerateFiles(installPath, "*", SearchOption.AllDirectories)
                .Sum(file => new FileInfo(file).Length);
            return (int)Math.Min(int.MaxValue, bytes / 1024);
        }
        catch
        {
            return 0;
        }
    }

    private static void CreateShortcuts(string installPath, bool createDesktopShortcut)
    {
        var appExe = Path.Combine(installPath, "ITS Maps Windows.exe");
        var uninstallExe = Path.Combine(installPath, "Uninstall ITS Maps.exe");
        var startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", ProductName);
        Directory.CreateDirectory(startMenuDir);

        CreateShortcut(Path.Combine(startMenuDir, $"{ProductName}.lnk"), appExe, installPath, "Buka ITS Maps Windows");
        CreateShortcut(Path.Combine(startMenuDir, "Uninstall ITS Maps.lnk"), uninstallExe, installPath, "Uninstall ITS Maps Windows");

        if (createDesktopShortcut)
        {
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            CreateShortcut(Path.Combine(desktop, $"{ProductName}.lnk"), appExe, installPath, "Buka ITS Maps Windows");
        }
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory, string description)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("WScript.Shell tidak tersedia.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDirectory;
        shortcut.Description = description;
        shortcut.IconLocation = $"{targetPath},0";
        shortcut.Save();
    }
}
