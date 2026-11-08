#nullable enable
using Godot;
using TwoSides.Network;
using TwoSides.Network.Entry;

namespace TwoSides.Auth;

public partial class RecoveryScreen : Control
{
    private const string Path = "Center/Board/Margin/Form/";
    private GameApplicationServices? _app;
    private EntryAccessController? _entry;
    private Label _status = null!, _details = null!;
    private Button _retry = null!, _continue = null!, _login = null!, _back = null!, _logout = null!;
    private bool _leaving;
    private bool _localMode;
    private string? _endingMessage;
    private bool TransitionBusy => GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true;

    public override void _Ready()
    {
        _status = GetNode<Label>(Path + "Status"); _details = GetNode<Label>(Path + "Details");
        _retry = GetNode<Button>(Path + "Retry"); _continue = GetNode<Button>(Path + "Continue");
        _login = GetNode<Button>(Path + "Login"); _back = GetNode<Button>(Path + "Back"); _logout = GetNode<Button>(Path + "Logout");
        if (GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local is not null)
        {
            _localMode=true;
            ProcessMode=ProcessModeEnum.Always;
            _login.Hide(); _logout.Hide(); _retry.Hide(); _continue.Hide();
            _status.Text="La partida se recupera desde el menú local, sin iniciar sesión.";
            _details.Text="El perfil y las decisiones guardadas se conservan.";
            _back.Text="Volver al menú local"; _back.Pressed+=Back;
            CallDeferred(nameof(ReturnLocalMenu));
            return;
        }
        _app = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Services;
        if (_app is not null) { _entry = new EntryAccessController(_app); _entry.RestoreResult(); }
        _app?.Reconciliation.Refresh();
        _retry.Pressed += Retry; _continue.Pressed += Continue; _login.Pressed += Login; _back.Pressed += Back; _logout.Pressed += Logout;
        Render(); // Sin HTTP: reutilizar confirmacion o esperar reintento explicito.
    }
    public override void _Process(double delta) => Render();
    private void Render()
    {
        if (_localMode) return;
        bool session = _entry?.HasSession == true;
        bool busy = _entry?.Busy == true;
        bool locked = _leaving || TransitionBusy;
        _continue.Disabled = locked || busy || _app?.Animals.BlocksGameplay == true || _app?.BiomeMenu.CanContinue != true;
        if (_app?.Endings.ConfirmedEnding is not null) _continue.Disabled = locked || busy || _app.Animals.BlocksGameplay;
        _retry.Disabled = locked || busy || _app?.Reconciliation.Busy == true || _app?.Endings.Busy == true || !session;
        _login.Visible = !session;
        _login.Disabled = locked;
        _back.Disabled = locked;
        _logout.Disabled = locked || !session;
        if (_app is null || _entry is null) { _status.Text = "El servicio de recuperación no está disponible."; return; }
        _status.Text = _entry.Message;
        if (_endingMessage is not null && session) _status.Text = _endingMessage;
        if (_app.Endings.HasPending) _continue.Disabled = true;
        if (_app.Reconciliation.HasBlocking)
        {
            _continue.Disabled = true;
            _status.Text = _app.Reconciliation.InvalidFiles ? "Hay archivos pendientes dañados o incompletos. Se requiere revisar el almacenamiento local."
                : "Hay operaciones guardadas que requieren conciliación. Reintenta explícitamente antes de continuar.";
            _retry.Text = "Conciliar operación guardada";
        }
        else _retry.Text = "Reintentar recuperación";
        var confirmed = _app.Entry.LatestResult;
        if (confirmed?.Destination == EntryDestination.PendingEnding)
        {
            string ending = confirmed.Ending switch { "good" => "bueno", "medium" => "medio", "bad" => "malo", _ => "pendiente" };
            _details.Text = $"Final confirmado: {ending}. Se conserva pendiente, sin reiniciar la partida.";
            _continue.Visible = true;
            _continue.Text = "Ver final confirmado";
        }
        else
        {
            _continue.Visible = true;
            _continue.Text = "Continuar";
            _details.Text = confirmed?.Destination == EntryDestination.BiomeMenu
                ? "Progreso confirmado. Puedes continuar al menú de biomas."
                : session ? "Recupera el progreso para continuar. No se permite jugar sin confirmación."
                : "Tu sesión no está disponible o expiró. Vuelve a iniciar sesión.";
        }
    }
    private async void Retry()
    {
        if (_leaving || TransitionBusy || _entry is null || _entry.Busy || _app?.Reconciliation.Busy == true || _app?.Endings.Busy == true || !_entry.HasSession) return;
        if (_app?.Reconciliation.HasBlocking == true)
        {
            var failure = await _app.Reconciliation.ReconcileAsync();
            if (!IsInstanceValid(this) || !IsInsideTree() || _leaving) return;
            _endingMessage = failure == ApiFailure.None ? "Operación conciliada. Recupera el acceso vigente para continuar."
                : "No se pudo conciliar. El comando original se conserva; no puedes avanzar.";
            Render(); return;
        }
        if (_app?.Endings.HasPending == true)
        {
            _retry.Disabled = true;
            _endingMessage = "Confirmando la misma salida del final…";
            var exit = await _app.Endings.RetryAsync();
            if (!IsInstanceValid(this) || !IsInsideTree() || _leaving) return;
            if (exit.IsSuccess && _app.Endings.Acknowledge()) { VariablesGlobales.ReiniciarEstadosNiveles(); _endingMessage = "Sucesora confirmada. Recupera su acceso para continuar."; }
            else _endingMessage = "No se pudo confirmar la salida del final. Reintenta la misma operación.";
            return;
        }
        if (_app?.Animals.Pending is { } pending)
        {
            AnimalSegmentFlow.Open(this, pending.Command.BiomeId, pending.Operation == "animal_completion", start: false);
            return;
        }
        _endingMessage = null;
        var task = _entry.RequestAsync(); Render();
        await task;
        if (!IsInstanceValid(this) || !IsInsideTree() || _leaving) return;
        _app?.Reconciliation.Refresh();
        Render();
    }
    private void Login() => Navigate("res://scenes/auth/login.tscn");
    private void Continue()
    {
        if (_app?.Reconciliation.HasBlocking == true) return;
        if (!_leaving && !TransitionBusy && _app?.Endings.HasPending != true && _app?.Endings.ConfirmedEnding is not null)
        { Navigate("res://scenes/levels/Final.tscn"); return; }
        if (_leaving || TransitionBusy || _entry?.Busy == true || _app?.BiomeMenu.CanContinue != true) return;
        // Cargar y comprobar el destino antes de reservar el permiso.
        const string destination = "res://scenes/levels/menu_niveles.tscn";
        if (!ResourceLoader.Exists(destination, "PackedScene")) { _status.Text = "No se pudo abrir el menú de biomas."; return; }
        var scene = GD.Load<PackedScene>(destination);
        if (scene is null) { _status.Text = "No se pudo abrir el menú de biomas."; return; }
        if (_app.BiomeMenu.TryNavigate(() => GetTree().ChangeSceneToPacked(scene) == Error.Ok)) _leaving = true;
        else _status.Text = "No se pudo continuar. Recupera la partida de nuevo.";
    }
    private void Back()
    {
        if (_localMode) ReturnLocalMenu();
        else Navigate("res://assets/sprites/ui/menu_principal.tscn");
    }
    private void ReturnLocalMenu()
    {
        if (_leaving || !IsInsideTree()) return;
        var tree=GetTree();
        bool paused=tree.Paused;
        tree.Paused=false;
        _leaving=true;
        if (tree.ChangeSceneToFile(TwoSides.Integration.Sqlite.LocalMenuReturn.Destination)!=Error.Ok)
        {
            _leaving=false; tree.Paused=paused;
            _status.Text="No se pudo abrir el menú local. Tu progreso se conserva; vuelve a intentarlo.";
        }
    }
    private void Logout()
    {
        if (_leaving || TransitionBusy) return;
        _app?.Logout();
        Navigate("res://scenes/auth/login.tscn");
    }
    private void Navigate(string path)
    {
        if (_leaving || TransitionBusy) return;
        if (GetTree().ChangeSceneToFile(path) == Error.Ok) _leaving = true;
        else _status.Text = "No se pudo abrir la pantalla solicitada.";
    }
    public override void _ExitTree()
    {
        _leaving = true; _entry?.Dispose();
        _retry.Pressed -= Retry; _continue.Pressed -= Continue; _login.Pressed -= Login; _back.Pressed -= Back; _logout.Pressed -= Logout;
    }
}
