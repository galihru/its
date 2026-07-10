using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Net.Http;

namespace ItsMapsWidgetProvider;

internal static class ItsWidgetMediaRenderer
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(6) };
    private static readonly ConcurrentDictionary<string, (DateTimeOffset At, byte[] Bytes)> ImageCache = new();
    private static string? whiteBackground;

    public static string WhiteBackground()
    {
        if (whiteBackground is not null) return whiteBackground;
        using var bitmap = new Bitmap(8, 8, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        g.Clear(Color.White);
        whiteBackground = EncodePng(bitmap);
        return whiteBackground;
    }

    public static string RenderMapControlButton(string kind, bool active, bool zoomed = false, string trafficColor = "red")
    {
        const int size = 56;
        using var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        Prepare(g);
        g.Clear(Color.Transparent);
        using var shadow = new SolidBrush(Color.FromArgb(72, 0, 0, 0));
        FillRound(g, shadow, new RectangleF(6, 8, 44, 44), 16);
        using var bg = new SolidBrush(active ? Color.FromArgb(236, 17, 24, 39) : Color.FromArgb(218, 14, 19, 28));
        var accent = kind == "traffic" ? TrafficColor(trafficColor) : kind == "user" ? Color.FromArgb(77, 141, 255) : Color.FromArgb(233, 238, 245);
        using var border = new Pen(active ? accent : Color.FromArgb(120, 36, 48, 68), active ? 2.2f : 1.4f);
        var rect = new RectangleF(5, 5, 44, 44);
        FillRound(g, bg, rect, 14);
        using (var path = RoundPath(rect, 14))
        {
            g.DrawPath(border, path);
        }

        if (kind == "zoom")
        {
            DrawZoomGlyph(g, 27, 27, zoomed, active ? Color.FromArgb(25, 227, 163) : Color.FromArgb(233, 238, 245));
        }
        else if (kind == "traffic")
        {
            DrawTrafficLightIcon(g, 27, 27, TrafficColor(trafficColor));
        }
        else
        {
            DrawPin(g, 27, 28, active ? Color.FromArgb(77, 141, 255) : Color.FromArgb(233, 238, 245), Color.FromArgb(14, 19, 28), 34);
        }

        return EncodePng(bitmap);
    }

    public static string RenderCameraFrame(ItsWidgetSnapshot snapshot, int phase, string cameraImage)
    {
        const int width = 640;
        const int height = 360;
        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        Prepare(g);
        g.Clear(Color.Transparent);
        using var clip = RoundPath(new RectangleF(0, 0, width, height), 22);
        g.SetClip(clip);
        using var bg = new LinearGradientBrush(new RectangleF(0, 0, width, height), Color.FromArgb(10, 8, 20), Color.FromArgb(35, 5, 38), LinearGradientMode.ForwardDiagonal);
        g.FillRectangle(bg, 0, 0, width, height);

        using (var image = LoadImage(cameraImage))
        {
            if (image is not null)
            {
                DrawImageCover(g, image, new RectangleF(0, 0, width, height));
            }
        }

        using var veil = new LinearGradientBrush(new RectangleF(0, 0, width, height), Color.FromArgb(76, 0, 0, 0), Color.FromArgb(18, 0, 0, 0), LinearGradientMode.Horizontal);
        g.FillRectangle(veil, 0, 0, width, height);

        var statusText = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? "Traffic online" : "Traffic offline";
        var pillColor = StatusColor(snapshot.Status);
        using (var pillBg = new SolidBrush(Color.FromArgb(150, 8, 10, 16)))
        {
            FillRound(g, pillBg, new RectangleF(width - 158, 14, 136, 28), 14);
        }
        using (var pillDot = new SolidBrush(pillColor))
        {
            g.FillEllipse(pillDot, width - 146, 25, 8, 8);
        }
        DrawSmallText(g, statusText, width - 132, 18, pillColor, 16, true);
        DrawCarouselDots(g, width - 78, 50, 2, SnapshotIndex(), Color.FromArgb(203, 213, 225));

        var detections = snapshot.Detections.Count > 0
            ? snapshot.Detections.Take(5).ToList()
            : QuickDetectObjects(bitmap, phase).ToList();

        foreach (var detection in detections)
        {
            DrawDetectionBox(g, new RectangleF(0, 0, width, height), detection, phase);
        }

        if (detections.Count == 0)
        {
            DrawSmallScanBox(g, new RectangleF(0, 0, width, height), phase, "MEMINDAI");
        }

        g.ResetClip();
        using var edge = new Pen(Color.FromArgb(80, 148, 163, 184), 2);
        using (var edgePath = RoundPath(new RectangleF(1, 1, width - 2, height - 2), 22))
        {
            g.DrawPath(edge, edgePath);
        }

        return EncodePng(bitmap);
    }

    public static string RenderCartoMap(
        ItsWidgetSnapshot snapshot,
        ItsWidgetViewState viewState,
        ItsWidgetUserPosition? userPosition,
        double? mapLat,
        double? mapLng)
    {
        const int width = 640;
        const int height = 360;
        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        Prepare(g);
        g.Clear(Color.Transparent);
        using var clip = RoundPath(new RectangleF(0, 0, width, height), 22);
        g.SetClip(clip);
        g.Clear(viewState.MapTheme.Equals("light", StringComparison.OrdinalIgnoreCase) ? Color.FromArgb(232, 238, 232) : Color.FromArgb(13, 17, 24));

        if (mapLat.HasValue && mapLng.HasValue)
        {
            DrawCartoTiles(g, mapLat.Value, mapLng.Value, viewState.MapZoomed ? 18 : 16, width, height, viewState.MapTheme);
        }
        else
        {
            DrawFallbackMap(g, width, height);
        }

        using var frost = new SolidBrush(viewState.MapTheme.Equals("light", StringComparison.OrdinalIgnoreCase) ? Color.FromArgb(12, 255, 255, 255) : Color.FromArgb(18, 0, 0, 0));
        g.FillRectangle(frost, 0, 0, width, height);

        DrawTrafficMarker(g, width * 0.52f, height * 0.53f, snapshot.TrafficColor);

        if (userPosition is not null)
        {
            var user = LatLngToPixel(userPosition.Latitude, userPosition.Longitude, viewState.MapZoomed ? 18 : 16);
            var center = LatLngToPixel(mapLat ?? snapshot.Latitude ?? userPosition.Latitude, mapLng ?? snapshot.Longitude ?? userPosition.Longitude, viewState.MapZoomed ? 18 : 16);
            var ux = width / 2f + (float)(user.x - center.x);
            var uy = height / 2f + (float)(user.y - center.y);
            DrawPin(g, ux, uy, Color.FromArgb(37, 99, 235), Color.White);
        }

        g.ResetClip();
        using var edge = new Pen(Color.FromArgb(90, 148, 163, 184), 2);
        using (var edgePath = RoundPath(new RectangleF(1, 1, width - 2, height - 2), 22))
        {
            g.DrawPath(edge, edgePath);
        }

        return EncodePng(bitmap);
    }

    public static string RenderMiniChart(ItsWidgetSnapshot snapshot, int phase, bool compact)
    {
        var width = compact ? 520 : 640;
        var height = compact ? 230 : 280;
        using var bitmap = new Bitmap(width, height);
        using var g = Graphics.FromImage(bitmap);
        Prepare(g);
        g.Clear(Color.Transparent);
        var rect = new RectangleF(8, 8, width - 16, height - 16);
        using var bg = new LinearGradientBrush(rect, Color.FromArgb(17, 24, 38), Color.FromArgb(10, 14, 22), LinearGradientMode.Vertical);
        using var border = new Pen(Color.FromArgb(36, 48, 68), 2);
        FillRound(g, bg, rect, 20);
        using (var borderPath = RoundPath(rect, 20))
        {
            g.DrawPath(border, borderPath);
        }

        var plot = RectangleF.Inflate(rect, -52, -44);
        plot.Y += 22;
        plot.Height -= 10;
        using var grid = new Pen(Color.FromArgb(26, 35, 51), 1.2f);
        for (var i = 1; i <= 3; i++)
        {
            var y = plot.Bottom - plot.Height * i / 4f;
            g.DrawLine(grid, plot.Left, y, plot.Right, y);
        }

        using var axis = new Pen(Color.FromArgb(36, 48, 68), 2);
        g.DrawLine(axis, plot.Left, plot.Top, plot.Left, plot.Bottom);
        g.DrawLine(axis, plot.Left, plot.Bottom, plot.Right, plot.Bottom);

        DrawSmallText(g, "Grafik realtime", rect.Left + 22, rect.Top + 18, Color.FromArgb(233, 238, 245), 18, true);
        DrawLegend(g, rect.Right - 230, rect.Top + 22);
        DrawSmallText(g, "Y: Durasi lampu (dtk)", plot.Left, rect.Top + 48, Color.FromArgb(138, 148, 166), 12, true);
        DrawSmallText(g, "X: Jumlah kendaraan", plot.Left + 8, plot.Bottom + 12, Color.FromArgb(138, 148, 166), 12, true);
        DrawSmallText(g, "0", plot.Left - 20, plot.Bottom - 8, Color.FromArgb(92, 101, 120), 11, true);
        DrawSmallText(g, "5", plot.Left - 20, plot.Bottom - plot.Height * 0.5f - 8, Color.FromArgb(92, 101, 120), 11, true);
        DrawSmallText(g, "10", plot.Left - 26, plot.Top - 6, Color.FromArgb(92, 101, 120), 11, true);

        var x = plot.Left + Math.Min(plot.Width - 18, Math.Max(8, snapshot.VehicleCount * plot.Width / 24f));
        DrawHistoryChart(g, plot, snapshot.ChartPoints, phase);
        return EncodePng(bitmap);
    }

    private static void DrawCartoTiles(Graphics g, double lat, double lng, int zoom, int width, int height, string theme)
    {
        var center = LatLngToTile(lat, lng, zoom);
        var centerPixel = LatLngToPixel(lat, lng, zoom);
        var centerTileX = (int)Math.Floor(center.x);
        var centerTileY = (int)Math.Floor(center.y);
        var halfTilesX = (int)Math.Ceiling(width / 512d) + 1;
        var halfTilesY = (int)Math.Ceiling(height / 512d) + 1;
        for (var tx = centerTileX - halfTilesX; tx <= centerTileX + halfTilesX; tx++)
        for (var ty = centerTileY - halfTilesY; ty <= centerTileY + halfTilesY; ty++)
        {
            var max = 1 << zoom;
            var wrappedX = ((tx % max) + max) % max;
            if (ty < 0 || ty >= max) continue;
            var layer = theme.Equals("light", StringComparison.OrdinalIgnoreCase) ? "light_all" : "dark_all";
            var url = $"https://a.basemaps.cartocdn.com/{layer}/{zoom}/{wrappedX}/{ty}.png";
            using var tile = LoadImage(url);
            if (tile is null) continue;
            var drawX = width / 2f + (float)(tx * 256 - centerPixel.x);
            var drawY = height / 2f + (float)(ty * 256 - centerPixel.y);
            g.DrawImage(tile, drawX, drawY, 256, 256);
        }
    }

    private static void DrawFallbackMap(Graphics g, int width, int height)
    {
        using var bg = new LinearGradientBrush(new RectangleF(0, 0, width, height), Color.FromArgb(13, 17, 24), Color.FromArgb(17, 24, 38), LinearGradientMode.ForwardDiagonal);
        g.FillRectangle(bg, 0, 0, width, height);
        using var block = new SolidBrush(Color.FromArgb(31, 42, 57));
        for (var y = 24; y < height; y += 82)
        for (var x = 28; x < width; x += 112)
        {
            g.FillRectangle(block, x, y, 76, 40);
        }

        using var road = new Pen(Color.FromArgb(91, 105, 124), 14);
        g.DrawLine(road, 40, 260, width - 44, 150);
        g.DrawLine(road, 20, 160, width - 40, 120);
        g.DrawLine(road, 110, height - 18, width - 40, height - 122);
    }

    private static IEnumerable<ItsWidgetDetection> QuickDetectObjects(Bitmap source, int phase)
    {
        var width = source.Width;
        var height = source.Height;
        var sample = 24;
        var bestScore = 0d;
        var bestX = width * 0.44;
        var bestY = height * 0.46;
        for (var y = sample; y < height - sample; y += sample)
        for (var x = sample; x < width - sample; x += sample)
        {
            var c = source.GetPixel(x, y);
            var brightness = c.R * 0.299 + c.G * 0.587 + c.B * 0.114;
            var chroma = Math.Max(c.R, Math.Max(c.G, c.B)) - Math.Min(c.R, Math.Min(c.G, c.B));
            var score = brightness + chroma * 1.4;
            if (score <= bestScore) continue;
            bestScore = score;
            bestX = x;
            bestY = y;
        }

        return new[]
        {
            new ItsWidgetDetection("traffic light", 0.90, bestX - 42 + (phase % 3) * 4, bestY - 58, 88, 116, false)
        };
    }

    private static void DrawDetectionBox(Graphics g, RectangleF imageRect, ItsWidgetDetection detection, int phase)
    {
        var x = (float)detection.X;
        var y = (float)detection.Y;
        var w = (float)detection.Width;
        var h = (float)detection.Height;
        if (w <= 1 || h <= 1)
        {
            x *= imageRect.Width;
            y *= imageRect.Height;
            w *= imageRect.Width;
            h *= imageRect.Height;
        }

        var box = new RectangleF(
            Math.Clamp(imageRect.Left + x, imageRect.Left + 8, imageRect.Right - 80),
            Math.Clamp(imageRect.Top + y, imageRect.Top + 34, imageRect.Bottom - 62),
            Math.Clamp(w, 62, 220),
            Math.Clamp(h, 42, 150));

        var color = detection.Vehicle ? Color.FromArgb(0, 230, 118) : Color.FromArgb(20, 184, 166);
        using var glow = new Pen(Color.FromArgb(60, color), 10);
        using var corner = new Pen(color, 4) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawRectangle(glow, box.X, box.Y, box.Width, box.Height);
        DrawCorners(g, box, corner);

        var scanY = box.Top + ((phase * 17) % Math.Max(1, (int)box.Height));
        using var scan = new Pen(Color.FromArgb(155, color), 2);
        g.DrawLine(scan, box.Left + 8, scanY, box.Right - 8, scanY);

        var text = $"{DisplayDetectionLabel(detection.Label)} {Math.Round(detection.Confidence * 100)}%";
        var labelWidth = Math.Min(300, Math.Max(138, text.Length * 10 + 30));
        var labelRect = new RectangleF(Math.Clamp(box.Left, 6, imageRect.Right - labelWidth - 6), Math.Max(6, box.Top - 36), labelWidth, 32);
        using var labelBg = new SolidBrush(color);
        FillRound(g, labelBg, labelRect, 6);
        DrawSmallText(g, text, labelRect.Left + 9, labelRect.Top + 6, Color.FromArgb(2, 6, 23), 18, true);
    }

    private static void DrawSmallScanBox(Graphics g, RectangleF imageRect, int phase, string label)
    {
        var cx = imageRect.Left + imageRect.Width * (0.36f + (phase % 5) * 0.06f);
        var cy = imageRect.Top + imageRect.Height * (0.34f + (phase % 4) * 0.07f);
        var box = new RectangleF(cx - 58, cy - 36, 116, 72);
        using var pen = new Pen(Color.FromArgb(0, 230, 118), 4) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        DrawCorners(g, box, pen);
        DrawSmallText(g, label, box.Left, Math.Max(8, box.Top - 24), Color.FromArgb(0, 230, 118), 16, true);
    }

    private static void DrawTrafficMarker(Graphics g, float x, float y, string color)
    {
        DrawPin(g, x, y + 18, Color.White, Color.FromArgb(15, 23, 42), 54);
        using var body = new SolidBrush(Color.FromArgb(15, 23, 42));
        FillRound(g, body, new RectangleF(x - 15, y - 38, 30, 58), 9);
        DrawLight(g, x, y - 25, "red", color);
        DrawLight(g, x, y - 9, "yellow", color);
        DrawLight(g, x, y + 7, "green", color);
    }

    private static void DrawLight(Graphics g, float x, float y, string name, string active)
    {
        var c = name switch
        {
            "green" => Color.FromArgb(34, 197, 94),
            "yellow" => Color.FromArgb(250, 204, 21),
            _ => Color.FromArgb(239, 68, 68),
        };
        using var brush = new SolidBrush(name == active ? c : Color.FromArgb(74, 85, 104));
        g.FillEllipse(brush, x - 5, y - 5, 10, 10);
    }

    private static void DrawMapButton(Graphics g, float x, float y, string kind, bool active)
    {
        using var bg = new SolidBrush(active ? Color.FromArgb(15, 23, 42) : Color.FromArgb(245, 248, 255));
        using var border = new Pen(Color.FromArgb(210, 220, 230), 1.4f);
        var rect = new RectangleF(x, y, 46, 46);
        FillRound(g, bg, rect, 14);
        g.DrawPath(border, RoundPath(rect, 14));
        if (kind == "traffic")
        {
            DrawTrafficLightIcon(g, x + 23, y + 23, active ? Color.FromArgb(34, 197, 94) : Color.FromArgb(22, 163, 74));
        }
        else
        {
            DrawPin(g, x + 23, y + 24, active ? Color.White : Color.FromArgb(15, 23, 42), active ? Color.FromArgb(15, 23, 42) : Color.White, 34);
        }
    }

    private static void DrawZoomIcon(Graphics g, float x, float y, bool zoomed)
    {
        using var bg = new SolidBrush(Color.FromArgb(15, 23, 42));
        FillRound(g, bg, new RectangleF(x, y, 48, 48), 14);
        DrawZoomGlyph(g, x + 24, y + 24, zoomed, Color.White);
    }

    private static void DrawZoomGlyph(Graphics g, float x, float y, bool zoomed, Color color)
    {
        using var pen = new Pen(color, 4) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawEllipse(pen, x - 11, y - 12, 18, 18);
        g.DrawLine(pen, x + 4, y + 5, x + 14, y + 15);
        g.DrawLine(pen, x - 6, y - 3, x + 2, y - 3);
        if (!zoomed) g.DrawLine(pen, x - 2, y - 7, x - 2, y + 1);
    }

    private static void DrawTrafficLightIcon(Graphics g, float x, float y, Color color)
    {
        using var pen = new Pen(color, 3.5f);
        using var body = RoundPath(new RectangleF(x - 9, y - 17, 18, 34), 6);
        g.DrawPath(pen, body);
        using var fill = new SolidBrush(color);
        g.FillEllipse(fill, x - 3, y - 10, 6, 6);
        g.FillEllipse(fill, x - 3, y - 1, 6, 6);
        g.FillEllipse(fill, x - 3, y + 8, 6, 6);
    }

    private static void DrawPin(Graphics g, float x, float y, Color fill, Color stroke, float size = 42)
    {
        var r = size / 2f;
        using var path = new GraphicsPath();
        path.AddBezier(x, y + r, x - r, y - 2, x - r, y - r, x, y - r);
        path.AddBezier(x, y - r, x + r, y - r, x + r, y - 2, x, y + r);
        path.CloseFigure();
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(stroke, 3);
        g.FillPath(brush, path);
        g.DrawPath(pen, path);
        using var hole = new SolidBrush(stroke);
        g.FillEllipse(hole, x - size * 0.13f, y - size * 0.36f, size * 0.26f, size * 0.26f);
    }

    private static void DrawLegend(Graphics g, float x, float y)
    {
        DrawLegendItem(g, x, y, "Merah", Color.FromArgb(239, 68, 68));
        DrawLegendItem(g, x + 76, y, "Kuning", Color.FromArgb(250, 204, 21));
        DrawLegendItem(g, x + 168, y, "Hijau", Color.FromArgb(34, 197, 94));
    }

    private static void DrawLegendItem(Graphics g, float x, float y, string text, Color color)
    {
        using var dot = new SolidBrush(color);
        g.FillEllipse(dot, x, y + 5, 10, 10);
        DrawSmallText(g, text, x + 14, y, Color.FromArgb(138, 148, 166), 14, true);
    }

    private static void DrawPolyline(Graphics g, RectangleF plot, ItsWidgetSnapshot snapshot, int phase)
    {
        var count = Math.Max(0, snapshot.VehicleCount);
        var points = new[]
        {
            new PointF(plot.Left, plot.Bottom),
            new PointF(plot.Left + plot.Width * 0.28f, plot.Bottom - Math.Min(10, Math.Max(1, count / 3f)) * plot.Height / 10f),
            new PointF(plot.Left + plot.Width * 0.54f, plot.Bottom - Math.Min(10, snapshot.YellowSeconds + phase % 2) * plot.Height / 10f),
            new PointF(plot.Left + plot.Width * 0.78f, plot.Bottom - Math.Min(10, snapshot.GreenSeconds) * plot.Height / 10f),
            new PointF(plot.Right - 8, plot.Bottom - Math.Min(10, snapshot.RedSeconds) * plot.Height / 10f),
        };
        using var line = new Pen(Color.FromArgb(135, 77, 141, 255), 2.2f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
            DashStyle = snapshot.Status.Equals("online", StringComparison.OrdinalIgnoreCase) ? DashStyle.Solid : DashStyle.Dash,
        };
        g.DrawLines(line, points);
    }

    private static void DrawHistoryChart(Graphics g, RectangleF plot, IReadOnlyList<ItsWidgetChartPoint> points, int phase)
    {
        if (points.Count == 0) return;
        var maxY = Math.Max(10, points.Max(point => Math.Max(point.RedSeconds, Math.Max(point.YellowSeconds, point.GreenSeconds))));
        maxY = Math.Max(maxY, points.Max(point => point.ActiveSeconds));
        var stepX = points.Count == 1 ? 0 : plot.Width / (points.Count - 1);
        var linePoints = points.Select((point, index) =>
        {
            var x = points.Count == 1 ? plot.Left + plot.Width * 0.18f : plot.Left + stepX * index;
            var y = plot.Bottom - Math.Clamp(point.ActiveSeconds / (float)maxY, 0, 1) * plot.Height;
            return new PointF(x, y);
        }).ToArray();

        if (linePoints.Length > 1)
        {
            using var shadow = new Pen(Color.FromArgb(52, 56, 189, 248), 7)
            {
                StartCap = LineCap.Round,
                EndCap = LineCap.Round,
                LineJoin = LineJoin.Round,
            };
            using var line = new Pen(Color.FromArgb(148, 56, 189, 248), 2.4f)
            {
                StartCap = LineCap.Round,
                EndCap = LineCap.Round,
                LineJoin = LineJoin.Round,
            };
            g.DrawLines(shadow, linePoints);
            g.DrawLines(line, linePoints);
        }

        for (var i = 0; i < linePoints.Length; i++)
        {
            var point = points[i];
            DrawChartPoint(g, linePoints[i].X, linePoints[i].Y, TrafficColor(point.TrafficColor), phase + i);
            DrawSmallText(g, point.VehicleCount.ToString(), linePoints[i].X - 6, plot.Bottom + 12, Color.FromArgb(148, 163, 184), 11, true);
        }

        var last = points[^1];
        DrawSmallText(g, $"{TrafficLabel(last.TrafficColor)} {last.ActiveSeconds}s", plot.Right - 112, plot.Bottom + 12, TrafficColor(last.TrafficColor), 13, true);
    }

    private static void DrawChartPoint(Graphics g, float x, float y, Color color, int phase)
    {
        var r = 7 + phase % 3;
        using var glow = new SolidBrush(Color.FromArgb(48, color));
        using var fill = new SolidBrush(color);
        g.FillEllipse(glow, x - r * 2, y - r * 2, r * 4, r * 4);
        g.FillEllipse(fill, x - r, y - r, r * 2, r * 2);
        using var ring = new Pen(Color.FromArgb(233, 238, 245), 2);
        g.DrawEllipse(ring, x - r, y - r, r * 2, r * 2);
    }

    private static void DrawCarouselDots(Graphics g, float x, float y, int count, int active, Color color)
    {
        for (var i = 0; i < count; i++)
        {
            using var brush = new SolidBrush(i == active ? Color.White : Color.FromArgb(140, color));
            var size = i == active ? 8 : 6;
            g.FillEllipse(brush, x + i * 18, y, size, size);
        }
    }

    private static void DrawCorners(Graphics g, RectangleF r, Pen pen)
    {
        var len = Math.Min(34, Math.Max(18, Math.Min(r.Width, r.Height) * 0.27f));
        g.DrawLine(pen, r.Left, r.Top, r.Left + len, r.Top);
        g.DrawLine(pen, r.Left, r.Top, r.Left, r.Top + len);
        g.DrawLine(pen, r.Right, r.Top, r.Right - len, r.Top);
        g.DrawLine(pen, r.Right, r.Top, r.Right, r.Top + len);
        g.DrawLine(pen, r.Left, r.Bottom, r.Left + len, r.Bottom);
        g.DrawLine(pen, r.Left, r.Bottom, r.Left, r.Bottom - len);
        g.DrawLine(pen, r.Right, r.Bottom, r.Right - len, r.Bottom);
        g.DrawLine(pen, r.Right, r.Bottom, r.Right, r.Bottom - len);
    }

    private static void DrawImageCover(Graphics g, Image image, RectangleF rect)
    {
        var scale = Math.Max(rect.Width / image.Width, rect.Height / image.Height);
        var w = image.Width * scale;
        var h = image.Height * scale;
        var x = rect.Left + (rect.Width - w) / 2f;
        var y = rect.Top + (rect.Height - h) / 2f;
        g.DrawImage(image, x, y, w, h);
    }

    private static Image? LoadImage(string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return null;
        try
        {
            byte[] bytes;
            if (source.StartsWith("data:image", StringComparison.OrdinalIgnoreCase))
            {
                var comma = source.IndexOf(',');
                bytes = Convert.FromBase64String(source[(comma + 1)..]);
            }
            else if (Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Scheme.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                var key = source;
                if (!ImageCache.TryGetValue(key, out var cached) || DateTimeOffset.UtcNow - cached.At > TimeSpan.FromMinutes(20))
                {
                    bytes = Http.GetByteArrayAsync(uri).GetAwaiter().GetResult();
                    ImageCache[key] = (DateTimeOffset.UtcNow, bytes);
                }
                else
                {
                    bytes = cached.Bytes;
                }
            }
            else if (File.Exists(source))
            {
                bytes = File.ReadAllBytes(source);
            }
            else
            {
                return null;
            }

            using var stream = new MemoryStream(bytes);
            using var decoded = Image.FromStream(stream);
            return new Bitmap(decoded);
        }
        catch
        {
            return null;
        }
    }

    private static (double x, double y) LatLngToTile(double lat, double lng, int zoom)
    {
        var n = Math.Pow(2, zoom);
        var x = (lng + 180.0) / 360.0 * n;
        var latRad = lat * Math.PI / 180.0;
        var y = (1.0 - Math.Log(Math.Tan(latRad) + 1.0 / Math.Cos(latRad)) / Math.PI) / 2.0 * n;
        return (x, y);
    }

    private static (double x, double y) LatLngToPixel(double lat, double lng, int zoom)
    {
        var tile = LatLngToTile(lat, lng, zoom);
        return (tile.x * 256, tile.y * 256);
    }

    private static void Prepare(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
    }

    private static int SnapshotIndex() => (int)((DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 10) % 2);

    private static string ScanGlyph(int phase) => (Math.Abs(phase) % 4) switch
    {
        0 => "#---",
        1 => "-#--",
        2 => "--#-",
        _ => "---#",
    };

    private static Color StatusColor(string status) => status.Equals("online", StringComparison.OrdinalIgnoreCase)
        ? Color.FromArgb(22, 163, 74)
        : Color.FromArgb(225, 29, 72);

    private static Color TrafficColor(string color) => color switch
    {
        "green" => Color.FromArgb(34, 197, 94),
        "yellow" => Color.FromArgb(250, 204, 21),
        _ => Color.FromArgb(239, 68, 68),
    };

    private static string TrafficLabel(string color) => color switch
    {
        "green" => "Hijau",
        "yellow" => "Kuning",
        _ => "Merah",
    };

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

    private static GraphicsPath RoundPath(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void FillRound(Graphics g, Brush brush, RectangleF rect, float radius)
    {
        using var path = RoundPath(rect, radius);
        g.FillPath(brush, path);
    }

    private static void DrawSmallText(Graphics g, string text, float x, float y, Color color, float size, bool bold, float rotate = 0)
    {
        using var font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(color);
        if (Math.Abs(rotate) > 0.1f)
        {
            var state = g.Save();
            g.TranslateTransform(x, y);
            g.RotateTransform(rotate);
            g.DrawString(text, font, brush, 0, 0);
            g.Restore(state);
            return;
        }

        g.DrawString(text, font, brush, x, y);
    }

    private static string EncodePng(Bitmap bitmap)
    {
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
    }
}
