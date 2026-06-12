using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace ItsMapsInstaller;

public partial class MainWindow : Window, INotifyPropertyChanged
{
    private readonly InstallerServices _services = new();
    private InstallPage _page = InstallPage.Welcome;
    private string _installPath;
    private double _progressValue;
    private string _progressText = "0%";
    private string _installStatus = "Menyiapkan instalasi...";
    private string _availableSpaceText;
    private bool _installForAllUsers;
    private bool _createDesktopShortcut = true;
    private bool _runAfterInstall = true;
    private bool _openInstallFolder;
    private bool _installCompleted;

    public MainWindow()
    {
        _installPath = InstallerServices.GetDefaultInstallPath(false);
        _availableSpaceText = GetAvailableSpaceText(_installPath);
        DataContext = this;
        InitializeComponent();
        RefreshPage();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ImageSource CurrentBackground { get; private set; } = LoadBackground("welcome.png");
    public IReadOnlyList<StepVisual> Steps { get; private set; } = BuildSteps(InstallPage.Welcome);
    public string HeaderTitle { get; private set; } = "ITS Maps";
    public string HeaderHeadline { get; private set; } = "Selamat Datang";
    public double HeaderTitleSize { get; private set; } = 58;
    public double PageTitleSize { get; private set; } = 58;
    public string PageSubtitle { get; private set; } = "Aplikasi ini dikembangkan oleh Mahasiswa Telkom University";
    public Thickness HeaderSubtitleMargin { get; private set; } = new(0, 200, 0, 0);
    public string NextButtonText { get; private set; } = "Berikutnya >";
    public string CancelButtonText { get; private set; } = "Batal";
    public string LicenseText => LicenseCopy;

    public string InstallPath
    {
        get => _installPath;
        set
        {
            if (_installPath == value) return;
            _installPath = value;
            AvailableSpaceText = GetAvailableSpaceText(_installPath);
            OnPropertyChanged(nameof(InstallPath));
        }
    }

    public string AvailableSpaceText
    {
        get => _availableSpaceText;
        private set
        {
            if (_availableSpaceText == value) return;
            _availableSpaceText = value;
            OnPropertyChanged(nameof(AvailableSpaceText));
        }
    }

    public bool InstallForAllUsers
    {
        get => _installForAllUsers;
        set
        {
            if (_installForAllUsers == value) return;
            _installForAllUsers = value;
            InstallPath = InstallerServices.GetDefaultInstallPath(value);
            OnPropertyChanged(nameof(InstallForAllUsers));
            OnPropertyChanged(nameof(InstallForCurrentUser));
        }
    }

    public bool InstallForCurrentUser
    {
        get => !_installForAllUsers;
        set
        {
            if (value)
            {
                InstallForAllUsers = false;
            }
        }
    }

    public bool CreateDesktopShortcut
    {
        get => _createDesktopShortcut;
        set
        {
            if (_createDesktopShortcut == value) return;
            _createDesktopShortcut = value;
            OnPropertyChanged(nameof(CreateDesktopShortcut));
        }
    }

    public bool RunAfterInstall
    {
        get => _runAfterInstall;
        set
        {
            if (_runAfterInstall == value) return;
            _runAfterInstall = value;
            OnPropertyChanged(nameof(RunAfterInstall));
        }
    }

    public bool OpenInstallFolder
    {
        get => _openInstallFolder;
        set
        {
            if (_openInstallFolder == value) return;
            _openInstallFolder = value;
            OnPropertyChanged(nameof(OpenInstallFolder));
        }
    }

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

    public string InstallStatus
    {
        get => _installStatus;
        private set
        {
            if (_installStatus == value) return;
            _installStatus = value;
            OnPropertyChanged(nameof(InstallStatus));
        }
    }

    public Visibility LogoVisibility => Visibility.Visible;
    public Visibility HeaderHeadlineVisibility => _page == InstallPage.Welcome ? Visibility.Visible : Visibility.Collapsed;
    public Visibility WelcomeVisibility => _page == InstallPage.Welcome ? Visibility.Visible : Visibility.Collapsed;
    public Visibility LicenseVisibility => _page == InstallPage.License ? Visibility.Visible : Visibility.Collapsed;
    public Visibility OptionsVisibility => _page == InstallPage.Options ? Visibility.Visible : Visibility.Collapsed;
    public Visibility LocationVisibility => _page == InstallPage.Location ? Visibility.Visible : Visibility.Collapsed;
    public Visibility InstallingVisibility => _page == InstallPage.Installing ? Visibility.Visible : Visibility.Collapsed;
    public Visibility FinishedVisibility => _page == InstallPage.Finished ? Visibility.Visible : Visibility.Collapsed;
    public bool BackEnabled => _page > InstallPage.Welcome && _page < InstallPage.Installing;
    public Visibility BackVisibility => _page == InstallPage.Finished ? Visibility.Collapsed : Visibility.Visible;
    public Visibility CancelVisibility => Visibility.Visible;
    public Visibility NextVisibility => _page == InstallPage.Installing ? Visibility.Collapsed : Visibility.Visible;

    private static ImageSource LoadBackground(string fileName)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.UriSource = new Uri($"pack://application:,,,/Assets/{fileName}", UriKind.Absolute);
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.EndInit();
        image.Freeze();
        return image;
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

    private void OnBrowse(object sender, RoutedEventArgs e)
    {
        using var dialog = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Pilih folder instalasi ITS Maps",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true,
            SelectedPath = Directory.Exists(InstallPath) ? InstallPath : Path.GetDirectoryName(InstallPath) ?? InstallerServices.GetDefaultInstallPath(InstallForAllUsers)
        };

        var owner = new DialogOwner(new WindowInteropHelper(this).Handle);
        if (dialog.ShowDialog(owner) == System.Windows.Forms.DialogResult.OK)
        {
            InstallPath = Path.Combine(dialog.SelectedPath, "ITS Maps");
        }
    }

    private void OnBack(object sender, RoutedEventArgs e)
    {
        if (_page <= InstallPage.Welcome || _page == InstallPage.Installing) return;
        _page--;
        RefreshPage();
    }

    private void OnCancelOrClose(object sender, RoutedEventArgs e)
    {
        if (_page == InstallPage.Finished)
        {
            Close();
            return;
        }

        var result = System.Windows.MessageBox.Show(
            "Batalkan instalasi ITS Maps?",
            "ITS Maps Setup",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result == MessageBoxResult.Yes)
        {
            Close();
        }
    }

    private async void OnNext(object sender, RoutedEventArgs e)
    {
        if (_page == InstallPage.Location)
        {
            await StartInstallAsync();
            return;
        }

        if (_page == InstallPage.Finished)
        {
            LaunchAppAndClose();
            return;
        }

        _page++;
        RefreshPage();
    }

    private async Task StartInstallAsync()
    {
        _page = InstallPage.Installing;
        RefreshPage();

        try
        {
            await _services.InstallAsync(
                InstallPath,
                createDesktopShortcut: CreateDesktopShortcut,
                runAfterInstall: RunAfterInstall,
                new Progress<InstallerProgress>(OnInstallProgress));

            _installCompleted = true;
            ProgressValue = 100;
            InstallStatus = "Instalasi selesai.";
            await Task.Delay(450);
            _page = InstallPage.Finished;
            RefreshPage();
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Instalasi gagal.\n\n{ex.Message}",
                "ITS Maps Setup",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            _page = InstallPage.Location;
            RefreshPage();
        }
    }

    private void OnInstallProgress(InstallerProgress progress)
    {
        ProgressValue = progress.Percent;
        InstallStatus = progress.Message;
    }

    private void LaunchAppAndClose()
    {
        if (_installCompleted && OpenInstallFolder && Directory.Exists(InstallPath))
        {
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{InstallPath}\"") { UseShellExecute = true });
        }

        if (_installCompleted && RunAfterInstall)
        {
            var appExe = Path.Combine(InstallPath, InstallerServices.AppExeName);
            if (File.Exists(appExe))
            {
                Process.Start(new ProcessStartInfo(appExe) { UseShellExecute = true });
            }
        }

        Close();
    }

    private void RefreshPage()
    {
        CurrentBackground = LoadBackground(_page switch
        {
            InstallPage.Welcome => "welcome.png",
            InstallPage.License => "lisensi.png",
            InstallPage.Options => "pilihopsiinstaller.png",
            InstallPage.Location => "opsipenyimpananapps.png",
            InstallPage.Installing => "prosesinstalisasi.png",
            InstallPage.Finished => "selesaiinstaller.png",
            _ => "welcome.png"
        });

        Steps = BuildSteps(_page);
        ApplyHeaderText();
        NextButtonText = _page switch
        {
            InstallPage.License => "Saya Setuju",
            InstallPage.Location => "Instal",
            InstallPage.Finished => "Mulai",
            _ => "Berikutnya >"
        };
        CancelButtonText = _page == InstallPage.Finished ? "Tutup" : "Batal";

        OnPropertyChanged(nameof(CurrentBackground));
        OnPropertyChanged(nameof(Steps));
        OnPropertyChanged(nameof(HeaderTitle));
        OnPropertyChanged(nameof(HeaderHeadline));
        OnPropertyChanged(nameof(HeaderTitleSize));
        OnPropertyChanged(nameof(PageTitleSize));
        OnPropertyChanged(nameof(PageSubtitle));
        OnPropertyChanged(nameof(HeaderSubtitleMargin));
        OnPropertyChanged(nameof(NextButtonText));
        OnPropertyChanged(nameof(CancelButtonText));
        OnPropertyChanged(nameof(AvailableSpaceText));
        OnPropertyChanged(nameof(InstallForAllUsers));
        OnPropertyChanged(nameof(InstallForCurrentUser));
        OnPropertyChanged(nameof(CreateDesktopShortcut));
        OnPropertyChanged(nameof(RunAfterInstall));
        OnPropertyChanged(nameof(OpenInstallFolder));
        OnPropertyChanged(nameof(LogoVisibility));
        OnPropertyChanged(nameof(HeaderHeadlineVisibility));
        OnPropertyChanged(nameof(WelcomeVisibility));
        OnPropertyChanged(nameof(LicenseVisibility));
        OnPropertyChanged(nameof(OptionsVisibility));
        OnPropertyChanged(nameof(LocationVisibility));
        OnPropertyChanged(nameof(InstallingVisibility));
        OnPropertyChanged(nameof(FinishedVisibility));
        OnPropertyChanged(nameof(BackEnabled));
        OnPropertyChanged(nameof(BackVisibility));
        OnPropertyChanged(nameof(CancelVisibility));
        OnPropertyChanged(nameof(NextVisibility));
    }

    private void ApplyHeaderText()
    {
        HeaderTitle = _page switch
        {
            InstallPage.Welcome => "ITS Maps",
            InstallPage.License => "Perjanjian Lisensi",
            InstallPage.Options => "Pilih Opsi Instalasi",
            InstallPage.Location => "Pilih Lokasi Instalasi",
            InstallPage.Installing => "Sedang Menginstal",
            InstallPage.Finished => "Instalasi Selesai",
            _ => "ITS Maps"
        };

        HeaderHeadline = _page == InstallPage.Welcome ? "Selamat Datang" : string.Empty;
        HeaderTitleSize = _page == InstallPage.Welcome ? 58 : 48;
        PageTitleSize = _page == InstallPage.Welcome ? 58 : 48;
        HeaderSubtitleMargin = _page == InstallPage.Welcome ? new Thickness(0, 200, 0, 0) : new Thickness(0, 96, 0, 0);
        PageSubtitle = _page switch
        {
            InstallPage.Welcome => "Aplikasi ini dikembangkan oleh Mahasiswa Telkom University",
            InstallPage.License => "Harap baca dengan saksama perjanjian lisensi berikut sebelum melanjutkan instalasi.",
            InstallPage.Options => "Pilih opsi instalasi yang paling sesuai dengan kebutuhan Anda.",
            InstallPage.Location => "Pilih folder tujuan untuk menginstal ITS Maps.\nProgram akan diinstal pada folder berikut.",
            InstallPage.Installing => "Setup sedang menginstal file ITS Maps di komputer Anda.",
            InstallPage.Finished => "ITS Maps telah berhasil diinstal dan siap digunakan.",
            _ => string.Empty
        };
    }

    private static StepVisual[] BuildSteps(InstallPage page)
    {
        string[] labels = ["Sambutan", "Lisensi", "Opsi", "Lokasi", "Instalasi", "Selesai"];
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
                NumberBrush: isActive ? System.Windows.Media.Brushes.White : BrushFrom("#7080a1"),
                LabelBrush: isActive ? BrushFrom("#075ed6") : BrushFrom("#647294"),
                LabelWeight: isActive ? FontWeights.SemiBold : FontWeights.Normal);
        }

        return steps;
    }

    private static SolidColorBrush BrushFrom(string color)
    {
        var brush = new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color));
        brush.Freeze();
        return brush;
    }

    private static string GetAvailableSpaceText(string installPath)
    {
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(installPath));
            if (!string.IsNullOrWhiteSpace(root))
            {
                var drive = new DriveInfo(root);
                if (drive.IsReady)
                {
                    var availableGb = drive.AvailableFreeSpace / 1024d / 1024d / 1024d;
                    return $"Ruang tersedia: {availableGb:0.0} GB";
                }
            }
        }
        catch
        {
            // The path may be partially typed by the user; keep the UI stable.
        }

        return "Ruang tersedia: mengikuti drive tujuan";
    }

    private void OnPropertyChanged(string propertyName) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));

    private const string LicenseCopy =
        """
        PERJANJIAN LISENSI PENGGUNA AKHIR
        ITS MAPS WINDOWS

        Harap baca perjanjian lisensi pengguna akhir ini dengan saksama sebelum menginstal atau menggunakan aplikasi ITS Maps. Dengan menginstal, menyalin, atau menggunakan aplikasi ini, Anda menyetujui syarat dan ketentuan berikut.

        1. DEFINISI
        "Aplikasi" berarti perangkat lunak ITS Maps beserta seluruh pembaruan, modul, dan dokumentasi yang menyertainya.

        2. LISENSI PENGGUNAAN
        Kami memberikan lisensi terbatas, non-eksklusif, dan tidak dapat dipindahtangankan untuk menggunakan aplikasi pada perangkat yang Anda miliki atau kendalikan.

        3. PENGGUNAAN APLIKASI
        Anda setuju untuk menggunakan aplikasi sesuai hukum yang berlaku dan tidak melakukan rekayasa balik, dekompilasi, modifikasi, atau distribusi ulang tanpa izin.

        4. DATA DAN MONITORING
        Aplikasi ini dapat memproses data lokasi, lalu lintas realtime, kamera, serta informasi perangkat untuk menyediakan fitur sinkronisasi dan pemantauan.

        5. JARINGAN DAN LAYANAN PIHAK KETIGA
        Aplikasi memerlukan koneksi internet dan dapat menggunakan layanan peta, kamera, serta layanan jaringan lain sesuai konfigurasi pengguna.

        6. PRIVASI
        Data yang dikumpulkan akan diproses untuk kebutuhan aplikasi dan pengembangan layanan. Pengguna bertanggung jawab atas konfigurasi perangkat dan sumber data yang dipakai.

        7. DUKUNGAN
        Dukungan teknis disediakan sesuai kebijakan pengembang dan dapat berubah sewaktu-waktu.
        """;
}

internal enum InstallPage
{
    Welcome,
    License,
    Options,
    Location,
    Installing,
    Finished
}

public sealed record StepVisual(
    string Number,
    string Label,
    System.Windows.Media.Brush Fill,
    System.Windows.Media.Brush Stroke,
    System.Windows.Media.Brush NumberBrush,
    System.Windows.Media.Brush LabelBrush,
    FontWeight LabelWeight);

internal sealed class DialogOwner(IntPtr handle) : System.Windows.Forms.IWin32Window
{
    public IntPtr Handle { get; } = handle;
}
