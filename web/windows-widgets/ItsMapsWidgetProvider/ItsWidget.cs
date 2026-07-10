using System;
using System.Collections.Generic;

namespace ItsMapsWidgetProvider;

internal sealed class ItsWidget : WidgetImplBase
{
    public const string DefinitionMap = "ITS_Map_Widget";
    public const string DefinitionTraffic = "ITS_Traffic_Widget";
    public const string DefinitionAi = "ITS_AI_Widget";
    public const string DefinitionData = "ITS_Data_Widget";

    private static readonly Dictionary<string, string> Templates = new();
    private readonly string definitionId;
    private ItsWidgetViewState viewState;
    private DateTimeOffset dataManualUntil = DateTimeOffset.MinValue;
    private int scanPhase;

    public ItsWidget(string widgetId, string initialState, string definitionId) : base(widgetId, initialState)
    {
        this.definitionId = definitionId;
        viewState = ItsWidgetViewState.Parse(initialState);
    }

    protected override TimeSpan RefreshInterval =>
        definitionId switch
        {
            DefinitionAi => TimeSpan.FromSeconds(1),
            DefinitionTraffic => TimeSpan.FromSeconds(3),
            _ => TimeSpan.FromSeconds(10),
        };

    public override string GetTemplateForWidget()
    {
        var templateName = definitionId switch
        {
            DefinitionMap => "MapWidgetTemplate.json",
            DefinitionTraffic => "TrafficWidgetTemplate.json",
            DefinitionAi => "AiWidgetTemplate.json",
            DefinitionData => DataTemplateName(),
            _ => throw new InvalidOperationException($"Unknown ITS widget definition: {definitionId}"),
        };

        if (!Templates.TryGetValue(templateName, out var template))
        {
            template = ReadTemplate(templateName);
            Templates[templateName] = template;
        }

        return template;
    }

    private string DataTemplateName()
    {
        return Math.Clamp(viewState.DataPhase, 0, ItsWidgetViewState.DataPhaseCount - 1) switch
        {
            1 => "DataMonitorWidgetTemplate.json",
            2 => "DataAlertWidgetTemplate.json",
            _ => "DataWidgetTemplate.json",
        };
    }

    public override string GetDataForWidget()
    {
        scanPhase++;
        var effectiveState = viewState;
        if (definitionId == DefinitionData)
        {
            if (DateTimeOffset.UtcNow >= dataManualUntil)
            {
                var autoPhase = (int)((DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 10) % ItsWidgetViewState.DataPhaseCount);
                effectiveState = viewState with { DataPhase = autoPhase };
                viewState = effectiveState;
                State = viewState.Serialize();
            }
        }
        var data = ItsWidgetDataService.ToJson(definitionId, scanPhase, effectiveState);
        return data;
    }

    public override void OnActionInvoked(Microsoft.Windows.Widgets.Providers.WidgetActionInvokedArgs actionInvokedArgs)
    {
        WidgetDiagnostics.Write($"Action invoked. id={Id}, definition={definitionId}, verb={actionInvokedArgs.Verb}");
        viewState = viewState.ApplyVerb(actionInvokedArgs.Verb, definitionId);
        if (definitionId == DefinitionData && actionInvokedArgs.Verb is "dataCounts" or "dataCamera" or "dataAlerts")
        {
            dataManualUntil = DateTimeOffset.UtcNow.AddSeconds(10);
        }
        State = viewState.Serialize();
        UpdateWidget();
    }
}

internal sealed record ItsWidgetViewState(string MapLocation, bool MapZoomed, string MapTheme, int DataPhase)
{
    public const int DataPhaseCount = 3;
    public static ItsWidgetViewState Default => new("raspi", false, "dark", 0);

    public static ItsWidgetViewState Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return Default;
        var map = "raspi";
        var zoom = false;
        var theme = "dark";
        var phase = 0;
        foreach (var part in raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var pieces = part.Split('=', 2, StringSplitOptions.TrimEntries);
            if (pieces.Length != 2) continue;
            if (pieces[0].Equals("map", StringComparison.OrdinalIgnoreCase))
            {
                map = pieces[1].Equals("user", StringComparison.OrdinalIgnoreCase) ? "user" : "raspi";
            }
            else if (pieces[0].Equals("zoom", StringComparison.OrdinalIgnoreCase))
            {
                zoom = pieces[1] == "1" || pieces[1].Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            else if (pieces[0].Equals("theme", StringComparison.OrdinalIgnoreCase))
            {
                theme = pieces[1].Equals("light", StringComparison.OrdinalIgnoreCase) ? "light" : "dark";
            }
            else if (pieces[0].Equals("phase", StringComparison.OrdinalIgnoreCase) && int.TryParse(pieces[1], out var parsed))
            {
                phase = Math.Clamp(parsed, 0, DataPhaseCount - 1);
            }
        }
        return new ItsWidgetViewState(map, zoom, theme, phase);
    }

    public string Serialize() => $"map={MapLocation};zoom={(MapZoomed ? 1 : 0)};theme={MapTheme};phase={DataPhase}";

    public ItsWidgetViewState ApplyVerb(string? verb, string definitionId)
    {
        if (string.IsNullOrWhiteSpace(verb) || verb.Equals("refresh", StringComparison.OrdinalIgnoreCase)) return this;
        return verb switch
        {
            "mapRaspi" => this with { MapLocation = "raspi" },
            "mapUser" => this with { MapLocation = "user" },
            "mapZoom" => this with { MapZoomed = !MapZoomed },
            "mapTheme" => this with { MapTheme = MapTheme.Equals("light", StringComparison.OrdinalIgnoreCase) ? "dark" : "light" },
            "dataCounts" => this with { DataPhase = 0 },
            "dataChart" => this with { DataPhase = 0 },
            "dataCamera" => this with { DataPhase = 1 },
            "dataCameraAlt" => this with { DataPhase = 1 },
            "dataAlerts" => this with { DataPhase = 2 },
            "dataNext" => this with { DataPhase = (DataPhase + 1) % DataPhaseCount },
            _ => definitionId == ItsWidget.DefinitionData ? this with { DataPhase = (DataPhase + 1) % DataPhaseCount } : this,
        };
    }
}
