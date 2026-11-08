#nullable enable
using Godot;

namespace TwoSides.Auth;
public partial class RegisterScreen : AuthScreenBase
{
    private LineEdit _username = null!, _confirmation = null!;
    protected override bool IsRegistration => true;
    protected override string BackScene => "res://scenes/auth/login.tscn";
    protected override void WireExtra(bool connect)
    {
        if (connect) { _username = GetNode<LineEdit>(FormPath + "Username"); _confirmation = GetNode<LineEdit>(FormPath + "Confirmation"); }
    }
    protected override (string?, string?) ExtraFields() => (_username.Text, _confirmation.Text);
    protected override void ClearPasswords() { base.ClearPasswords(); _confirmation.Clear(); }
    protected override void SetFieldsEditable(bool editable)
    {
        base.SetFieldsEditable(editable); _username.Editable = editable; _confirmation.Editable = editable;
    }
}
