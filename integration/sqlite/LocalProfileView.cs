#nullable enable
using Godot;
using System;

namespace TwoSides.Integration.Sqlite;

// Existing scene has no name/continue fields. This approved view adds only local menu controls.
public partial class LocalProfileView : VBoxContainer
{
    public event Action? CreateRequested;
    public event Action? ContinueRequested;
    public event Action? NewGameRequested;
    public event Action? RetryRequested;
    private readonly LineEdit _name = new() { PlaceholderText = "Tu nombre", MaxLength = 80 };
    private readonly Button _create = new() { Text = "Guardar nombre" };
    private readonly Button _newGame = new() { Text = "Nueva partida" };
    private readonly Button _continue = new() { Text = "Continuar" };
    private readonly Button _retry = new() { Text = "Reintentar guardado" };
    private readonly Label _status = new() { AutowrapMode = TextServer.AutowrapMode.WordSmart };
    public string DisplayName => _name.Text;
    public override void _Ready()
    {
        CustomMinimumSize = new Vector2(260, 0);
        AddThemeFontSizeOverride("font_size", 12);
        AddThemeConstantOverride("separation", 4);
        foreach (Control control in new Control[] { _name, _create, _newGame, _continue, _retry })
            control.AddThemeFontSizeOverride("font_size", 12);
        _status.AddThemeFontSizeOverride("font_size", 11);
        _status.CustomMinimumSize = new Vector2(260, 0);
        AddChild(_name); AddChild(_create); AddChild(_newGame); AddChild(_continue); AddChild(_retry); AddChild(_status);
        _create.Pressed += () => CreateRequested?.Invoke();
        _newGame.Pressed += () => NewGameRequested?.Invoke();
        _continue.Pressed += () => ContinueRequested?.Invoke();
        _retry.Pressed += () => RetryRequested?.Invoke();
    }
    public void Render(LocalGameState state, bool navigating, string? message = null)
    {
        bool locked = navigating || state.Busy || !state.Ready;
        bool needsProfile = state.Profile is null;
        _name.Visible = _create.Visible = needsProfile;
        _name.Editable = !locked && !state.HasPendingWrite;
        _create.Disabled = locked;
        _newGame.Visible = !needsProfile;
        _newGame.Disabled = locked || !state.CanStartNewGame;
        _continue.Visible = !needsProfile;
        _continue.Disabled = locked || !state.CanContinue;
        _retry.Visible = state.HasPendingWrite;
        _retry.Disabled = locked;
        _status.Text = (state.Profile is null ? "" : state.Profile.DisplayName + "\n") +
            (message ?? (state.Busy ? "Confirmando almacenamiento local…" : LocalGameState.MessageFor(state.Code)));
    }
}
