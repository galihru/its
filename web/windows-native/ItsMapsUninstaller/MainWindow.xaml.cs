using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;

namespace ItsMapsUninstaller;

public partial class MainWindow : Window, INotifyPropertyChanged
{
    private readonly UninstallerServices _services;
    private UninstallPage _page = UninstallPage.Welcome;
    private double _progressValue;
    private string _progressText = "0%";
    private string _statusText = "Menunggu konfirmasi...";
    private bool _removeAppData = true;
    private bool _removeMapCache = true;
    private bool _removeDeviceConfig = true;

    public MainWindow(UninstallerServices services)
    {
        _services = services;
        RemovalItems = new ObservableCollection<RemovalItemVisual>(BuildRemovalItems());
        DataContext = this;
        InitializeComponent();
        Refresh();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ObservableCollection<RemovalItemVisual> RemovalItems { get; }
    public string InstallPath => _services.InstallPath;
    public StepVisual[] Steps { get; private set; } = BuildSteps(UninstallPage.Welcome);
    public string TitleText { get; private set; } = "Uninstall ITS Maps";
    public string BodyText { get; private set; } = "Wizard ini akan membantu menghapus ITS Maps dari komputer Anda dengan aman.";
    public string NextButtonText { get; private set; } = "Berikutnya >";

    public bool RemoveAppData
    {
        get => _removeAppData;
        set
        {
            if (_removeAppData == value) return;
            _removeAppData = value;
            OnPropertyChanged(nameof(RemoveAppData));
        }
    }

    public bool RemoveMapCache
    {
        get => _removeMapCache;
        set
        {
            if (_removeMapCache == value) return;
            _removeMapCache = value;
            OnPropertyChanged(nameof(RemoveMapCache));
        }
    }

    public bool RemoveDeviceConfig
    {
        get => _removeDeviceConfig;
        set
        {
            if (_removeDeviceConfig == value) return;
            _removeDeviceConfig = value;
            OnPropertyChanged(nameof(RemoveDeviceConfig));
        }
    }

    public Visibility WelcomeVisibility => _page == UninstallPage.Welcome ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ConfirmVisibility => _page == UninstallPage.Confirm ? Visibility.Visible : Visibility.Collapsed;
    public Visibility DataVisibility => _page == UninstallPage.Data ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ProgressVisibility => _page == UninstallPage.Progress ? Visibility.Visible : Visibility.Collapsed;
    public Visibility DoneVisibility => _page == UninstallPage.Done ? Visibility.Visible : Visibility.Collapsed;
    public bool BackEnabled => _page is UninstallPage.Confirm or UninstallPage.Data;
    public Visibility BackVisibility => _page is UninstallPage.Welcome or UninstallPage.Progress or UninstallPage.Done ? Visibility.Collapsed : Visibility.Visible;
    public Visibility CancelVisibility => _page == UninstallPage.Done ? Visibility.Collapsed : Visibility.Visible;
    public Visibility NextVisibility => _page == UninstallPage.Progress ? Visibility.Collapsed : Visibility.Visible;

    public double ProgressValue
    {
        get => _progressValue;
        private set
        {
            if (Math.Abs(_progressValue - value) < 0.1) return;
            _progressValue = value;
            _progressText = $"{Math.Round(value):0}%";
            OnPropertyChanged(nameof(ProgressValue));
            OnPropertyChanged(nameof(ProgressText));
        }
    }

    public string ProgressText => _progressText;

    public string StatusText
    {
        get => _statusText;
        private set
        {
            if (_statusText == value) return;
            _statusText = value;
            OnPropertyChanged(nameof(StatusText));
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var workArea = SystemParameters.WorkArea;
        if (Width > workArea.Width - 80)
        {
            Width = Math.Max(MinWidth, workArea.Width - 80);
        }

        if (Height > workArea.Height - 80)
        {
            Height = Math.Max(MinHeight, workArea.Height - 80);
        }
    }

    private void OnTitleBarMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
        {
            DragMove();
        }
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void OnMaximizeRestore(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private void OnBack(object sender, RoutedEventArgs e)
    {
        if (_page == UninstallPage.Confirm)
        {
            _page = UninstallPage.Welcome;
        }
        else if (_page == UninstallPage.Data)
        {
            _page = UninstallPage.Confirm;
        }

        Refresh();
    }

    private void OnCancel(object sender, RoutedEventArgs e) => Close();

    private async void OnNext(object sender, RoutedEventArgs e)
    {
        if (_page == UninstallPage.Done)
        {
            _services.StartDeferredCleanup();
            Close();
            return;
        }

        if (_page == UninstallPage.Data)
        {
            await StartUninstallAsync();
            return;
        }

        _page++;
        Refresh();
    }

    private async Task StartUninstallAsync()
    {
        _page = UninstallPage.Progress;
        ResetRemovalItems();
        Refresh();

        try
        {
            var options = new UninstallOptions(RemoveAppData, RemoveMapCache, RemoveDeviceConfig);
            await _services.UninstallAsync(options, new Progress<UninstallProgress>(OnProgress));
            ProgressValue = 100;
            StatusText = "Uninstall selesai. Folder aplikasi akan dibersihkan setelah wizard ditutup.";
            UpdateRemovalStatus(100);
            await Task.Delay(650);
            _page = UninstallPage.Done;
            Refresh();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Uninstall gagal.\n\n{ex.Message}",
                "Uninstall ITS Maps",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            _page = UninstallPage.Confirm;
            Refresh();
        }
    }

    private void OnProgress(UninstallProgress progress)
    {
        ProgressValue = progress.Percent;
        StatusText = progress.Message;
        UpdateRemovalStatus(progress.Percent);
    }

    private void Refresh()
    {
        Steps = BuildSteps(_page);
        TitleText = _page switch
        {
            UninstallPage.Welcome => "Uninstall ITS Maps",
            UninstallPage.Confirm => "Konfirmasi Penghapusan",
            UninstallPage.Data => "Pilih Data yang Dihapus",
            UninstallPage.Progress => "Proses Penghapusan",
            UninstallPage.Done => "Uninstall Selesai",
            _ => "Uninstall ITS Maps"
        };

        BodyText = _page switch
        {
            UninstallPage.Welcome => "Wizard ini akan membantu menghapus ITS Maps dari komputer Anda.",
            UninstallPage.Confirm => "Apakah Anda yakin menguninstall aplikasi ini? Jika iya, silakan klik Berikutnya.",
            UninstallPage.Data => "Pilih data yang ikut dibersihkan agar instalasi berikutnya benar-benar segar.",
            UninstallPage.Progress => "Mohon tunggu, proses penghapusan sedang berjalan dan setiap bagian ditampilkan di bawah.",
            UninstallPage.Done => "ITS Maps telah berhasil dihapus dari komputer Anda.",
            _ => ""
        };

        NextButtonText = _page == UninstallPage.Done ? "Selesai" : "Berikutnya >";

        OnPropertyChanged(nameof(Steps));
        OnPropertyChanged(nameof(TitleText));
        OnPropertyChanged(nameof(BodyText));
        OnPropertyChanged(nameof(NextButtonText));
        OnPropertyChanged(nameof(WelcomeVisibility));
        OnPropertyChanged(nameof(ConfirmVisibility));
        OnPropertyChanged(nameof(DataVisibility));
        OnPropertyChanged(nameof(ProgressVisibility));
        OnPropertyChanged(nameof(DoneVisibility));
        OnPropertyChanged(nameof(BackEnabled));
        OnPropertyChanged(nameof(BackVisibility));
        OnPropertyChanged(nameof(CancelVisibility));
        OnPropertyChanged(nameof(NextVisibility));
    }

    private void ResetRemovalItems()
    {
        foreach (var item in RemovalItems)
        {
            item.Status = "Menunggu";
            item.DotBrush = BrushFrom("#c0cadb");
            item.StatusBrush = BrushFrom("#66718d");
        }
    }

    private void UpdateRemovalStatus(double percent)
    {
        SetItem(0, percent >= 8, percent >= 20);
        SetItem(1, percent >= 24, percent >= 38);
        SetItem(2, percent >= 42, percent >= 58 || !RemoveAppData);
        SetItem(3, percent >= 58, percent >= 74 || !RemoveMapCache);
        SetItem(4, percent >= 74, percent >= 96);
    }

    private void SetItem(int index, bool active, bool done)
    {
        if (index < 0 || index >= RemovalItems.Count) return;
        var item = RemovalItems[index];
        item.Status = done ? "Selesai" : active ? "Diproses" : "Menunggu";
        item.DotBrush = done ? BrushFrom("#25c46a") : active ? BrushFrom("#075ed6") : BrushFrom("#c0cadb");
        item.StatusBrush = done ? BrushFrom("#18884d") : active ? BrushFrom("#075ed6") : BrushFrom("#66718d");
    }

    private static RemovalItemVisual[] BuildRemovalItems() =>
    [
        new("Shortcut", "Desktop, Start Menu, dan link uninstall", "Menunggu"),
        new("Installed apps", "Registry Windows agar tidak tersisa di daftar aplikasi", "Menunggu"),
        new("Data aplikasi", "History, Local Storage, cache Electron, dan preferensi lokal", "Menunggu"),
        new("Peta dan Raspberry", "Cache peta, POI, sesi kamera, dan konfigurasi perangkat", "Menunggu"),
        new("Folder instalasi", "Aplikasi, runtime, model AI offline, dan uninstaller", "Menunggu")
    ];

    private static StepVisual[] BuildSteps(UninstallPage page)
    {
        string[] labels = ["Sambutan", "Konfirmasi", "Data", "Proses", "Selesai"];
        var activeIndex = (int)page;
        var steps = new StepVisual[labels.Length];

        for (var i = 0; i < labels.Length; i++)
        {
            var isActive = i == activeIndex;
            steps[i] = new StepVisual(
                Number: (i + 1).ToString(),
                Label: labels[i],
                Fill: isActive ? BrushFrom("#075ed6") : BrushFrom("#f8fbff"),
                Stroke: isActive ? BrushFrom("#075ed6") : BrushFrom("#c7d2e6"),
                NumberBrush: isActive ? Brushes.White : BrushFrom("#7080a1"),
                LabelBrush: isActive ? BrushFrom("#075ed6") : BrushFrom("#647294"),
                LabelWeight: isActive ? FontWeights.SemiBold : FontWeights.Normal);
        }

        return steps;
    }

    private static SolidColorBrush BrushFrom(string color)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
        brush.Freeze();
        return brush;
    }

    private void OnPropertyChanged(string propertyName) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}

internal enum UninstallPage
{
    Welcome,
    Confirm,
    Data,
    Progress,
    Done
}

public sealed record StepVisual(
    string Number,
    string Label,
    Brush Fill,
    Brush Stroke,
    Brush NumberBrush,
    Brush LabelBrush,
    FontWeight LabelWeight);

public sealed class RemovalItemVisual : INotifyPropertyChanged
{
    private string _status;
    private Brush _dotBrush = BrushFrom("#c0cadb");
    private Brush _statusBrush = BrushFrom("#66718d");

    public RemovalItemVisual(string title, string detail, string status)
    {
        Title = title;
        Detail = detail;
        _status = status;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; }
    public string Detail { get; }

    public string Status
    {
        get => _status;
        set
        {
            if (_status == value) return;
            _status = value;
            OnPropertyChanged(nameof(Status));
        }
    }

    public Brush DotBrush
    {
        get => _dotBrush;
        set
        {
            _dotBrush = value;
            OnPropertyChanged(nameof(DotBrush));
        }
    }

    public Brush StatusBrush
    {
        get => _statusBrush;
        set
        {
            _statusBrush = value;
            OnPropertyChanged(nameof(StatusBrush));
        }
    }

    private static SolidColorBrush BrushFrom(string color)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
        brush.Freeze();
        return brush;
    }

    private void OnPropertyChanged(string propertyName) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
