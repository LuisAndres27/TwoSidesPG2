using Godot;

public partial class BiomaBosque : Node2D
{
	private Node2D _buenEstado;
	private Node2D _malEstado;
	private ParallaxBackground _fondoBueno;
	private ParallaxBackground _fondoMalo;

	// Partículas del clima extremo del estado malo (RF-016)
	private Node _particulasClimaMalo;

	public override void _Ready()
	{
		_buenEstado = GetNode<Node2D>("Buen estado");
		_malEstado = GetNode<Node2D>("Mal estado");
		_fondoBueno = GetNode<ParallaxBackground>("FondoBueno");
		_fondoMalo = GetNode<ParallaxBackground>("FondoMalo");

		// Busca primero el nodo con nombre de bosque; si no existe, usa el copiado de la tundra
		_particulasClimaMalo = GetNodeOrNull("ParticulasClimaMalo")
			?? GetNodeOrNull("ParticulasNieveMala");

		AplicarConsecuenciasAmbientales();
	}

	private void AplicarConsecuenciasAmbientales()
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		ConfigurarEstado(_buenEstado, _fondoBueno, saludable);
		ConfigurarEstado(_malEstado, _fondoMalo, !saludable);

		// El clima extremo solo aparece en el estado malo
		SetParticulas(_particulasClimaMalo, !saludable);
	}

	private static void ConfigurarEstado(Node2D estado, ParallaxBackground fondo, bool activo)
	{
		estado.Visible = activo;
		fondo.Visible = activo;
		estado.ProcessMode = activo ? ProcessModeEnum.Inherit : ProcessModeEnum.Disabled;
	}

	// Funciona con CpuParticles2D y con GpuParticles2D
	private static void SetParticulas(Node particulas, bool emitir)
	{
		switch (particulas)
		{
			case CpuParticles2D cpu:
				cpu.Emitting = emitir;
				break;
			case GpuParticles2D gpu:
				gpu.Emitting = emitir;
				break;
		}
	}
}
