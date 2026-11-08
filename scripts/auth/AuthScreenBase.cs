#nullable enable
using Godot;
using System;
using System.Threading.Tasks;
using TwoSides.Network;
using TwoSides.Network.AuthUI;

namespace TwoSides.Auth;

public abstract partial class AuthScreenBase : Control
{
    protected const string FormPath = "Center/Board/Margin/Form/";
    protected AuthFormController? Form;
    protected LineEdit Email = null!, Password = null!;
    protected Button Submit = null!, Back = null!;
    protected Label Status = null!;
    private bool _leaving;
    protected abstract bool IsRegistration { get; }
    protected abstract string BackScene { get; }
    protected virtual void ClearPasswords() => Password.Clear();
    protected virtual void SetFieldsEditable(bool editable) { Email.Editable = editable; Password.Editable = editable; }
    protected virtual void WireExtra(bool connect) { }
    protected virtual (string? username, string? confirmation) ExtraFields() => (null, null);
    protected virtual bool UseExistingSession => false;
    protected virtual bool FlowBusy => false;
    private bool TransitionBusy => GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true;
    protected virtual Task AfterLoginAsync() => Task.CompletedTask;

    public override void _Ready()
    {
        Email = GetNode<LineEdit>(FormPath + "Email"); Password = GetNode<LineEdit>(FormPath + "Password");
        Submit = GetNode<Button>(FormPath + "Submit"); Back = GetNode<Button>(FormPath + "Back");
        Status = GetNode<Label>(FormPath + "Status");
        var app = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext");
        if (app?.Services is not null) Form = new AuthFormController(app.Services);
        Submit.Pressed += OnSubmit; Back.Pressed += OnBack; WireExtra(true);
        if (Form is null) Status.Text = "El servicio de autenticación no está disponible.";
        Email.GrabFocus(); UpdateControls();
    }
    public override void _Process(double delta) => UpdateControls();
    protected virtual void UpdateControls()
    {
        bool busy = Form?.Busy == true || FlowBusy || TransitionBusy;
        Submit.Disabled = _leaving || busy || (!UseExistingSession && Form?.CanSubmit != true);
        Back.Disabled = _leaving || busy;
        SetFieldsEditable(!busy && !_leaving && !UseExistingSession && Form?.Succeeded != true);
        if (Form is not null && !_leaving) Status.Text = Form.Message + (Form.RetrySeconds > 0 ? $" Espera {Form.RetrySeconds} s." : "");
    }
    private async void OnSubmit()
    {
        if (_leaving || FlowBusy || TransitionBusy || Form?.Busy == true) return;
        if (UseExistingSession) { ClearPasswords(); await AfterLoginAsync(); return; }
        if (Form?.CanSubmit != true) return;
        var extra = ExtraFields();
        // Capturar una vez y borrar el contenido visual antes de esperar la red.
        string password = Password.Text;
        ClearPasswords();
        var task = Form.SubmitAsync(Email.Text, password, extra.username, extra.confirmation);
        password = ""; extra = default;
        UpdateControls();
        bool success = await task;
        if (!IsInstanceValid(this) || !IsInsideTree() || _leaving) return;
        UpdateControls();
        if (success && IsRegistration) Navigate("res://scenes/auth/login.tscn");
        else if (success) await AfterLoginAsync();
    }
    private void OnBack() { if (Form?.Busy != true && !FlowBusy) Navigate(BackScene); }
    protected void Navigate(string path)
    {
        if (_leaving || Form?.Busy == true || FlowBusy || TransitionBusy) return;
        ClearPasswords();
        var error = GetTree().ChangeSceneToFile(path);
        if (error == Error.Ok) _leaving = true;
        else Status.Text = "No se pudo abrir la pantalla solicitada.";
    }
    public override void _ExitTree()
    {
        _leaving = true; ClearPasswords(); Form?.Dispose();
        Submit.Pressed -= OnSubmit; Back.Pressed -= OnBack; WireExtra(false);
    }
}
