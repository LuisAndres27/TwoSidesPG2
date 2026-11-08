#nullable enable
using Godot;

namespace TwoSides.Network;

// Interfaz persistente y politica de pausa. Process no envia HTTP.
public partial class ConnectivityOverlay : CanvasLayer
{
    private GameApplicationServices _app = null!;
    private Control _panel = null!;
    private Label _message = null!;
    private Button _retry = null!, _recovery = null!;
    private bool _ownsPause, _wasPaused;
    private string _scene = "";
    private Node? _lockedScene;
    private ProcessModeEnum _previousMode;
    internal void Configure(GameApplicationServices app) => _app = app;
    public override void _Ready()
    {
        ProcessMode = ProcessModeEnum.Always; Layer = 95;
        var background = new ColorRect { Color = new Color(0.05f, 0.08f, 0.05f, 0.97f), MouseFilter = Control.MouseFilterEnum.Stop, FocusMode = Control.FocusModeEnum.All };
        AddChild(background); background.SetAnchorsAndOffsetsPreset(Control.LayoutPreset.FullRect); _panel = background;
        var center = new CenterContainer(); background.AddChild(center); center.SetAnchorsAndOffsetsPreset(Control.LayoutPreset.FullRect);
        var board = new PanelContainer { CustomMinimumSize = new Vector2(450, 0) }; center.AddChild(board);
        board.AddThemeStyleboxOverride("panel", new StyleBoxTexture { Texture = GD.Load<Texture2D>("res://assets/sprites/ui/TABLERO1.png") });
        board.Theme = GD.Load<Theme>("res://scenes/auth/auth_theme.tres");
        var margin = new MarginContainer(); board.AddChild(margin);
        foreach (string side in new[] { "left", "right", "top", "bottom" }) margin.AddThemeConstantOverride("margin_" + side, 15);
        var box = new VBoxContainer(); margin.AddChild(box);
        _message = new Label { CustomMinimumSize = new Vector2(420, 80), AutowrapMode = TextServer.AutowrapMode.WordSmart }; box.AddChild(_message);
        _retry = new Button { Text = "Comprobar de nuevo" }; box.AddChild(_retry); _retry.Pressed += Retry;
        _recovery = new Button { Text = "Volver al progreso confirmado" }; box.AddChild(_recovery); _recovery.Pressed += Recovery;
        var logout = new Button { Text = "Cerrar sesión" }; box.AddChild(logout); logout.Pressed += Logout;
        var timer = new Timer { WaitTime = _app.Connectivity.IntervalSeconds, ProcessMode = ProcessModeEnum.Always };
        AddChild(timer); timer.Timeout += Tick; timer.Start(); _panel.Hide();
    }
    private async void Tick() => await _app.Connectivity.TickAsync();
    private async void Retry() => await _app.Connectivity.CheckAsync();
    public override void _Process(double delta)
    {
        _app.Session.CheckExpiration();
        var monitor = _app.Connectivity;
        bool blocked = monitor.BlocksOperations;
        string scene = GetTree().CurrentScene?.SceneFilePath ?? "";
        bool safeScreen = scene.StartsWith("res://scenes/auth/") || scene == "res://assets/sprites/ui/menu_principal.tscn";
        blocked = blocked || (!_app.Session.IsAuthenticated && !safeScreen);
        bool newlyBlocked = blocked && !_panel.Visible;
        _panel.Visible = blocked;
        if (newlyBlocked) _panel.GrabFocus();
        var currentScene = GetTree().CurrentScene;
        if (_lockedScene is not null && (!blocked || safeScreen || !ReferenceEquals(_lockedScene, currentScene)))
        {
            if (IsInstanceValid(_lockedScene)) _lockedScene.ProcessMode = _previousMode;
            _lockedScene = null;
        }
        if (blocked && !safeScreen)
        {
            if (_lockedScene is null && currentScene is not null)
            { _lockedScene = currentScene; _previousMode = currentScene.ProcessMode; }
            if (_lockedScene is not null) _lockedScene.ProcessMode = ProcessModeEnum.Disabled;
            if (!_ownsPause) { _ownsPause = true; _wasPaused = GetTree().Paused; _scene = scene; }
            // Otros menus antiguos escriben Paused=false: mantener el bloqueo mientras esta capa lo posea.
            GetTree().Paused = true;
        }
        else if (_ownsPause)
        {
            if (safeScreen || scene != _scene) GetTree().Paused = false;
            else if (!_wasPaused && !AnimalSegmentFlow.IsBlocking(this)) GetTree().Paused = false;
            _ownsPause = false;
        }
        _retry.Disabled = monitor.Busy || !_app.Session.IsAuthenticated;
        _recovery.Disabled = monitor.Busy || (_app.Session.IsAuthenticated && monitor.State != ConnectivityState.Available);
        _message.Text = monitor.State switch {
            ConnectivityState.Checking => "Comprobando conexión y recuperando el progreso. El juego sigue detenido.",
            ConnectivityState.Available => "Servicio recuperado y progreso validado. Vuelve a recuperación antes de continuar.",
            ConnectivityState.SessionInvalid => "La sesión expiró o fue rechazada. Debes iniciar sesión de nuevo.",
            ConnectivityState.Inactive => "Debes iniciar sesión antes de continuar jugando.",
            _ => "No se pudo verificar el servicio. El juego está detenido; se conservan el progreso y las operaciones pendientes."
        };
    }
    private void Recovery()
    {
        if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
        bool authenticated = _app.Session.IsAuthenticated;
        if (authenticated && !_app.Connectivity.AcknowledgeRecovery()) return;
        string path = authenticated ? "res://scenes/auth/recuperacion_partida.tscn" : "res://scenes/auth/login.tscn";
        if (GetTree().ChangeSceneToFile(path) == Error.Ok)
        {
            if (!authenticated) _app.Connectivity.DismissForAuthentication();
            _ownsPause = false; GetTree().Paused = false;
        }
    }
    private void Logout()
    {
        if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
        _app.Logout();
        if (GetTree().ChangeSceneToFile("res://scenes/auth/login.tscn") == Error.Ok) { _ownsPause = false; GetTree().Paused = false; }
    }
}
