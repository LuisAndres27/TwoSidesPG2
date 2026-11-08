#nullable enable
using Godot;
using System.Threading.Tasks;
using System.Linq;
using TwoSides.Network;
using TwoSides.Integration.Sqlite;

public partial class MenuNiveles : Control
{
	private LocalGameState? _local;
	private bool _leaving;
	private Label _status = null!;
	private Button _back = null!;
	public LocalBiomeSelection? Selection { get; private set; }
	private bool Alive => !_leaving && IsInstanceValid(this) && IsInsideTree();
	public override void _EnterTree() { Visible = false; ProcessMode = ProcessModeEnum.Disabled; }
	public override async void _Ready()
	{
		_local = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.State;
		if (SceneFilePath != "res://scenes/levels/menu_niveles.tscn" || _local?.CanEnterSelection != true)
		{ ReturnToMenu(); return; }
		Selection = _local.CreateBiomeSelection();
		ProcessMode = ProcessModeEnum.Inherit; Visible = true;
		// Reuse the existing selection screen; no scene/resource edits or new screen.
		var panel = new VBoxContainer { Position = new Vector2(70, 260), CustomMinimumSize = new Vector2(500, 0) };
		AddChild(panel);
		_status = new Label { Text = "Consultando progreso local…", AutowrapMode = TextServer.AutowrapMode.WordSmart };
		_status.AddThemeFontSizeOverride("font_size", 12); panel.AddChild(_status);
		_back = new Button { Text = "Volver al menú" }; panel.AddChild(_back); _back.Pressed += ReturnToMenu;
		await Selection.RefreshAsync();
		if (Alive) ActualizarTarjetas();
	}
	public override void _Process(double delta)
	{
		if (_local?.CanEnterSelection != true) { ReturnToMenu(); return; }
		if (_back is not null) _back.Disabled = Selection?.Busy == true || GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true;
		if (_status is not null && Selection is not null) _status.Text = _local?.ActiveGame?.Biomes.Count==5 &&
			_local.ActiveGame.Biomes.All(b=>b.Status=="completed")
			? "Cinco biomas completados. Vuelve al menú y pulsa Continuar para mostrar el final local confirmado."
			: LocalBiomeSelection.MessageFor(Selection.Code);
	}
	public async Task EnterLocalBiomeAsync(string biome)
	{
		var selection = Selection;
		var transition = GetNodeOrNull<Transicion>("/root/Transicion");
		if (!Alive || selection is null || selection.Busy || transition?.Ocupado == true || _local?.CanEnterSelection != true) return;
		await selection.EnterAsync(biome,
			scene => Alive && ResourceLoader.Exists(scene, "PackedScene"),
			async plan =>
			{
				bool Valid() => Alive && _local?.CanEnterSelection == true && selection.IsCurrent(plan);
				bool Prepare()
				{
					if (!Valid()) return false;
					if (plan.Environment is not null)
					{
						if (plan.Environment is not ("healthy" or "degraded")) return false;
						bool healthy=plan.Environment=="healthy";
						if (VariablesGlobales.BiomaSaludable!=healthy) VariablesGlobales.BiomaSaludable=healthy;
					}
					return true;
				}
				if (!Valid()) return false;
				if (transition is not null)
					return await transition.CambiarEscenaValidadaAsync(plan.Scene, Prepare, () => _local?.CancelSelection());
				bool accepted = Prepare() && GetTree().ChangeSceneToFile(plan.Scene) == Error.Ok;
				if (accepted) _local?.CancelSelection();
				return accepted;
			});
		if (Alive) ActualizarTarjetas();
	}
	private void ReturnToMenu()
	{
		if (_leaving) return;
		_leaving = true; Selection?.Invalidate(); _local?.CancelSelection();
		GetTree().CallDeferred(SceneTree.MethodName.ChangeSceneToFile, "res://assets/sprites/ui/menu_principal.tscn");
	}
	public override void _ExitTree()
	{
		_leaving = true; Selection?.Invalidate();
		if (_back is not null) _back.Pressed -= ReturnToMenu;
	}
	public void ActualizarTarjetas() => Visit(this);
	private static void Visit(Node node)
	{
		if (node is TarjetaNivel card) card.ActualizarTarjeta();
		foreach (Node child in node.GetChildren()) Visit(child);
	}
}
