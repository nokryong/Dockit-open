using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Windows.Data.Pdf;
using Windows.Foundation;
using Windows.Graphics.Printing;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Hosting;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Media.Imaging;
using Windows.UI.Xaml.Printing;
using Application = System.Windows.Forms.Application;

[ComImport, Guid("C5435A42-8D43-4E7B-A68A-EF311E392087"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
interface IPrintManagerInterop
{
    [return: MarshalAs(UnmanagedType.IInspectable)]
    object GetForWindow(IntPtr window, [In] ref Guid iid);
    [return: MarshalAs(UnmanagedType.IInspectable)]
    object ShowPrintUIForWindowAsync(IntPtr window, [In] ref Guid iid);
}

[ComImport, Guid("3CBcf1bf-2f76-4e9c-96ab-e84b37972554"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDesktopWindowXamlSourceNative
{
    void AttachToWindow(IntPtr window);
    IntPtr WindowHandle { get; }
}

[ComImport, Guid("905A0FEF-BC53-11DF-8C49-001E4FC686DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IBufferByteAccess
{
    void Buffer(out IntPtr value);
}

sealed class PrintRequest
{
    public string pdfPath { get; set; }
    public string title { get; set; }
    public string owner { get; set; }
    public bool diagnostic { get; set; }
}

sealed class OwnerWindow : IWin32Window
{
    public IntPtr Handle { get; private set; }
    public OwnerWindow(IntPtr handle) { Handle = handle; }
}

sealed class RenderedPage : IDisposable
{
    public InMemoryRandomAccessStream Stream;
    public WriteableBitmap Bitmap;
    public void Dispose() { if (Stream != null) Stream.Dispose(); }
}

sealed class PrintHost : Form
{
    readonly PrintRequest request;
    readonly bool selfTest;
    WindowsXamlManager xamlManager;
    DesktopWindowXamlSource xamlSource;
    Canvas xamlRoot;
    PdfDocument pdf;
    PrintDocument document;
    IPrintDocumentSource documentSource;
    PrintManager manager;
    PrintTask printTask;
    IPrintManagerInterop interop;
    readonly List<RenderedPage> printImages = new List<RenderedPage>();
    readonly List<UIElement> pageElements = new List<UIElement>();
    bool disposed;
    System.Windows.Forms.Timer diagnosticTimer;
    Windows.Foundation.Size sourceSize;
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    public PrintHost(PrintRequest value, bool verify)
    {
        request = value;
        selfTest = verify;
        Text = "Dockit Open";
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new System.Drawing.Size(1, 1);
        Opacity = 0;
        Shown += async (sender, args) => await InitializePrinting();
    }

    async Task InitializePrinting()
    {
        try
        {
            xamlManager = WindowsXamlManager.InitializeForCurrentThread();
            xamlSource = new DesktopWindowXamlSource();
            ((IDesktopWindowXamlSourceNative)(object)xamlSource).AttachToWindow(Handle);
            xamlRoot = new Canvas();
            xamlSource.Content = xamlRoot;
            document = new PrintDocument();
            documentSource = document.DocumentSource;
            interop = (IPrintManagerInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(PrintManager));
            var iid = new Guid("FF2A9694-8C99-44FD-AE4A-19D9AA9A0F0A");
            manager = (PrintManager)interop.GetForWindow(Handle, ref iid);
            if (selfTest)
            {
                Program.Report("ready", "Windows PrintManager and XAML PrintDocument are available.");
                Close();
                return;
            }
            var file = await NativeAsync.Wait(StorageFile.GetFileFromPathAsync(request.pdfPath));
            pdf = await NativeAsync.Wait(PdfDocument.LoadFromFileAsync(file));
            if (pdf.PageCount == 0) throw new InvalidOperationException("인쇄할 페이지가 없습니다.");
            using (var firstPage = pdf.GetPage(0)) sourceSize = firstPage.Size;
            xamlRoot.Width = sourceSize.Width;
            xamlRoot.Height = sourceSize.Height;
            SetWindowPos(((IDesktopWindowXamlSourceNative)(object)xamlSource).WindowHandle,
                IntPtr.Zero, 0, 0, (int)Math.Ceiling(sourceSize.Width), (int)Math.Ceiling(sourceSize.Height), 0x0044);
            // PrintDocument callbacks must receive already decoded, laid-out pages.
            // BitmapImage defers realization in the hidden XAML island, producing
            // empty image visuals even after SetSourceAsync has completed.
            for (uint index = 0; index < pdf.PageCount; index++)
                printImages.Add(await RenderPage(index, 300));
            document.Paginate += Paginate;
            document.GetPreviewPage += GetPreviewPage;
            document.AddPages += AddPages;
            manager.PrintTaskRequested += TaskRequested;
            Program.Report("stage", "events-registered");
            Program.Report("ready", pdf.PageCount.ToString());
            if (request.diagnostic)
            {
                diagnosticTimer = new System.Windows.Forms.Timer { Interval = 20000 };
                diagnosticTimer.Tick += (sender, args) => { Program.Report("stage", "diagnostic-close"); Close(); };
                diagnosticTimer.Start();
            }
            var asyncIid = typeof(IAsyncOperation<bool>).GUID;
            var operation = (IAsyncOperation<bool>)interop.ShowPrintUIForWindowAsync(Handle, ref asyncIid);
            var shown = await NativeAsync.Wait(operation);
            Program.Report("shown", shown.ToString());
            if (!shown) Close();
        }
        catch (Exception failure) { Fail(failure); }
    }

    void TaskRequested(PrintManager sender, PrintTaskRequestedEventArgs args)
    {
        Program.Report("stage", "task-requested");
        try
        {
            printTask = args.Request.CreatePrintTask(request.title ?? "Dockit Open", source => { Program.Report("stage", "source-requested"); source.SetSource(documentSource); });
            printTask.Options.Orientation = sourceSize.Width > sourceSize.Height ? PrintOrientation.Landscape : PrintOrientation.Portrait;
            try
            {
                var shorter = Math.Min(sourceSize.Width, sourceSize.Height);
                var longer = Math.Max(sourceSize.Width, sourceSize.Height);
                if (Math.Abs(shorter - 793.7) < 3 && Math.Abs(longer - 1122.5) < 3) printTask.Options.MediaSize = PrintMediaSize.IsoA4;
                else if (Math.Abs(shorter - 816) < 3 && Math.Abs(longer - 1056) < 3) printTask.Options.MediaSize = PrintMediaSize.NorthAmericaLetter;
            }
            catch (ArgumentException) { /* Keep the printer's supported default media. */ }
            Program.Report("stage", "task-created");
            printTask.Completed += (task, completed) => Dispatch(() =>
            {
                Program.Report("completed", completed.Completion.ToString());
                if (completed.Completion == PrintTaskCompletion.Failed) Program.ExitCode = 1;
                Close();
            });
        }
        catch (Exception failure) { Dispatch(() => Fail(failure)); }
    }

    void Paginate(object sender, PaginateEventArgs args)
    {
        try
        {
            pageElements.Clear();
            xamlRoot.Children.Clear();
            var options = (PrintTaskOptions)args.PrintTaskOptions;
            for (uint index = 0; index < pdf.PageCount; index++)
                CreatePage(printImages[(int)index], options.GetPageDescription(index + 1).PageSize);
            xamlRoot.InvalidateMeasure();
            xamlRoot.UpdateLayout();
            document.SetPreviewPageCount((int)pdf.PageCount, PreviewPageCountType.Final);
            Program.Report("paginate", pdf.PageCount.ToString());
        }
        catch (Exception failure) { Fail(failure); }
    }

    async Task<RenderedPage> RenderPage(uint index, uint dpi)
    {
        using (var page = pdf.GetPage(index))
        {
            var image = new RenderedPage { Stream = new InMemoryRandomAccessStream() };
            try
            {
                await NativeAsync.Wait(page.RenderToStreamAsync(image.Stream, new PdfPageRenderOptions
                {
                    DestinationWidth = (uint)Math.Max(1, Math.Round(page.Size.Width * dpi / 96.0)),
                    DestinationHeight = (uint)Math.Max(1, Math.Round(page.Size.Height * dpi / 96.0))
                }));
                image.Stream.Seek(0);
                var decoder = await NativeAsync.Wait(BitmapDecoder.CreateAsync(image.Stream));
                var pixels = await NativeAsync.Wait(decoder.GetPixelDataAsync(BitmapPixelFormat.Bgra8,
                    BitmapAlphaMode.Premultiplied, new BitmapTransform(),
                    ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage));
                image.Bitmap = new WriteableBitmap((int)decoder.PixelWidth, (int)decoder.PixelHeight);
                var bytes = pixels.DetachPixelData();
                IntPtr buffer;
                ((IBufferByteAccess)(object)image.Bitmap.PixelBuffer).Buffer(out buffer);
                Marshal.Copy(bytes, 0, buffer, bytes.Length);
                image.Bitmap.Invalidate();
                return image;
            }
            catch { image.Dispose(); throw; }
        }
    }

    UIElement CreatePage(RenderedPage page, Windows.Foundation.Size size)
    {
        var element = new Grid { Width = size.Width, Height = size.Height, Background = new SolidColorBrush(Windows.UI.Colors.White) };
        element.Children.Add(new Windows.UI.Xaml.Controls.Image
        {
            Source = page.Bitmap, Width = size.Width, Height = size.Height,
            Stretch = Stretch.Uniform
        });
        xamlRoot.Children.Add(element);
        element.Measure(size);
        element.Arrange(new Windows.Foundation.Rect(0, 0, size.Width, size.Height));
        element.UpdateLayout();
        pageElements.Add(element);
        return element;
    }

    void GetPreviewPage(object sender, GetPreviewPageEventArgs args)
    {
        try
        {
            var index = args.PageNumber - 1;
            if (index < 0 || index >= pageElements.Count) return;
            document.SetPreviewPage(args.PageNumber, pageElements[index]);
            Program.Report("preview", args.PageNumber.ToString());
        }
        catch (Exception failure) { if (!disposed) Fail(failure); }
    }

    void AddPages(object sender, AddPagesEventArgs args)
    {
        try
        {
            foreach (var page in pageElements) document.AddPage(page);
            document.AddPagesComplete();
            Program.Report("pages", pdf.PageCount.ToString());
        }
        catch (Exception failure) { if (!disposed) Fail(failure); }
    }

    void Dispatch(Action action)
    {
        if (!disposed && IsHandleCreated) BeginInvoke(action);
    }

    void Fail(Exception failure)
    {
        Program.ExitCode = 1;
        Program.Report("error", Program.FailureText(failure));
        Close();
    }

    protected override void OnFormClosed(FormClosedEventArgs args)
    {
        Program.Report("stage", "host-closing");
        disposed = true;
        if (diagnosticTimer != null) diagnosticTimer.Dispose();
        if (manager != null) manager.PrintTaskRequested -= TaskRequested;
        if (document != null)
        {
            document.Paginate -= Paginate;
            document.GetPreviewPage -= GetPreviewPage;
            document.AddPages -= AddPages;
        }
        foreach (var page in printImages) page.Dispose();
        if (xamlSource != null) xamlSource.Dispose();
        Program.Report("stage", "xaml-source-closed");
        if (xamlManager != null) xamlManager.Dispose();
        Program.Report("stage", "xaml-manager-closed");
        base.OnFormClosed(args);
    }
}

static class NativeAsync
{
    public static Task<T> Wait<T>(IAsyncOperation<T> operation)
    {
        var completion = new TaskCompletionSource<T>();
        operation.Completed = (current, status) => {
            try {
                if (status == AsyncStatus.Canceled) completion.TrySetCanceled();
                else completion.TrySetResult(current.GetResults());
            } catch (Exception failure) { completion.TrySetException(failure); }
        };
        return completion.Task;
    }
    public static Task Wait(IAsyncAction operation)
    {
        var completion = new TaskCompletionSource<bool>();
        operation.Completed = (current, status) => {
            try {
                if (status == AsyncStatus.Canceled) completion.TrySetCanceled();
                else { current.GetResults(); completion.TrySetResult(true); }
            } catch (Exception failure) { completion.TrySetException(failure); }
        };
        return completion.Task;
    }
}

static class Program
{
    public static int ExitCode;
    static readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string value);
    [DllImport("kernel32.dll")] static extern void ExitProcess(uint code);
    public static void Report(string phase, string value) { Console.WriteLine(serializer.Serialize(new { phase, value })); Console.Out.Flush(); }
    public static string FailureText(Exception failure)
    {
        var code = "0x" + failure.HResult.ToString("X8");
        try { return code + " " + failure.Message; } catch { return code; }
    }
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            SetCurrentProcessExplicitAppUserModelID("Dockit.Open.Print");
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (sender, error) => { Report("error", FailureText(error.Exception)); ExitCode = 1; Application.Exit(); };
            AppDomain.CurrentDomain.UnhandledException += (sender, error) => { var failure = error.ExceptionObject as Exception; Report("error", failure == null ? "Unhandled native print error" : FailureText(failure)); };
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            var verify = args.Length == 1 && args[0] == "--check";
            if (!verify && args.Length != 1) throw new ArgumentException("인쇄 요청 파일이 필요합니다.");
            var request = verify ? new PrintRequest() : serializer.Deserialize<PrintRequest>(System.IO.File.ReadAllText(args[0]));
            if (!verify && (!System.IO.Path.IsPathRooted(request.pdfPath) || !System.IO.File.Exists(request.pdfPath))) throw new ArgumentException("PDF 파일을 찾을 수 없습니다.");
            using (var host = new PrintHost(request, verify))
            {
                long owner;
                if (!verify && long.TryParse(request.owner, out owner) && owner != 0) host.Show(new OwnerWindow(new IntPtr(owner)));
                Application.Run(host);
            }
            Report("stage", "process-exit-" + ExitCode.ToString());
            // All owned UI/streams are closed above. Avoid CLR finalizers releasing
            // XAML objects after the UI apartment has already shut down.
            ExitProcess((uint)ExitCode);
            return ExitCode;
        }
        catch (Exception failure) { Report("error", FailureText(failure)); return 1; }
    }
}
