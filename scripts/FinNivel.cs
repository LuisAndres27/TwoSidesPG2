
using Godot;

public partial class FinNivel : Area2D
{
	[ExportGroup("Configuración del nivel")]
	[Export] public PackedScene EscenaMenuNiveles;
	[Export] public PackedScene EscenaFinalGlobal;
	[Export] public VariablesGlobales.TipoNivel NivelActual;
	[Export] public string GrupoJugador = "jugador";

	private bool _nivelFinalizado = false;
	private Node2D _animal;

	public override async void _Ready()
	{
		BodyEntered += OnBodyEntered;
		bool entradaValidada = await AnimalSegmentFlow.ValidateLocalEntryAsync(this, (int)NivelActual);
		if (!IsInstanceValid(this) || !IsInsideTree() || !entradaValidada) return;
	}

	public override void _ExitTree()
	{
		BodyEntered -= OnBodyEntered;
	}

	// ----------------------------------------
	// DETECTAR AL JUGADOR
	// ----------------------------------------

	private void OnBodyEntered(Node2D body)
	{
		if (_nivelFinalizado)
			return;

		if (GetTree().Paused || AnimalSegmentFlow.IsBlocking(this) || !EsAnimalPermitido(body))
			return;

		_nivelFinalizado = true;
		_animal = body;

		// Ejecutar fuera del evento físico
		CallDeferred(nameof(FinalizarNivel));
	}

	// ----------------------------------------
	// FINALIZAR NIVEL
	// ----------------------------------------

	private void FinalizarNivel()
	{
		string biome = TwoSides.Network.Progress.BiomeCardController.BiomeFor((int)NivelActual);
		if (biome == null || AnimalSegmentFlow.BiomeForScene(this) != biome || !IsInstanceValid(_animal) ||
			!EsAnimalPermitido(_animal) || GetTree().Paused || AnimalSegmentFlow.IsBlocking(this))
		{ _nivelFinalizado=false; return; }
		AnimalSegmentFlow.Open(this, biome, completion: true);
	}
	private bool EsAnimalPermitido(Node2D body)
	{
		if (!body.IsInGroup(GrupoJugador)) return false;
		string name = (int)NivelActual switch { 0=>"PlayerDelfin",1=>"PlayerMono",2=>"PlayerRataCanguro",3=>"PlayerZorro",4=>"PlayerOso",_=>"" };
		if (GetTree().CurrentScene?.GetNodeOrNull<Node2D>(name)!=body) return false;
		return ((int)NivelActual,body) switch
		{
			(0,PlayerDelfin p)=>p.CurrentHealth>0,(1,PlayerMono p)=>p.CurrentHealth>0,
			(2,PlayerRataCanguro p)=>p.CurrentHealth>0,(3,PlayerZorro p)=>p.CurrentHealth>0,
			(4,PlayerOso p)=>p.CurrentHealth>0,_=>false
		};
	}
}
