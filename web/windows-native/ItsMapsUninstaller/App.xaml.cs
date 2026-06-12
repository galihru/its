using System.Windows;

namespace ItsMapsUninstaller;

public partial class App : Application
{
    private async void OnStartup(object sender, StartupEventArgs e)
    {
        if (e.Args.Length > 0 && e.Args[0].Equals("--cleanup", StringComparison.OrdinalIgnoreCase))
        {
            await UninstallerServices.RunCleanupModeAsync(e.Args);
            Shutdown();
            return;
        }

        var service = new UninstallerServices();
        if (e.Args.Any(arg => arg.Equals("--silent", StringComparison.OrdinalIgnoreCase)))
        {
            await service.UninstallAsync(new Progress<UninstallProgress>());
            service.StartDeferredCleanup();
            Shutdown();
            return;
        }

        var window = new MainWindow(service);
        window.Show();
    }
}
