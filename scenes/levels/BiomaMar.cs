
using Godot;

public partial class BiomaMar : Node2D
{
	// Estados del mar
	private Node2D _buenEstado;
	private Node2D _malEstado;

	// Fondo del océano
	private ParallaxBackground _fondo;

	// Partículas de contaminación opcionales
	private Node _particulasContaminacion;

	private bool _estadoAnterior;

	public override void _Ready()
	{
		// Obtener los nodos de la escena
		_buenEstado = GetNodeOrNull<Node2D>("Buen estado");
		_malEstado = GetNodeOrNull<Node2D>("Mal estado");

		_fondo = GetNodeOrNull<ParallaxBackground>(
            "ParallaxBackground"
		);

		// Partículas opcionales del mar contaminado
		_particulasContaminacion =
			GetNodeOrNull<Node>("ParticulasContaminacion")
			?? GetNodeOrNull<Node>("ParticulasClimaMalo");

		AplicarConsecuenciasAmbientales();

		GD.Print(
			$"BiomaMar iniciado. " +
			$"Estado saludable: {VariablesGlobales.BiomaSaludable}"
		);
	}

	// ----------------------------------------
	// CONFIGURACIÓN DEL BIOMA
	// ----------------------------------------

	private void AplicarConsecuenciasAmbientales()
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		_estadoAnterior = saludable;

		// Activar escenario correspondiente
		ConfigurarEstado(_buenEstado, saludable);
		ConfigurarEstado(_malEstado, !saludable);

		// Mantener visible el fondo del océano
		if (_fondo != null)
			_fondo.Visible = true;

		// Contaminación solo en estado malo
		ConfigurarParticulas(
			_particulasContaminacion,
			!saludable
		);
	}

	// ----------------------------------------
	// ESTADOS DEL ESCENARIO
	// ----------------------------------------

	private static void ConfigurarEstado(
		Node2D estado,
		bool activo)
	{
		if (estado == null)
			return;

		estado.Visible = activo;

		estado.ProcessMode = activo
			? ProcessModeEnum.Inherit
			: ProcessModeEnum.Disabled;
	}

	// ----------------------------------------
	// PARTÍCULAS AMBIENTALES
	// ----------------------------------------

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

	// ----------------------------------------
	// DETECTAR CAMBIOS AMBIENTALES
	// ----------------------------------------

	public override void _Process(double delta)
	{
		bool saludable = VariablesGlobales.BiomaSaludable;

		if (saludable != _estadoAnterior)
		{
			AplicarConsecuenciasAmbientales();

			GD.Print(
				saludable
					? "El océano ha recuperado su estado saludable."
					: "El océano se encuentra contaminado."
			);
		}
	}
}
