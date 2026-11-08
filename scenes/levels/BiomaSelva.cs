
using Godot;

public partial class BiomaSelva : Node2D
{
	// Estados de la selva
	private Node2D _buenEstado;
	private Node2D _malEstado;

	// Fondos parallax
	private ParallaxBackground _fondoBueno;
	private ParallaxBackground _fondoMalo;

	// Partículas ambientales del estado malo
	private Node _particulasClimaMalo;

	private bool _estadoAnterior;

	public override void _Ready()
	{
		// Obtener los nodos de la escena
		_buenEstado = GetNodeOrNull<Node2D>("Buen estado");
		_malEstado = GetNodeOrNull<Node2D>("Mal estado");

		_fondoBueno = GetNodeOrNull<ParallaxBackground>(
            "FondoBueno"
		);

		_fondoMalo = GetNodeOrNull<ParallaxBackground>(
            "FondoMalo"
		);

		// Buscar las partículas de la selva contaminada.
		// Se admite un nombre alternativo por compatibilidad.
		_particulasClimaMalo =
			GetNodeOrNull<Node>("ParticulasClimaMalo")
			?? GetNodeOrNull<Node>("ParticulasSelvaMala");

		AplicarConsecuenciasAmbientales();

		GD.Print(
			$"BiomaSelva iniciado. " +
			$"Estado saludable: {VariablesGlobales.BiomaSaludable}"
		);
	}

	// -----------------------------------------------
	// CONFIGURACIÓN DEL BIOMA
	// -----------------------------------------------

	private void AplicarConsecuenciasAmbientales()
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		_estadoAnterior = saludable;

		ConfigurarEstado(
			_buenEstado,
			_fondoBueno,
			saludable
		);

		ConfigurarEstado(
			_malEstado,
			_fondoMalo,
			!saludable
		);

		// Las partículas se activan únicamente
		// cuando la selva está en mal estado.
		ConfigurarParticulas(
			_particulasClimaMalo,
			!saludable
		);
	}

	// -----------------------------------------------
	// ESTADOS VISUALES
	// -----------------------------------------------

	private static void ConfigurarEstado(
		Node2D estado,
		ParallaxBackground fondo,
		bool activo)
	{
		if (estado != null)
		{
			estado.Visible = activo;

			estado.ProcessMode = activo
				? ProcessModeEnum.Inherit
				: ProcessModeEnum.Disabled;
		}

		if (fondo != null)
		{
			fondo.Visible = activo;

			fondo.ProcessMode = activo
				? ProcessModeEnum.Inherit
				: ProcessModeEnum.Disabled;
		}
	}

	// -----------------------------------------------
	// PARTÍCULAS AMBIENTALES
	// -----------------------------------------------

	private static void ConfigurarParticulas(
		Node particulas,
		bool activar)
	{
		if (particulas == null)
			return;

		switch (particulas)
		{
			case CpuParticles2D cpu:
				cpu.Visible = activar;
				cpu.Emitting = activar;
				break;

			case GpuParticles2D gpu:
				gpu.Visible = activar;
				gpu.Emitting = activar;
				break;
		}
	}

	// -----------------------------------------------
	// DETECTAR CAMBIOS EN LA SELVA
	// -----------------------------------------------

	public override void _Process(double delta)
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		if (saludable != _estadoAnterior)
		{
			AplicarConsecuenciasAmbientales();

			GD.Print(
				saludable
					? "La selva ha recuperado su estado saludable."
					: "La selva se encuentra en mal estado."
			);
		}
	}
}
