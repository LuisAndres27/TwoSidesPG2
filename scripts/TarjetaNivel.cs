#nullable enable
using Godot;
using TwoSides.Integration.Sqlite;

public partial class TarjetaNivel : TextureButton
{
	[ExportGroup("Nivel")]
	[Export] public VariablesGlobales.TipoNivel Nivel;
	[Export] public PackedScene? EscenaNivel;
	[ExportGroup("Texturas")]
	[Export] public Texture2D? TexturaNoJugado;
	[Export] public Texture2D? TexturaBuenEstado;
	[Export] public Texture2D? TexturaMalEstado;
	private MenuNiveles? _menu;
	private Color _baseModulate = Colors.White;
	private string? BiomeId => LocalBiomeSelection.BiomeFor((int)Nivel);
	public override void _Ready()
	{
		for (Node? parent = GetParent(); parent is not null; parent = parent.GetParent())
			if (parent is MenuNiveles menu) { _menu = menu; break; }
		_baseModulate = Modulate;
		ActualizarTarjeta(); Pressed += OnPressed;
	}
	public override void _Process(double delta) => ActualizarTarjeta();
	public override void _ExitTree() => Pressed -= OnPressed;
	public void ActualizarTarjeta()
	{
		var id = BiomeId;
		var state = id is null ? null : _menu?.Selection?.Describe(id);
		bool completed = state?.Activity == "completed";
		Texture2D? texture = completed ? (state?.Result == "good" ? TexturaBuenEstado : TexturaMalEstado)
			: state?.Environment == "healthy" ? TexturaBuenEstado
			: state?.Environment == "degraded" ? TexturaMalEstado : TexturaNoJugado;
		// The exported destination must agree with the canonical closed catalogue before any write.
		bool correctScene = id is not null && EscenaNivel?.ResourcePath == LocalBiomeSelection.HumanSceneFor(id);
		Disabled = state?.CanEnter != true || !correctScene || GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true;
		TooltipText = completed ? "Bioma completado" : !correctScene ? "La escena no corresponde al bioma."
			: state?.Reason == "RESUME_UNSUPPORTED" ? LocalBiomeSelection.MessageFor("RESUME_UNSUPPORTED")
			: state?.Reason == "ANIMAL_FROM_START" ? "Abrir entrada animal original. No recupera posición, vida, agua ni comida."
			: state?.Activity == "in_progress" ? "Continuar desde el inicio de la decisión humana"
			: state?.CanEnter == true ? "Perspectiva humana" : LocalBiomeSelection.MessageFor(state?.Reason ?? "LOADING");
		TextureNormal = texture; TextureHover = texture; TexturePressed = texture; TextureDisabled = texture;
		// Visual only: a biome already completed in the current game looks dimmed (it was already blocked by Disabled above).
		Modulate = completed ? _baseModulate * new Color(0.5f, 0.5f, 0.5f, 0.6f) : _baseModulate;
	}
	private async void OnPressed()
	{
		string? biome = BiomeId;
		if (Disabled || biome is null || _menu is null || EscenaNivel?.ResourcePath != LocalBiomeSelection.HumanSceneFor(biome)) return;
		await _menu.EnterLocalBiomeAsync(biome);
		if (IsInstanceValid(this) && IsInsideTree()) ActualizarTarjeta();
	}
}
