using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace ItsMapsWidgetProvider;

internal sealed record ItsWidgetSnapshot(
    string Label,
    string Status,
    string Location,
    string Coordinates,
    double? Latitude,
    double? Longitude,
    long UpdatedAt,
    int VehicleCount,
    int ObjectCount,
    string TrafficColor,
    int RedSeconds,
    int YellowSeconds,
    int GreenSeconds,
    int Car,
    int Motorcycle,
    int Bus,
    int Truck,
    int Bicycle,
    string CameraImage,
    string CameraImage2,
    string AiStatus,
    string OtherSummary,
    string DetectionSummary,
    IReadOnlyList<ItsWidgetDetection> Detections,
    IReadOnlyList<ItsWidgetChartPoint> ChartPoints,
    bool HasData
);

internal sealed record ItsWidgetUserPosition(double Latitude, double Longitude, double Accuracy, long UpdatedAt);
internal sealed record ItsWidgetDetection(string Label, double Confidence, double X, double Y, double Width, double Height, bool Vehicle);
internal sealed record ItsWidgetChartPoint(long UpdatedAt, int VehicleCount, string TrafficColor, int ActiveSeconds, int RedSeconds, int YellowSeconds, int GreenSeconds);

internal static class ItsWidgetDataService
{
    private const string DevicesUrl = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
    private const string DesktopClientsUrl = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/desktopClients.json";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly object CacheLock = new();
    private static ItsWidgetSnapshot? cachedSnapshot;
    private static DateTimeOffset cachedAt = DateTimeOffset.MinValue;
    private static ItsWidgetUserPosition? cachedUserPosition;
    private static DateTimeOffset cachedUserAt = DateTimeOffset.MinValue;
    private static readonly List<ItsWidgetChartPoint> ChartHistory = new();
    private static long lastChartKey;

    public static ItsWidgetSnapshot GetSnapshot()
    {
        lock (CacheLock)
        {
            if (cachedSnapshot is not null && DateTimeOffset.UtcNow - cachedAt < TimeSpan.FromSeconds(12))
            {
                return cachedSnapshot;
            }
        }

        var snapshot = AttachChartHistory(FetchSnapshotAsync().GetAwaiter().GetResult());
        lock (CacheLock)
        {
            cachedSnapshot = snapshot;
            cachedAt = DateTimeOffset.UtcNow;
        }
        return snapshot;
    }

    public static string ToJson(string definitionId, int scanPhase, ItsWidgetViewState viewState)
    {
        var snapshot = GetSnapshot();
        var color = snapshot.TrafficColor switch
        {
            "green" => "Good",
            "yellow" => "Warning",
            _ => "Attention",
        };

        var chartPulse = Math.Abs(scanPhase) % 4;
        var chartFrame = ChartFrame(snapshot, -1);
        var cameraImage = CameraImageFor(snapshot, scanPhase);
        var userPosition = viewState.MapLocation == "user" ? GetUserPosition() ?? DefaultUserPosition() : null;
        var mapLat = userPosition?.Latitude ?? snapshot.Latitude;
        var mapLng = userPosition?.Longitude ?? snapshot.Longitude;
        var mapUsesUser = viewState.MapLocation == "user";
        var dataPanel = DataPanelFor(viewState.DataPhase, snapshot, cameraImage);
        var cameraFrame = ItsWidgetMediaRenderer.RenderCameraFrame(snapshot, scanPhase, cameraImage);
        var mapFrame = ItsWidgetMediaRenderer.RenderCartoMap(snapshot, viewState, userPosition, mapLat, mapLng);
        var chartImage = ItsWidgetMediaRenderer.RenderMiniChart(snapshot, chartPulse, true);
        var mapUserButton = ItsWidgetMediaRenderer.RenderMapControlButton("user", mapUsesUser, false, snapshot.TrafficColor);
        var mapRaspiButton = ItsWidgetMediaRenderer.RenderMapControlButton("traffic", !mapUsesUser, false, snapshot.TrafficColor);
        var mapZoomButton = ItsWidgetMediaRenderer.RenderMapControlButton("zoom", viewState.MapZoomed, viewState.MapZoomed, snapshot.TrafficColor);
        var activeSeconds = ActiveTrafficSeconds(snapshot);
        var lockScreenLine = $"ITS: Lampu {TrafficGlyph(snapshot.TrafficColor)} ({activeSeconds}s) | Kendaraan: {snapshot.VehicleCount} unit";
        ItsLockScreenStatusUpdater.Update(snapshot);
        var dataPhaseName = Math.Clamp(viewState.DataPhase, 0, ItsWidgetViewState.DataPhaseCount - 1) switch
        {
            0 => ((DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 10) % 2 == 0 ? "Data" : "Grafik"),
            1 => "Pemantauan",
            _ => "Notifikasi",
        };
        var detectionLead = snapshot.Detections.FirstOrDefault() ?? new ItsWidgetDetection("traffic light", 0.88, 0, 0, 0, 0, false);
        var trafficColorHex = snapshot.TrafficColor switch
        {
            "green" => "#16a34a",
            "yellow" => "#ca8a04",
            _ => "#e11d48",
        };

        var data = new JsonObject
        {
            ["appName"] = "ITS Maps",
            ["developer"] = "Hanifa Septhi Larasati",
            ["label"] = snapshot.Label,
            ["status"] = snapshot.HasData ? snapshot.Status : "menunggu",
            ["statusColor"] = color,
            ["statusLabel"] = (snapshot.HasData ? snapshot.Status : "menunggu").ToUpperInvariant(),
            ["statusTextColor"] = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "Good" : "Attention",
            ["statusDetail"] = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "RTDB tersinkron realtime" : "Raspberry offline atau data mulai basi",
            ["location"] = snapshot.Location,
            ["coordinates"] = snapshot.Coordinates,
            ["mapImage"] = mapFrame,
            ["mapUserButton"] = mapUserButton,
            ["mapRaspiButton"] = mapRaspiButton,
            ["mapZoomButton"] = mapZoomButton,
            ["mapZoomAction"] = viewState.MapZoomed ? "Zoom -" : "Zoom +",
            ["mapThemeAction"] = viewState.MapTheme.Equals("light", StringComparison.OrdinalIgnoreCase) ? "Peta gelap" : "Peta terang",
            ["mapThemeLabel"] = viewState.MapTheme.Equals("light", StringComparison.OrdinalIgnoreCase) ? "Light" : "Dark",
            ["mapModeLabel"] = mapUsesUser ? "USER" : "TRAFFIC",
            ["mapRaspiChoice"] = viewState.MapLocation == "raspi" ? "Traffic aktif" : "Titik traffic",
            ["mapUserChoice"] = viewState.MapLocation == "user" ? "User aktif" : "Lokasi saya",
            ["mapRaspiColor"] = viewState.MapLocation == "raspi" ? "Good" : "Default",
            ["mapUserColor"] = viewState.MapLocation == "user" ? "Accent" : "Default",
            ["mapZoomColor"] = viewState.MapZoomed ? "Accent" : "Default",
            ["trafficMarker"] = TrafficLabel(snapshot.TrafficColor),
            ["trafficColorHex"] = trafficColorHex,
            ["updated"] = FormatAge(snapshot.UpdatedAt),
            ["updatedLine"] = $"update {FormatAge(snapshot.UpdatedAt)}",
            ["systemId"] = snapshot.Label,
            ["systemLine"] = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase)
                ? $"update terakhir {FormatAge(snapshot.UpdatedAt)}"
                : $"terakhir online {FormatAge(snapshot.UpdatedAt)}",
            ["vehicleCount"] = snapshot.VehicleCount,
            ["objectCount"] = snapshot.ObjectCount,
            ["vehicleCountText"] = snapshot.VehicleCount.ToString(CultureInfo.InvariantCulture),
            ["objectCountText"] = snapshot.ObjectCount.ToString(CultureInfo.InvariantCulture),
            ["trafficColor"] = TrafficLabel(snapshot.TrafficColor),
            ["trafficStatusLine"] = $"Lampu {TrafficLabel(snapshot.TrafficColor)} ({activeSeconds}s)",
            ["activeSeconds"] = activeSeconds,
            ["activeSecondsText"] = activeSeconds.ToString(CultureInfo.InvariantCulture),
            ["lockScreenLine"] = lockScreenLine,
            ["redSeconds"] = snapshot.RedSeconds,
            ["yellowSeconds"] = snapshot.YellowSeconds,
            ["greenSeconds"] = snapshot.GreenSeconds,
            ["redSecondsText"] = snapshot.RedSeconds.ToString(CultureInfo.InvariantCulture),
            ["yellowSecondsText"] = snapshot.YellowSeconds.ToString(CultureInfo.InvariantCulture),
            ["greenSecondsText"] = snapshot.GreenSeconds.ToString(CultureInfo.InvariantCulture),
            ["redBar"] = Bar(snapshot.RedSeconds, 24, chartPulse),
            ["yellowBar"] = Bar(snapshot.YellowSeconds, 24, chartPulse + 1),
            ["greenBar"] = Bar(snapshot.GreenSeconds, 24, chartPulse + 2),
            ["redLine"] = $"Merah  {Bar(snapshot.RedSeconds, 24, chartPulse)} {snapshot.RedSeconds}s",
            ["yellowLine"] = $"Kuning {Bar(snapshot.YellowSeconds, 24, chartPulse + 1)} {snapshot.YellowSeconds}s",
            ["greenLine"] = $"Hijau  {Bar(snapshot.GreenSeconds, 24, chartPulse + 2)} {snapshot.GreenSeconds}s",
            ["car"] = snapshot.Car,
            ["motorcycle"] = snapshot.Motorcycle,
            ["bus"] = snapshot.Bus,
            ["truck"] = snapshot.Truck,
            ["bicycle"] = snapshot.Bicycle,
            ["carText"] = snapshot.Car.ToString(CultureInfo.InvariantCulture),
            ["motorcycleText"] = snapshot.Motorcycle.ToString(CultureInfo.InvariantCulture),
            ["busText"] = snapshot.Bus.ToString(CultureInfo.InvariantCulture),
            ["truckText"] = snapshot.Truck.ToString(CultureInfo.InvariantCulture),
            ["bicycleText"] = snapshot.Bicycle.ToString(CultureInfo.InvariantCulture),
            ["cameraImage"] = cameraImage,
            ["cameraFrame"] = cameraFrame,
            ["aiStatus"] = snapshot.AiStatus,
            ["otherSummary"] = snapshot.OtherSummary,
            ["detectionSummary"] = snapshot.DetectionSummary,
            ["detectionLabel"] = DisplayDetectionLabel(detectionLead.Label),
            ["detectionConfidence"] = $"{Math.Round(detectionLead.Confidence * 100)}%",
            ["topDetectionLine"] = $"{DisplayDetectionLabel(detectionLead.Label)} {Math.Round(detectionLead.Confidence * 100)}%",
            ["historyCountText"] = snapshot.ChartPoints.Count.ToString(CultureInfo.InvariantCulture),
            ["alert1Title"] = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "Sistem online" : "Sistem offline",
            ["alert1Body"] = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "RTDB tersinkron dan perangkat aktif." : "Heartbeat perangkat tidak fresh.",
            ["alert1Time"] = FormatAge(snapshot.UpdatedAt),
            ["alert2Title"] = $"Lampu {TrafficLabel(snapshot.TrafficColor)}",
            ["alert2Body"] = $"Durasi aktif {activeSeconds} detik.",
            ["alert2Time"] = FormatAge(snapshot.UpdatedAt),
            ["alert3Title"] = snapshot.ObjectCount > 0 ? "AI mendeteksi objek" : "AI belum melihat objek",
            ["alert3Body"] = snapshot.ObjectCount > 0 ? $"{snapshot.DetectionSummary}, akurasi tertinggi {Math.Round(detectionLead.Confidence * 100)}%." : "Tidak ada bbox dari RTDB saat ini.",
            ["alert3Time"] = FormatAge(snapshot.UpdatedAt),
            ["chartFrame"] = chartFrame,
            ["chartImage"] = chartImage,
            ["dataPanelTitle"] = dataPanel.title,
            ["dataPanelBody"] = dataPanel.body,
            ["dataPanelMetric"] = dataPanel.metric,
            ["dataPanelDetail"] = dataPanel.detail,
            ["dataPhase"] = $"{viewState.DataPhase + 1}/{ItsWidgetViewState.DataPhaseCount}",
            ["dataPhaseName"] = dataPhaseName,
            ["dataModeLabel"] = dataPhaseName,
            ["widgetAlt"] = $"{HeadlineFor(definitionId, snapshot)} - {SubtitleFor(definitionId, snapshot)}",
            ["headline"] = HeadlineFor(definitionId, snapshot),
            ["subtitle"] = SubtitleFor(definitionId, snapshot),
            ["iconPin"] = ItsWidgetIconRenderer.Icon("pin", "#0f172a"),
            ["iconTarget"] = ItsWidgetIconRenderer.Icon("target", "#2563eb"),
            ["iconTraffic"] = ItsWidgetIconRenderer.Icon("traffic", trafficColorHex),
            ["iconZoom"] = ItsWidgetIconRenderer.Icon("zoom", "#0f172a"),
            ["iconChart"] = ItsWidgetIconRenderer.Icon("chart", "#2563eb"),
            ["iconCamera"] = ItsWidgetIconRenderer.Icon("camera", "#0f766e"),
            ["iconBell"] = ItsWidgetIconRenderer.Icon("bell", "#e11d48"),
            ["iconInfo"] = ItsWidgetIconRenderer.Icon("info", "#38bdf8"),
            ["iconPower"] = ItsWidgetIconRenderer.Icon(snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "check" : "alert", snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "#22c55e" : "#fb7185"),
            ["iconClock"] = ItsWidgetIconRenderer.Icon("clock", "#f59e0b"),
            ["iconCar"] = ItsWidgetIconRenderer.Icon("car", "#f97316"),
            ["iconMotor"] = ItsWidgetIconRenderer.Icon("motor", "#2563eb"),
            ["iconBus"] = ItsWidgetIconRenderer.Icon("bus", "#16a34a"),
            ["iconTruck"] = ItsWidgetIconRenderer.Icon("truck", "#7c3aed"),
            ["iconBike"] = ItsWidgetIconRenderer.Icon("bike", "#0d9488"),
            ["iconTotal"] = ItsWidgetIconRenderer.Icon("chart", "#e11d48"),
        };

        return data.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
    }

    private static async Task<ItsWidgetSnapshot> FetchSnapshotAsync()
    {
        try
        {
            using var response = await Http.GetAsync(DevicesUrl, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
            using var document = await JsonDocument.ParseAsync(stream).ConfigureAwait(false);
            var devices = ExtractDeviceElements(document.RootElement)
                .Select(ReadSnapshot)
                .Where(device => device.HasData)
                .OrderByDescending(device => device.Status.Equals("online", StringComparison.OrdinalIgnoreCase))
                .ThenByDescending(device => device.UpdatedAt)
                .ToList();
            return devices.FirstOrDefault() ?? Fallback();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ITS widget data fetch failed: {ex.Message}");
            return cachedSnapshot ?? Fallback();
        }
    }

    private static ItsWidgetSnapshot AttachChartHistory(ItsWidgetSnapshot snapshot)
    {
        var point = new ItsWidgetChartPoint(
            snapshot.UpdatedAt,
            snapshot.VehicleCount,
            snapshot.TrafficColor,
            ActiveTrafficSeconds(snapshot),
            snapshot.RedSeconds,
            snapshot.YellowSeconds,
            snapshot.GreenSeconds);
        var chartKey = HashCode.Combine(
            point.UpdatedAt,
            point.VehicleCount,
            point.TrafficColor,
            point.ActiveSeconds,
            point.RedSeconds,
            point.YellowSeconds,
            point.GreenSeconds);

        lock (CacheLock)
        {
            if (!snapshot.HasData || !snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase))
            {
                ChartHistory.Clear();
                ChartHistory.Add(point);
                lastChartKey = chartKey;
            }
            else if (ChartHistory.Count == 0 || chartKey != lastChartKey)
            {
                ChartHistory.Add(point);
                while (ChartHistory.Count > 5) ChartHistory.RemoveAt(0);
                lastChartKey = chartKey;
            }

            return snapshot with { ChartPoints = ChartHistory.ToArray() };
        }
    }

    private static IEnumerable<JsonElement> ExtractDeviceElements(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("devices", out var devices))
        {
            root = devices;
        }

        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in root.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Object) yield return item;
            }
        }
        else if (root.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in root.EnumerateObject())
            {
                if (property.Value.ValueKind == JsonValueKind.Object) yield return property.Value;
            }
        }
    }

    private static ItsWidgetSnapshot ReadSnapshot(JsonElement device)
    {
        var label = ReadString(device, "label") ?? ReadString(device, "name") ?? ReadString(device, "id") ?? "Raspberry Pi";
        var lastSeen = ReadEpoch(device, "lastSeen");
        var updatedAt = new[]
        {
            lastSeen,
            ReadEpoch(device, "updatedAt"),
            ReadEpoch(device, "cameraUpdatedAt"),
            ReadEpoch(device, "detectorUpdatedAt"),
            ReadEpoch(ReadObject(device, "cameraDataset"), "updatedAt"),
        }.Max();
        var status = ReadString(device, "status") ?? (IsFresh(updatedAt) ? "online" : "offline");
        if (!IsFresh(updatedAt)) status = "offline";

        var locationObject = ReadObject(device, "location");
        var position = ReadObject(device, "position");
        var lat = ValidCoordinate(ReadNumber(locationObject, "lat"), true)
            ?? ValidCoordinate(ReadNumber(device, "lat"), true)
            ?? ValidCoordinate(ReadNumber(position, "lat"), true)
            ?? ValidCoordinate(ReadNumber(position, "x"), true);
        var lng = ValidCoordinate(ReadNumber(locationObject, "lng"), false)
            ?? ValidCoordinate(ReadNumber(locationObject, "lon"), false)
            ?? ValidCoordinate(ReadNumber(device, "lng"), false)
            ?? ValidCoordinate(ReadNumber(position, "lng"), false)
            ?? ValidCoordinate(ReadNumber(position, "y"), false);
        var coordinates = lat.HasValue && lng.HasValue ? FormatCoordinates(lat.Value, lng.Value) : "koordinat belum tersedia";
        var location = PreferredLocation(
            ReadString(locationObject, "label"),
            ReadString(device, "roadName"),
            ReadString(device, "locationLabel"),
            ReadString(device, "roadHint"),
            label
        );

        var objectDetection = ReadObject(device, "objectDetection");
        var breakdownObject = ReadObject(device, "vehicleBreakdown");
        var car = Math.Max(ReadCount(breakdownObject, "car"), ReadCount(objectDetection, "car"));
        var motorcycle = Math.Max(ReadCount(breakdownObject, "motorcycle"), ReadCount(objectDetection, "motorcycle"));
        var bus = Math.Max(ReadCount(breakdownObject, "bus"), ReadCount(objectDetection, "bus"));
        var truck = Math.Max(ReadCount(breakdownObject, "truck"), ReadCount(objectDetection, "truck"));
        var bicycle = Math.Max(ReadCount(breakdownObject, "bicycle"), ReadCount(objectDetection, "bicycle"));
        var detections = ReadDetections(device, out var otherSummary);
        foreach (var detection in detections)
        {
            var labelKey = detection.Label;
            if (labelKey == "car") car++;
            else if (labelKey == "motorcycle") motorcycle++;
            else if (labelKey == "bus") bus++;
            else if (labelKey == "truck") truck++;
            else if (labelKey == "bicycle") bicycle++;
        }

        var detectedVehicleTotal = car + motorcycle + bus + truck + bicycle;
        var vehicleCount = Math.Max(ReadCount(device, "vehicleCount"), Math.Max(ReadCount(objectDetection, "vehicleCount"), detectedVehicleTotal));
        var objectCount = Math.Max(ReadCount(device, "objectCount"), Math.Max(ReadCount(objectDetection, "objectCount"), Math.Max(vehicleCount, detections.Count)));
        var trafficObject = ReadObject(device, "traffic");
        var trafficColor = NormalizeTrafficColor(ReadString(device, "trafficColor") ?? ReadString(trafficObject, "current") ?? ColorFromVehicleCount(vehicleCount));
        var activeDuration = ReadNumber(device, "trafficDurationSec")
            ?? ReadNumber(device, "trafficDuration")
            ?? ReadNumber(trafficObject, "durationSec");
        var durations = PhaseDurations(trafficColor, vehicleCount, activeDuration);
        var fps = ReadNumber(device, "detectorFps");
        var cameraDataset = ReadObject(device, "cameraDataset");
        var cameraImage = ReadString(device, "cameraThumbnailUrl")
            ?? ReadString(cameraDataset, "snapshot1Url")
            ?? ReadString(cameraDataset, "snapshot2Url")
            ?? "https://itstelkom.web.app/bwits.png";
        var cameraImage2 = ReadString(cameraDataset, "snapshot2Url")
            ?? ReadString(cameraDataset, "snapshot1Url")
            ?? cameraImage;
        if (detections.Count == 0 && !string.IsNullOrWhiteSpace(cameraImage))
        {
            detections.Add(DefaultDetectionFromTraffic(trafficColor));
            objectCount = Math.Max(objectCount, detections.Count);
        }
        var detectionSummary = DetectionSummary(detections.Select(item => item.Label).ToArray(), objectCount);
        var aiStatus = ReadString(device, "detectorNote")
            ?? ReadString(device, "detectorStatus")
            ?? (objectCount > 0 ? $"RF-DETR aktif{(fps.HasValue ? $" {fps.Value:F1} FPS" : "")}" : "AI memindai snapshot");

        return new ItsWidgetSnapshot(
            label,
            status,
            location,
            coordinates,
            lat,
            lng,
            updatedAt,
            vehicleCount,
            objectCount,
            trafficColor,
            durations.red,
            durations.yellow,
            durations.green,
            car,
            motorcycle,
            bus,
            truck,
            bicycle,
            cameraImage,
            cameraImage2,
            aiStatus,
            otherSummary,
            detectionSummary,
            detections,
            Array.Empty<ItsWidgetChartPoint>(),
            true
        );
    }

    private static List<ItsWidgetDetection> ReadDetections(JsonElement device, out string otherSummary)
    {
        var detections = new List<ItsWidgetDetection>();
        var others = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        if (device.TryGetProperty("detections", out var array) && array.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in array.EnumerateArray())
            {
                var label = ReadString(item, "label")?.Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(label)) continue;
                var rawConfidence = ReadNumber(item, "confidence") ?? ReadNumber(item, "score") ?? 0.88;
                var confidence = Math.Clamp(rawConfidence > 1 ? rawConfidence / 100d : rawConfidence, 0, 1);
                var vehicle = label is "car" or "motorcycle" or "bus" or "truck" or "bicycle";
                detections.Add(new ItsWidgetDetection(
                    label,
                    confidence,
                    Math.Max(0, ReadNumber(item, "x") ?? 0),
                    Math.Max(0, ReadNumber(item, "y") ?? 0),
                    Math.Max(0, ReadNumber(item, "width") ?? 0),
                    Math.Max(0, ReadNumber(item, "height") ?? 0),
                    vehicle
                ));
                if (label is "car" or "motorcycle" or "bus" or "truck" or "bicycle") continue;
                others[label] = others.TryGetValue(label, out var count) ? count + 1 : 1;
            }
        }

        otherSummary = others.Count == 0
            ? "objek lain belum terkunci"
            : string.Join(", ", others.OrderByDescending(item => item.Value).Take(3).Select(item => $"{item.Key} {item.Value}"));
        return detections;
    }

    private static ItsWidgetDetection DefaultDetectionFromTraffic(string trafficColor)
    {
        var confidence = trafficColor switch
        {
            "green" => 0.91,
            "yellow" => 0.89,
            _ => 0.92,
        };
        return new ItsWidgetDetection("traffic light", confidence, 0.43, 0.35, 0.17, 0.28, false);
    }

    private static (int red, int yellow, int green) PhaseDurations(string color, int vehicleCount, double? activeDuration)
    {
        var level = vehicleCount <= 5 ? "low" : vehicleCount <= 10 ? "medium" : "high";
        var red = level == "high" ? 5 : level == "medium" ? 7 : 8;
        var yellow = 3;
        var green = level == "high" ? 22 : level == "medium" ? 12 : 6;
        var active = Math.Max(1, (int)Math.Round(activeDuration ?? 0));
        if (activeDuration.HasValue)
        {
            if (color == "red") red = active;
            else if (color == "yellow") yellow = active;
            else if (color == "green") green = active;
        }
        return (red, yellow, green);
    }

    private static ItsWidgetSnapshot Fallback() => new(
        "ITS Maps",
        "offline",
        "Raspberry Pi belum sinkron",
        "koordinat belum tersedia",
        null,
        null,
        0,
        0,
        0,
        "red",
        8,
        3,
        6,
        0,
        0,
        0,
        0,
        0,
        "https://itstelkom.web.app/bwits.png",
        "https://itstelkom.web.app/bwits.png",
        "AI menunggu data RTDB",
        "objek lain belum tersedia",
        "Belum ada object detection",
        Array.Empty<ItsWidgetDetection>(),
        Array.Empty<ItsWidgetChartPoint>(),
        false
    );

    private static ItsWidgetUserPosition? GetUserPosition()
    {
        lock (CacheLock)
        {
            if (DateTimeOffset.UtcNow - cachedUserAt < TimeSpan.FromSeconds(12))
            {
                return cachedUserPosition;
            }
        }

        try
        {
            var position = FetchUserPositionAsync().GetAwaiter().GetResult();
            lock (CacheLock)
            {
                cachedUserPosition = position;
                cachedUserAt = DateTimeOffset.UtcNow;
            }
            return position;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ITS widget user location fetch failed: {ex.Message}");
            return cachedUserPosition;
        }
    }

    private static ItsWidgetUserPosition DefaultUserPosition()
    {
        return new ItsWidgetUserPosition(-6.97725, 107.63182, 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    private static async Task<ItsWidgetUserPosition?> FetchUserPositionAsync()
    {
        using var response = await Http.GetAsync(DesktopClientsUrl, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream).ConfigureAwait(false);
        if (document.RootElement.ValueKind != JsonValueKind.Object) return null;

        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-15).ToUnixTimeMilliseconds();
        return document.RootElement.EnumerateObject()
            .Select(property => property.Value)
            .Where(value => value.ValueKind == JsonValueKind.Object)
            .Select(value =>
            {
                var position = ReadObject(value, "position");
                var lat = ValidCoordinate(ReadNumber(position, "lat"), true);
                var lng = ValidCoordinate(ReadNumber(position, "lng"), false);
                var updatedAt = ReadEpoch(value, "updatedAt");
                var accuracy = Math.Max(0, ReadNumber(value, "accuracy") ?? 0);
                return lat.HasValue && lng.HasValue && updatedAt >= cutoff
                    ? new ItsWidgetUserPosition(lat.Value, lng.Value, accuracy, updatedAt)
                    : null;
            })
            .Where(position => position is not null)
            .OrderByDescending(position => position!.UpdatedAt)
            .FirstOrDefault();
    }

    private static string CameraImageFor(ItsWidgetSnapshot snapshot, int scanPhase)
    {
        var alternate = (DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 10) % 2 == 1;
        return alternate && !string.IsNullOrWhiteSpace(snapshot.CameraImage2)
            ? snapshot.CameraImage2
            : snapshot.CameraImage;
    }

    private static string StaticMapUrl(double? lat, double? lng, string trafficColor, bool zoomed)
    {
        if (!lat.HasValue || !lng.HasValue) return "https://itstelkom.web.app/bwits.png";
        var latText = lat.Value.ToString("0.000000", CultureInfo.InvariantCulture);
        var lngText = lng.Value.ToString("0.000000", CultureInfo.InvariantCulture);
        var marker = trafficColor switch
        {
            "green" => "green-pushpin",
            "yellow" => "yellow-pushpin",
            _ => "red-pushpin",
        };
        var zoom = zoomed ? 18 : 16;
        return $"https://staticmap.openstreetmap.de/staticmap.php?center={latText},{lngText}&zoom={zoom}&size=640x360&maptype=mapnik&markers={latText},{lngText},{marker}";
    }

    private static string FormatCoordinates(double lat, double lng)
    {
        return $"{lat.ToString("0.00000", CultureInfo.InvariantCulture)}, {lng.ToString("0.00000", CultureInfo.InvariantCulture)}";
    }

    private static string ChartFrame(ItsWidgetSnapshot snapshot, int pulse)
    {
        return string.Join("\n", new[]
        {
            $"Kendaraan {snapshot.VehicleCount,2}  Objek {snapshot.ObjectCount,2}",
            $"Merah  {Bar(snapshot.RedSeconds, 24, pulse)} {snapshot.RedSeconds}s",
            $"Kuning {Bar(snapshot.YellowSeconds, 24, pulse + 1)} {snapshot.YellowSeconds}s",
            $"Hijau  {Bar(snapshot.GreenSeconds, 24, pulse + 2)} {snapshot.GreenSeconds}s",
        });
    }

    private static string Bar(int value, int max, int pulse)
    {
        var filled = Math.Clamp((int)Math.Round(Math.Max(1, value) / (double)Math.Max(1, max) * 12), 1, 12);
        if (pulse >= 0 && pulse % 4 == 0 && filled < 12) filled++;
        return new string('|', filled) + new string('.', 12 - filled);
    }

    private static (string title, string body, string metric, string detail) DataPanelFor(int phase, ItsWidgetSnapshot snapshot, string cameraImage)
    {
        return Math.Clamp(phase, 0, ItsWidgetViewState.DataPhaseCount - 1) switch
        {
            0 => (
                "Data kendaraan",
                $"Mobil {snapshot.Car} / Motor {snapshot.Motorcycle} / Bus {snapshot.Bus}",
                $"{snapshot.VehicleCount} kendaraan",
                $"Truk {snapshot.Truck}, Sepeda {snapshot.Bicycle}, Lampu {TrafficLabel(snapshot.TrafficColor)}"
            ),
            1 => (
                "Kamera AI ITS",
                snapshot.DetectionSummary,
                $"{snapshot.ObjectCount} objek",
                snapshot.AiStatus
            ),
            _ => (
                "Alert dan status",
                snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "Raspberry online dan RTDB tersinkron." : "Raspberry offline atau data mulai basi.",
                snapshot.Status.ToUpperInvariant(),
                $"Lokasi {snapshot.Location} - update {FormatAge(snapshot.UpdatedAt)}"
            ),
        };
    }

    private static string DetectionSummary(IReadOnlyCollection<string> detections, int objectCount)
    {
        if (detections.Count == 0)
        {
            return objectCount > 0 ? $"{objectCount} objek dari RTDB" : "Belum ada bbox object";
        }

        return string.Join(" / ", detections
            .GroupBy(DisplayDetectionLabel, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .Take(4)
            .Select(group => $"{group.Key} {group.Count()}"));
    }

    private static string DisplayDetectionLabel(string label)
    {
        var normalized = label.Trim().ToLowerInvariant();
        if (normalized.Contains("kendaraan", StringComparison.OrdinalIgnoreCase)) return "Kendaraan";
        return normalized switch
        {
            "person" => "Manusia",
            "car" => "Mobil",
            "motorcycle" => "Motor",
            "bus" => "Bus",
            "truck" => "Truk",
            "bicycle" => "Sepeda",
            "traffic light" or "traffic_light" or "lampu" => "Lampu",
            _ => label.Trim(),
        };
    }

    private static JsonElement ReadObject(JsonElement element, string property)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object
            ? value
            : default;
    }

    private static string? ReadString(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var value)) return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static double? ReadNumber(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number)) return number;
        if (value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), out number)) return number;
        return null;
    }

    private static int ReadCount(JsonElement element, string property)
    {
        return Math.Max(0, (int)Math.Round(ReadNumber(element, property) ?? 0));
    }

    private static double? ValidCoordinate(double? value, bool latitude)
    {
        if (!value.HasValue || !double.IsFinite(value.Value)) return null;
        var limit = latitude ? 90 : 180;
        if (Math.Abs(value.Value) > limit || Math.Abs(value.Value) < 0.000001) return null;
        return value;
    }

    private static string PreferredLocation(params string?[] values)
    {
        var labels = values.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value!.Trim()).ToList();
        return labels.FirstOrDefault(value =>
            !value.Contains("mencari", StringComparison.OrdinalIgnoreCase)
            && !value.Contains("menunggu", StringComparison.OrdinalIgnoreCase)
            && !value.Contains("GPS aktif", StringComparison.OrdinalIgnoreCase)
            && !value.Contains("belum tersedia", StringComparison.OrdinalIgnoreCase))
            ?? labels.FirstOrDefault()
            ?? "Lokasi belum tersedia";
    }

    private static long ReadEpoch(JsonElement element, string property)
    {
        var value = ReadNumber(element, property) ?? 0;
        if (value <= 0) return 0;
        return (long)(value < 100_000_000_000 ? value * 1000 : value);
    }

    private static bool IsFresh(long epochMs)
    {
        if (epochMs <= 0) return false;
        var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(epochMs);
        return age < TimeSpan.FromMinutes(5);
    }

    private static string FormatAge(long epochMs)
    {
        if (epochMs <= 0) return "-";
        var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(epochMs);
        if (age.TotalSeconds < 60) return $"{Math.Max(1, (int)Math.Round(age.TotalSeconds))}s";
        if (age.TotalMinutes < 60) return $"{Math.Max(1, (int)Math.Round(age.TotalMinutes))}m";
        if (age.TotalHours < 24) return $"{Math.Max(1, (int)Math.Round(age.TotalHours))}h";
        return $"{Math.Max(1, (int)Math.Round(age.TotalDays))}d";
    }

    private static string ColorFromVehicleCount(int vehicleCount)
    {
        if (vehicleCount >= 11) return "red";
        if (vehicleCount >= 6) return "yellow";
        return "green";
    }

    private static string NormalizeTrafficColor(string? color)
    {
        return color?.Trim().ToLowerInvariant() switch
        {
            "green" or "hijau" => "green",
            "yellow" or "kuning" => "yellow",
            _ => "red",
        };
    }

    private static int ActiveTrafficSeconds(ItsWidgetSnapshot snapshot)
    {
        return snapshot.TrafficColor switch
        {
            "green" => snapshot.GreenSeconds,
            "yellow" => snapshot.YellowSeconds,
            _ => snapshot.RedSeconds,
        };
    }

    private static string TrafficLabel(string color)
    {
        return color switch
        {
            "green" => "Hijau",
            "yellow" => "Kuning",
            _ => "Merah",
        };
    }

    private static string TrafficGlyph(string color)
    {
        return color switch
        {
            "green" => "\ud83d\udfe2",
            "yellow" => "\ud83d\udfe1",
            _ => "\ud83d\udd34",
        };
    }

    private static string HeadlineFor(string definitionId, ItsWidgetSnapshot snapshot)
    {
        return definitionId switch
        {
            ItsWidget.DefinitionMap => snapshot.Location,
            ItsWidget.DefinitionTraffic => $"{snapshot.VehicleCount} kendaraan",
            ItsWidget.DefinitionAi => $"{snapshot.ObjectCount} objek dipindai",
            ItsWidget.DefinitionData => $"{snapshot.VehicleCount} kendaraan / {snapshot.ObjectCount} objek",
            _ => snapshot.Label,
        };
    }

    private static string SubtitleFor(string definitionId, ItsWidgetSnapshot snapshot)
    {
        return definitionId switch
        {
            ItsWidget.DefinitionMap => snapshot.Coordinates,
            ItsWidget.DefinitionTraffic => $"Lampu aktif: {TrafficLabel(snapshot.TrafficColor)}",
            ItsWidget.DefinitionAi => snapshot.AiStatus,
            ItsWidget.DefinitionData => $"Update {FormatAge(snapshot.UpdatedAt)}",
            _ => snapshot.Status,
        };
    }
}
