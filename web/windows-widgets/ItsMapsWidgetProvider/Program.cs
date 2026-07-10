using Microsoft.Windows.Widgets.Providers;
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using WidgetHelper;

namespace ItsMapsWidgetProvider;

public static class Program
{
    [MTAThread]
    private static void Main(string[] args)
    {
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
            WidgetDiagnostics.Write($"Unhandled exception: {eventArgs.ExceptionObject}");
        WidgetDiagnostics.Write($"Provider process started. pid={Environment.ProcessId}, args={string.Join(" ", args)}");

        if (args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
        {
            RunSelfTest();
            return;
        }

        if (args.Length == 0 || !string.Equals(args[0], "-RegisterProcessAsComServer", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        WinRT.ComWrappersSupport.InitializeComWrappers();
        using var manager = RegistrationManager<WidgetProvider>.RegisterProvider();
        WidgetDiagnostics.Write("COM provider registered.");

        try
        {
            foreach (var widgetId in WidgetManager.GetDefault().GetWidgetIds() ?? Array.Empty<string>())
            {
                Console.WriteLine($"ITS widget active: {widgetId}");
                WidgetDiagnostics.Write($"Existing widget: {widgetId}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ITS widget recovery skipped: {ex.Message}");
            WidgetDiagnostics.Write($"Widget recovery skipped: {ex}");
        }

        using var disposedEvent = manager.GetDisposedEvent();
        disposedEvent.WaitOne();
    }

    private static void RunSelfTest()
    {
        var definitions = new[]
        {
            ItsWidget.DefinitionMap,
            ItsWidget.DefinitionTraffic,
            ItsWidget.DefinitionAi,
            ItsWidget.DefinitionData,
        };

        foreach (var definition in definitions)
        {
            var widget = new ItsWidget($"self-test-{definition}", "", definition);
            var templateJson = widget.GetTemplateForWidget();
            if (templateJson.Contains("widgetImage", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"{definition} template still uses monolithic widgetImage.");
            }

            using var template = JsonDocument.Parse(templateJson);
            using var data = JsonDocument.Parse(widget.GetDataForWidget());
            var root = data.RootElement;
            var imageLength = root.TryGetProperty("cameraImage", out var image) ? image.GetString()?.Length ?? 0 : 0;
            var cameraFrameLength = root.TryGetProperty("cameraFrame", out var cameraFrame) ? cameraFrame.GetString()?.Length ?? 0 : 0;
            var mapFrameLength = root.TryGetProperty("mapImage", out var mapFrame) ? mapFrame.GetString()?.Length ?? 0 : 0;
            if (root.TryGetProperty("cameraFrame", out var previewCamera))
            {
                WritePreview($"{definition}-camera", previewCamera.GetString());
            }
            if (root.TryGetProperty("mapImage", out var previewMap))
            {
                WritePreview($"{definition}-map", previewMap.GetString());
            }
            if (root.TryGetProperty("chartImage", out var previewChart))
            {
                WritePreview($"{definition}-chart", previewChart.GetString());
            }
            Console.WriteLine($"{definition}: template={template.RootElement.GetProperty("type").GetString()}, data=valid, sourceImage={imageLength}, cameraFrame={cameraFrameLength}, mapFrame={mapFrameLength}");
        }

        var ai = new ItsWidget("self-test-ai-animation", "", ItsWidget.DefinitionAi);
        for (var frame = 0; frame < 4; frame++)
        {
            using var data = JsonDocument.Parse(ai.GetDataForWidget());
            WritePreview($"{ItsWidget.DefinitionAi}_frame_{frame + 1}", data.RootElement.GetProperty("cameraFrame").GetString());
            Console.WriteLine($"AI_FRAME_{frame + 1}=cameraFrame");
        }

        for (var frame = 0; frame < ItsWidgetViewState.DataPhaseCount; frame++)
        {
            var state = new ItsWidgetViewState("raspi", false, "dark", frame);
            var widget = new ItsWidget($"self-test-data-{frame + 1}", state.Serialize(), ItsWidget.DefinitionData);
            var templateJson = widget.GetTemplateForWidget();
            if (templateJson.Contains("widgetImage", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Data phase {frame + 1} template still uses monolithic widgetImage.");
            }

            using var template = JsonDocument.Parse(templateJson);
            using var data = JsonDocument.Parse(widget.GetDataForWidget());
            if (data.RootElement.TryGetProperty("cameraFrame", out var dataCamera))
            {
                WritePreview($"{ItsWidget.DefinitionData}_phase_{frame + 1}", dataCamera.GetString());
            }
            Console.WriteLine($"DATA_PHASE_{frame + 1}={data.RootElement.GetProperty("dataPhase").GetString()}, template={template.RootElement.GetProperty("type").GetString()}");
        }
    }

    private static void WritePreview(string definition, string? dataUri)
    {
        if (string.IsNullOrWhiteSpace(dataUri)) return;
        var comma = dataUri.IndexOf(',');
        if (comma < 0) return;
        var path = Path.Combine(Path.GetTempPath(), $"its-widget-{definition}.png");
        File.WriteAllBytes(path, Convert.FromBase64String(dataUri[(comma + 1)..]));
        Console.WriteLine($"PREVIEW={path}");
    }
}
