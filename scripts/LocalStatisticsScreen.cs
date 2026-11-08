#nullable enable
using Godot;
using System;
using TwoSides.Integration.Sqlite;

// Lives in the menu's existing board; no replacement scenes or resource changes.
public partial class LocalStatisticsScreen : VBoxContainer
{
    public event Action? Closed;
    public LocalStatisticsScreenState State { get; set; }=null!;
    private readonly Label _body=new(){AutowrapMode=TextServer.AutowrapMode.WordSmart,SizeFlagsHorizontal=SizeFlags.ExpandFill};
    private readonly Button _back=new(){Text="Volver al menú"};
    private readonly Button _retry=new(){Text="Reintentar consulta"};
    private bool _closing;
    public override void _Ready()
    {
        CustomMinimumSize=new Vector2(510,220);
        var title=new Label{Text="Estadísticas locales",HorizontalAlignment=HorizontalAlignment.Center};
        title.AddThemeFontSizeOverride("font_size",16);AddChild(title);
        var scroll=new ScrollContainer{CustomMinimumSize=new Vector2(510,155),SizeFlagsVertical=SizeFlags.ExpandFill,HorizontalScrollMode=ScrollContainer.ScrollMode.Disabled};
        AddChild(scroll);scroll.AddChild(_body);_body.CustomMinimumSize=new Vector2(480,0);_body.AddThemeFontSizeOverride("font_size",12);
        var buttons=new HBoxContainer();AddChild(buttons);buttons.AddChild(_back);buttons.AddChild(_retry);
        _back.AddThemeFontSizeOverride("font_size",12);_retry.AddThemeFontSizeOverride("font_size",12);
        _back.Pressed+=Back;_retry.Pressed+=Retry;Render();_back.GrabFocus();
    }
    private void Render(){_body.Text=State.Text;_retry.Visible=State.Result is null;_retry.Disabled=State.Busy;}
    private async void Retry()
    {
        if(_closing || State.Busy) return;
        var load=State.LoadAsync();Render();await load;
        if(IsInstanceValid(this) && IsInsideTree() && !_closing)Render();
    }
    private void Back()
    {
        if(_closing)return;_closing=true;State.Close();Closed?.Invoke();
    }
    public override void _ExitTree()
    {
        _closing=true;State.Close();_back.Pressed-=Back;_retry.Pressed-=Retry;
    }
}
