
using Godot;

public partial class BiomaDesierto : Node2D
{
	private Node2D _buenEstado;
	private Node2D _malEstado;
	private ParallaxBackground _fondoBueno;
	private ParallaxBackground _fondoMalo;

	// Partículas de tormenta de arena del estado malo
	private Node _particulasArena;

	public override void _Ready()
	{
		_buenEstado = GetNode<Node2D>("Buen estado");
		_malEstado = GetNode<Node2D>("Mal estado");
		_fondoBueno = GetNode<ParallaxBackground>("FondoBueno");
		_fondoMalo = GetNode<ParallaxBackground>("FondoMalo");

		// Partículas opcionales de tormenta de arena
		_particulasArena = GetNodeOrNull("ParticulasArenaMala")
			?? GetNodeOrNull("ParticulasClimaMalo");

		AplicarConsecuenciasAmbientales();
	}

	private void AplicarConsecuenciasAmbientales()
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		ConfigurarEstado(_buenEstado, _fondoBueno, saludable);
		ConfigurarEstado(_malEstado, _fondoMalo, !saludable);

		// Tormenta de arena solamente en el desierto degradado
		SetParticulas(_particulasArena, !saludable);
	}

	private static void ConfigurarEstado(
		Node2D estado,
		ParallaxBackground fondo,
		bool activo)
	{
		estado.Visible = activo;
		fondo.Visible = activo;

		estado.ProcessMode = activo
			? ProcessModeEnum.Inherit
			: ProcessModeEnum.Disabled;
	}

	// Compatible con partículas CPU y GPU
	private static void SetParticulas(Node particulas, bool emitir)
	{
		switch (particulas)
		{
			case CpuParticles2D cpu:
				cpu.Visible = emitir;
				cpu.Emitting = emitir;
				break;

			case GpuParticles2D gpu:
				gpu.Visible = emitir;
				gpu.Emitting = emitir;
				break;
		}
	}
}
