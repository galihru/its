using System.Windows;
using System.Windows.Threading;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace ItsMapsInstaller;

public partial class App : System.Windows.Application
{
    private async void OnStartup(object sender, StartupEventArgs e)
    {
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        try
        {
            if (HasArg(e.Args, "--silent") || HasArg(e.Args, "/S"))
            {
                await RunSilentInstallAsync(e.Args);
                Shutdown(0);
                return;
            }

            new MainWindow().Show();
        }
        catch (Exception ex)
        {
            ReportStartupFailure(ex, showMessage: !(HasArg(e.Args, "--silent") || HasArg(e.Args, "/S")));
            Shutdown(1);
        }
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        ReportStartupFailure(e.Exception);
        e.Handled = true;
        Current.Shutdown(1);
    }

    private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            ReportStartupFailure(ex);
        }
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        ReportStartupFailure(e.Exception);
        e.SetObserved();
    }

    private static async Task RunSilentInstallAsync(string[] args)
    {
        var allUsers = HasArg(args, "--all-users");
        var runAfterInstall = HasArg(args, "--run-after-install");
        var installPath = ValueArg(args, "--install-dir")
            ?? InstallerServices.GetExistingInstallPath()
            ?? InstallerServices.GetDefaultInstallPath(allUsers);
        var logPath = Path.Combine(Path.GetTempPath(), "ITSMapsWindowsSetup-silent.log");
        var service = new InstallerServices();

        File.AppendAllText(logPath, $"{DateTimeOffset.Now:u} Silent install start: {installPath}{Environment.NewLine}");
        await service.InstallAsync(
            installPath,
            createDesktopShortcut: true,
            runAfterInstall: runAfterInstall,
            new Progress<InstallerProgress>(progress =>
            {
                File.AppendAllText(logPath, $"{DateTimeOffset.Now:u} {progress.Percent:0}% {progress.Message}{Environment.NewLine}");
            }));

        if (runAfterInstall)
        {
            var appExe = Path.Combine(installPath, InstallerServices.AppExeName);
            if (File.Exists(appExe))
            {
                Process.Start(new ProcessStartInfo(appExe) { UseShellExecute = true });
            }
        }

        File.AppendAllText(logPath, $"{DateTimeOffset.Now:u} Silent install complete{Environment.NewLine}");
    }

    private static bool HasArg(string[] args, string name)
    {
        return args.Any(arg => arg.Equals(name, StringComparison.OrdinalIgnoreCase));
    }

    private static string? ValueArg(string[] args, string name)
    {
        var prefix = $"{name}=";
        var value = args.FirstOrDefault(arg => arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
        return value == null ? null : value[prefix.Length..].Trim('"');
    }

    private static void ReportStartupFailure(Exception ex, bool showMessage = true)
    {
        var logPath = Path.Combine(Path.GetTempPath(), "ITSMapsWindowsSetup.log");
        File.WriteAllText(logPath, ex.ToString());

        if (!showMessage) return;

        System.Windows.MessageBox.Show(
            $"ITS Maps Setup gagal dibuka.\n\nLog: {logPath}\n\n{ex.Message}",
            "ITS Maps Setup",
            MessageBoxButton.OK,
            MessageBoxImage.Error);
    }
}
