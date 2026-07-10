using System;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

namespace ItsMapsWidgetProvider;

internal static class ItsLockScreenStatusUpdater
{
    private static readonly object SyncRoot = new();
    private static DateTimeOffset lastUpdate = DateTimeOffset.MinValue;

    public static void Update(ItsWidgetSnapshot snapshot)
    {
        lock (SyncRoot)
        {
            if (DateTimeOffset.UtcNow - lastUpdate < TimeSpan.FromSeconds(15))
            {
                return;
            }

            lastUpdate = DateTimeOffset.UtcNow;
        }

        try
        {
            var activeSeconds = snapshot.TrafficColor switch
            {
                "green" => snapshot.GreenSeconds,
                "yellow" => snapshot.YellowSeconds,
                _ => snapshot.RedSeconds,
            };
            var light = snapshot.TrafficColor switch
            {
                "green" => "\ud83d\udfe2",
                "yellow" => "\ud83d\udfe1",
                _ => "\ud83d\udd34",
            };
            var statusLine = $"ITS: Lampu {light} ({activeSeconds}s) | Kendaraan: {snapshot.VehicleCount} unit";

            var badgeXml = BadgeUpdateManager.GetTemplateContent(BadgeTemplateType.BadgeNumber);
            if (badgeXml.SelectSingleNode("/badge") is XmlElement badgeElement)
            {
                badgeElement.SetAttribute("value", Math.Clamp(snapshot.ObjectCount, 0, 99).ToString());
                BadgeUpdateManager.CreateBadgeUpdaterForApplication().Update(new BadgeNotification(badgeXml));
            }

            var tileXml = TileUpdateManager.GetTemplateContent(TileTemplateType.TileWide310x150Text04);
            var tileText = tileXml.GetElementsByTagName("text");
            if (tileText.Length > 0)
            {
                tileText[0].InnerText = statusLine;
            }
            if (tileText.Length > 1)
            {
                tileText[1].InnerText = snapshot.DetectionSummary;
            }

            TileUpdateManager.CreateTileUpdaterForApplication().Update(new TileNotification(tileXml));
            WidgetDiagnostics.Write($"Lock screen status updated: {statusLine}");
        }
        catch (Exception ex)
        {
            WidgetDiagnostics.Write($"Lock screen status update skipped: {ex}");
        }
    }
}
