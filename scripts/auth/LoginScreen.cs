#nullable enable
using Godot;
using System.Threading.Tasks;
using TwoSides.Network;
using TwoSides.Network.Entry;
using TwoSides.Network.AuthUI;

namespace TwoSides.Auth;
public partial class LoginScreen : AuthScreenBase
{
    private Button _register = null!;
    private EntryAccessController? _entry;
    protected override bool UseExistingSession => _entry?.HasSession == true;
    protected override bool FlowBusy => _entry?.Busy == true;
    protected override bool IsRegistration => false;
    protected override string BackScene => "res://assets/sprites/ui/menu_principal.tscn";
    protected override void WireExtra(bool connect)
    {
        if (connect)
        {
            _register = GetNode<Button>(FormPath + "Register"); _register.Pressed += OpenRegister;
            var app = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext");
            if (app?.Services is not null) _entry = new EntryAccessController(app.Services);
        }
        else { _register.Pressed -= OpenRegister; _entry?.Dispose(); }
    }
    private void OpenRegister() => Navigate("res://scenes/auth/register.tscn");
    protected override async Task AfterLoginAsync()
    {
        if (_entry is null) return;
        var task = _entry.RequestAsync();
        UpdateControls();
        var result = await task;
        if (!IsInstanceValid(this) || !IsInsideTree()) return;
        UpdateControls();
        if (_entry.HasSession && result.Failure != ApiFailure.Cancelled)
            GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.BeginLocalSession();
        if (_entry.HasSession && result.Failure != ApiFailure.Cancelled)
            Navigate("res://scenes/auth/recuperacion_partida.tscn");
    }
    protected override void UpdateControls()
    {
        if (_entry is not null && !UseExistingSession && !FlowBusy && Form?.Succeeded == true)
        {
            var app = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext");
            Form.Dispose();
            Form = app?.Services is not null ? new AuthFormController(app.Services) : null;
        }
        base.UpdateControls();
        if (_register is not null) _register.Disabled = Back.Disabled || UseExistingSession;
        Submit.Text = UseExistingSession ? "Recuperar partida" : "Iniciar sesión";
        if (FlowBusy || UseExistingSession || (_entry?.Result is not null && Form?.Message.Length == 0)) Status.Text = _entry!.Message;
    }
}
