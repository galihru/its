using Microsoft.Windows.Widgets.Providers;
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace ItsMapsWidgetProvider;

[ComVisible(true)]
[ComDefaultInterface(typeof(IWidgetProvider))]
[Guid("94384B84-2F7F-46AB-8CC8-86D9A3C1BAB7")]
public sealed class WidgetProvider : IWidgetProvider
{
    private static readonly Dictionary<string, WidgetCreateDelegate> WidgetImpls = new()
    {
        [ItsWidget.DefinitionMap] = (widgetId, initialState) => new ItsWidget(widgetId, initialState, ItsWidget.DefinitionMap),
        [ItsWidget.DefinitionTraffic] = (widgetId, initialState) => new ItsWidget(widgetId, initialState, ItsWidget.DefinitionTraffic),
        [ItsWidget.DefinitionAi] = (widgetId, initialState) => new ItsWidget(widgetId, initialState, ItsWidget.DefinitionAi),
        [ItsWidget.DefinitionData] = (widgetId, initialState) => new ItsWidget(widgetId, initialState, ItsWidget.DefinitionData),
    };

    private static readonly Dictionary<string, WidgetImplBase> WidgetInstances = new();
    private static bool recoveredWidgets;

    public WidgetProvider()
    {
        WidgetDiagnostics.Write("WidgetProvider instance created.");
        RecoverRunningWidgets();
    }

    public void CreateWidget(WidgetContext widgetContext)
    {
        WidgetDiagnostics.Write($"CreateWidget id={widgetContext.Id}, definition={widgetContext.DefinitionId}");
        if (!WidgetImpls.TryGetValue(widgetContext.DefinitionId, out var factory))
        {
            throw new InvalidOperationException($"Unknown ITS widget definition: {widgetContext.DefinitionId}");
        }

        var widget = factory(widgetContext.Id, string.Empty);
        WidgetInstances[widgetContext.Id] = widget;
        widget.UpdateWidget();
    }

    public void DeleteWidget(string widgetId, string customState)
    {
        WidgetDiagnostics.Write($"DeleteWidget id={widgetId}");
        if (WidgetInstances.Remove(widgetId, out var widget))
        {
            widget.Deactivate();
        }
    }

    public void OnActionInvoked(WidgetActionInvokedArgs actionInvokedArgs)
    {
        if (WidgetInstances.TryGetValue(actionInvokedArgs.WidgetContext.Id, out var widget))
        {
            widget.OnActionInvoked(actionInvokedArgs);
        }
    }

    public void OnWidgetContextChanged(WidgetContextChangedArgs contextChangedArgs)
    {
        if (WidgetInstances.TryGetValue(contextChangedArgs.WidgetContext.Id, out var widget))
        {
            widget.OnWidgetContextChanged(contextChangedArgs);
        }
    }

    public void Activate(WidgetContext widgetContext)
    {
        WidgetDiagnostics.Write($"Activate id={widgetContext.Id}, definition={widgetContext.DefinitionId}");
        if (!WidgetInstances.TryGetValue(widgetContext.Id, out var widget))
        {
            if (!WidgetImpls.TryGetValue(widgetContext.DefinitionId, out var factory))
            {
                throw new InvalidOperationException($"Unknown ITS widget definition: {widgetContext.DefinitionId}");
            }

            widget = factory(widgetContext.Id, string.Empty);
            WidgetInstances[widgetContext.Id] = widget;
        }

        widget.Activate(widgetContext);
    }

    public void Deactivate(string widgetId)
    {
        WidgetDiagnostics.Write($"Deactivate id={widgetId}");
        if (WidgetInstances.TryGetValue(widgetId, out var widget))
        {
            widget.Deactivate();
        }
    }

    private static void RecoverRunningWidgets()
    {
        if (recoveredWidgets) return;

        try
        {
            var widgetManager = WidgetManager.GetDefault();
            foreach (var widgetInfo in widgetManager.GetWidgetInfos() ?? Array.Empty<WidgetInfo>())
            {
                var context = widgetInfo.WidgetContext;
                if (WidgetInstances.ContainsKey(context.Id)) continue;

                if (WidgetImpls.TryGetValue(context.DefinitionId, out var factory))
                {
                    var widget = factory(context.Id, widgetInfo.CustomState);
                    WidgetInstances[context.Id] = widget;
                    widget.UpdateWidget();
                    WidgetDiagnostics.Write($"Recovered and updated widget id={context.Id}, definition={context.DefinitionId}");
                }
                else
                {
                    widgetManager.DeleteWidget(context.Id);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ITS widget recover failed: {ex.Message}");
            WidgetDiagnostics.Write($"RecoverRunningWidgets failed: {ex}");
        }
        finally
        {
            recoveredWidgets = true;
        }
    }
}
