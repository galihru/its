using Microsoft.Windows.Widgets.Providers;
using System;
using System.IO;
using System.Threading;

namespace ItsMapsWidgetProvider;

internal delegate WidgetImplBase WidgetCreateDelegate(string widgetId, string initialState);

internal abstract class WidgetImplBase
{
    private Timer? refreshTimer;

    protected WidgetImplBase(string widgetId, string initialState)
    {
        Id = widgetId;
        State = initialState;
    }

    public string Id { get; }
    public string State { get; protected set; }
    public bool IsActivated { get; private set; }
    protected virtual TimeSpan RefreshInterval => TimeSpan.FromSeconds(30);

    public virtual void Activate(WidgetContext widgetContext)
    {
        IsActivated = true;
        UpdateWidget();
        refreshTimer = new Timer(_ => UpdateWidget(), null, TimeSpan.FromSeconds(3), RefreshInterval);
    }

    public virtual void Deactivate()
    {
        IsActivated = false;
        refreshTimer?.Dispose();
        refreshTimer = null;
    }

    public virtual void OnActionInvoked(WidgetActionInvokedArgs actionInvokedArgs)
    {
        if (string.Equals(actionInvokedArgs.Verb, "refresh", StringComparison.OrdinalIgnoreCase))
        {
            UpdateWidget();
        }
    }

    public virtual void OnWidgetContextChanged(WidgetContextChangedArgs contextChangedArgs)
    {
        UpdateWidget();
    }

    public void UpdateWidget()
    {
        try
        {
            var options = new WidgetUpdateRequestOptions(Id)
            {
                Template = GetTemplateForWidget(),
                Data = GetDataForWidget(),
                CustomState = State,
            };
            WidgetManager.GetDefault().UpdateWidget(options);
            WidgetDiagnostics.Write($"UpdateWidget succeeded. id={Id}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ITS widget update failed: {ex.Message}");
            WidgetDiagnostics.Write($"UpdateWidget failed. id={Id}, error={ex}");
        }
    }

    protected static string ReadTemplate(string fileName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Templates", fileName);
        return File.ReadAllText(path);
    }

    public abstract string GetTemplateForWidget();
    public abstract string GetDataForWidget();
}
