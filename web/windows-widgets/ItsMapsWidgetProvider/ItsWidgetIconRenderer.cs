using System;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace ItsMapsWidgetProvider;

internal static class ItsWidgetIconRenderer
{
    private static readonly ConcurrentDictionary<string, string> Cache = new();

    public static string Icon(string name, string color = "#0f172a")
    {
        var key = $"{name}:{color}".ToLowerInvariant();
        return Cache.GetOrAdd(key, _ => Render(name, ParseColor(color)));
    }

    private static string Render(string name, Color color)
    {
        const int size = 48;
        using var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using var pen = new Pen(color, 4.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var brush = new SolidBrush(color);
        using var dim = new Pen(Color.FromArgb(125, color), 3.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };

        switch (name.ToLowerInvariant())
        {
            case "pin":
            case "location":
                DrawPin(g, brush, pen, 24, 22);
                break;
            case "target":
                g.DrawEllipse(pen, 12, 12, 24, 24);
                g.DrawLine(pen, 24, 6, 24, 14);
                g.DrawLine(pen, 24, 34, 24, 42);
                g.DrawLine(pen, 6, 24, 14, 24);
                g.DrawLine(pen, 34, 24, 42, 24);
                break;
            case "check":
                g.DrawEllipse(dim, 8, 8, 32, 32);
                g.DrawLine(pen, 16, 25, 22, 31);
                g.DrawLine(pen, 22, 31, 34, 17);
                break;
            case "alert":
                g.DrawRoundedRectangle(pen, 12, 8, 24, 32, 8);
                g.DrawLine(pen, 24, 16, 24, 26);
                g.FillEllipse(brush, 21, 32, 6, 6);
                break;
            case "info":
                g.DrawEllipse(pen, 10, 10, 28, 28);
                g.DrawLine(pen, 24, 23, 24, 33);
                g.FillEllipse(brush, 21, 14, 6, 6);
                break;
            case "clock":
                g.DrawEllipse(pen, 9, 9, 30, 30);
                g.DrawLine(pen, 24, 16, 24, 25);
                g.DrawLine(pen, 24, 25, 31, 29);
                break;
            case "data":
                g.DrawLine(dim, 12, 38, 39, 38);
                g.DrawLine(pen, 15, 32, 15, 24);
                g.DrawLine(pen, 24, 32, 24, 15);
                g.DrawLine(pen, 33, 32, 33, 20);
                break;
            case "traffic":
                g.DrawRoundedRectangle(pen, 16, 6, 16, 36, 6);
                g.FillEllipse(brush, 21, 11, 6, 6);
                g.FillEllipse(brush, 21, 21, 6, 6);
                g.FillEllipse(brush, 21, 31, 6, 6);
                break;
            case "zoom":
                g.DrawEllipse(pen, 10, 9, 22, 22);
                g.DrawLine(pen, 28, 28, 40, 40);
                g.DrawLine(dim, 16, 20, 26, 20);
                g.DrawLine(dim, 21, 15, 21, 25);
                break;
            case "camera":
                g.DrawRoundedRectangle(pen, 8, 15, 32, 22, 6);
                g.DrawLine(pen, 16, 15, 20, 10);
                g.DrawEllipse(dim, 19, 20, 10, 10);
                break;
            case "bell":
                g.DrawArc(pen, 13, 12, 22, 24, 200, 140);
                g.DrawLine(pen, 13, 31, 35, 31);
                g.DrawLine(dim, 21, 37, 27, 37);
                break;
            case "chart":
                g.DrawLine(dim, 10, 38, 40, 38);
                g.DrawLine(dim, 10, 12, 10, 38);
                g.DrawLine(pen, 15, 30, 22, 23);
                g.DrawLine(pen, 22, 23, 29, 27);
                g.DrawLine(pen, 29, 27, 38, 15);
                break;
            case "car":
                g.DrawPath(pen, RoundedPath(new RectangleF(10, 19, 28, 13), 5));
                g.DrawLine(pen, 16, 19, 20, 13);
                g.DrawLine(pen, 20, 13, 30, 13);
                g.DrawLine(pen, 30, 13, 34, 19);
                g.FillEllipse(brush, 14, 31, 6, 6);
                g.FillEllipse(brush, 29, 31, 6, 6);
                break;
            case "motor":
                g.DrawEllipse(pen, 9, 28, 9, 9);
                g.DrawEllipse(pen, 30, 28, 9, 9);
                g.DrawLine(pen, 14, 30, 23, 21);
                g.DrawLine(pen, 23, 21, 32, 30);
                g.DrawLine(pen, 23, 21, 29, 21);
                g.DrawLine(dim, 29, 21, 36, 16);
                break;
            case "bus":
                g.DrawRoundedRectangle(pen, 10, 10, 28, 28, 6);
                g.DrawLine(dim, 15, 18, 33, 18);
                g.DrawLine(dim, 15, 26, 33, 26);
                g.FillEllipse(brush, 15, 35, 4, 4);
                g.FillEllipse(brush, 30, 35, 4, 4);
                break;
            case "truck":
                g.DrawRoundedRectangle(pen, 7, 18, 22, 15, 4);
                using (var truckCab = TruckCabPath())
                {
                    g.DrawPath(pen, truckCab);
                }
                g.FillEllipse(brush, 12, 32, 5, 5);
                g.FillEllipse(brush, 32, 32, 5, 5);
                break;
            case "bike":
                g.DrawEllipse(pen, 8, 28, 10, 10);
                g.DrawEllipse(pen, 31, 28, 10, 10);
                g.DrawLine(pen, 13, 33, 21, 21);
                g.DrawLine(pen, 21, 21, 27, 33);
                g.DrawLine(pen, 13, 33, 27, 33);
                g.DrawLine(dim, 21, 21, 31, 21);
                g.DrawLine(dim, 31, 21, 36, 16);
                break;
            default:
                g.FillEllipse(brush, 12, 12, 24, 24);
                break;
        }

        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
    }

    private static void DrawPin(Graphics g, Brush brush, Pen pen, float x, float y)
    {
        using var path = new GraphicsPath();
        path.AddBezier(x, y + 20, x - 14, y + 3, x - 14, y - 14, x, y - 14);
        path.AddBezier(x, y - 14, x + 14, y - 14, x + 14, y + 3, x, y + 20);
        path.CloseFigure();
        g.FillPath(brush, path);
        g.DrawPath(pen, path);
        var oldMode = g.CompositingMode;
        g.CompositingMode = CompositingMode.SourceCopy;
        using var hole = new SolidBrush(Color.Transparent);
        g.FillEllipse(hole, x - 4, y - 8, 8, 8);
        g.CompositingMode = oldMode;
    }

    private static GraphicsPath TruckCabPath()
    {
        var path = new GraphicsPath();
        path.AddLine(29, 23, 35, 23);
        path.AddLine(35, 23, 41, 29);
        path.AddLine(41, 29, 41, 33);
        path.AddLine(41, 33, 29, 33);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath RoundedPath(RectangleF rect, float radius)
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

    private static Color ParseColor(string color)
    {
        try
        {
            return ColorTranslator.FromHtml(color);
        }
        catch
        {
            return Color.FromArgb(15, 23, 42);
        }
    }
}

internal static class GraphicsRoundedRectangleExtensions
{
    public static void DrawRoundedRectangle(this Graphics g, Pen pen, float x, float y, float width, float height, float radius)
    {
        using var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + width - d, y, d, d, 270, 90);
        path.AddArc(x + width - d, y + height - d, d, d, 0, 90);
        path.AddArc(x, y + height - d, d, d, 90, 90);
        path.CloseFigure();
        g.DrawPath(pen, path);
    }
}
