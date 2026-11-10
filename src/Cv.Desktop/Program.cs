using Cv.Desktop.Hosting;
using Cv.Desktop.Ui;
using Velopack;

namespace Cv.Desktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Velopack first: the installer's hooks (install, update, uninstall) run here and end the process before anything else starts.
        // Off: a package that was downloaded but whose backup step failed must not install itself at the next start; only the click on "install" applies it
        VelopackApp.Build().SetAutoApplyOnStartup(false).Run();

        // The server reads its configuration files relative to the working directory: always the program's own folder, never wherever a shortcut or
        // autostart entry happened to start it
        Directory.SetCurrentDirectory(AppContext.BaseDirectory);

        var options = DesktopOptions.Parse(args);
        if (options.Smoke) return Smoke.RunAsync().GetAwaiter().GetResult();

        ApplicationConfiguration.Initialize();

        using var instance = SingleInstance.TryAcquire(options.Dev);
        if (instance is null)
        {
            // Already running: bring that window to the front and end
            SingleInstance.SignalRunning(options.Dev);
            return 0;
        }

        // The data folder hangs on the company name: after a rename the folder of the earlier name is moved once, before anything opens it. Before the log
        // is opened (the log folder is one of the moved entries). A failed move leaves everything where it was and the program runs on the old folder.
        var prepared = DesktopPaths.Resolve(options).PrepareDataFolder();
        var paths = prepared.Paths;
        DesktopLog.Init(paths.LogDirectory);
        if (prepared.LogMessage is not null) DesktopLog.Warn(prepared.LogMessage);
        if (prepared.Problem is { } problem)
        {
            Dialogs.ShowError(null, Texts.DataMoveFailedTitle, Texts.DataMoveFailed(problem.From, problem.To), problem.Reason);
        }
        var channel = DesktopVersion.Channel(options);
        Dialogs.Version = DesktopVersion.Readable(channel);
        DesktopLog.Info($"Programm startet ({Dialogs.Version}, Kanal {channel}{(options.Dev ? ", Entwicklungsmodus" : string.Empty)}).");

        // Nothing fails silently: an unexpected error in the UI is shown in the program's own dialog (complete, copyable) and logged
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            Dialogs.ShowError(null, Texts.UnexpectedErrorTitle, Texts.UnexpectedError + Environment.NewLine + Environment.NewLine + e.Exception.Message, e.Exception.ToString());
        AppDomain.CurrentDomain.UnhandledException += (_, e) => DesktopLog.Error($"Unbehandelter Fehler: {e.ExceptionObject}");

        using var window = new MainWindow(options, paths, channel);
        instance.Listen(() =>
        {
            if (window.IsHandleCreated && !window.IsDisposed) window.BeginInvoke(window.ShowAndActivate);
        });
        Application.Run(window);
        DesktopLog.Info("Programm beendet.");
        return window.ExitCode;
    }
}
