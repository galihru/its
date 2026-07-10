using System;
using System.IO;

namespace ItsMapsWidgetProvider;

internal static class WidgetDiagnostics
{
    private static readonly object SyncRoot = new();
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), "its-maps-widget-provider.log");

    public static void Write(string message)
    {
        try
        {
            lock (SyncRoot)
            {
                File.AppendAllText(LogPath, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Diagnostics must never interrupt widget activation.
        }
    }
}
