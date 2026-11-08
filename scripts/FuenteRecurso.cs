using Godot;

public partial class FuenteRecurso : Area2D
{
	[ExportGroup("Recurso")]
	[Export] public PackedScene EscenaRecurso;       // escena del recurso (ej. item_baya.tscn)
	[Export] public int CantidadBuenEstado = 3;      // piezas totales si el bioma está saludable
	[Export] public int CantidadMalEstado = 2;       // piezas totales si el bioma está degradado
	[Export] public Marker2D PuntoDrop;              // desde dónde caen (si se deja vacío busca un Marker2D hijo)
	[Export] public float Dispersion = 25.0f;        // empuje lateral aleatorio al caer

	[ExportGroup("Interacción")]
	[Export] public string GrupoJugador = "jugador"; // grupo de los animales jugables
	[Export] public StringName AccionInteractuar = "interactuar";
	[Export] public CanvasItem Indicador;            // opcional: icono "E" (acepta Label, Sprite2D, etc.)

	[ExportGroup("Apariencia por etapas")]
	[Export] public AnimatedSprite2D SpriteFuente;   // opcional: si se deja vacío busca un hijo "AnimatedSprite2D"
	[Export] public string AnimacionBase = "bayas";  // fotogramas de lleno a vacío
	[Export] public string SufijoEstadoMalo = "_bad"; // animación del estado malo: "bayas_bad"

	private int _jugadoresDentro = 0;
	private int _dropeados = 0;
	private StringName _animacion;

	private int CantidadTotal => VariablesGlobales.BiomaSaludable ? CantidadBuenEstado : CantidadMalEstado;
	private bool Agotada => _dropeados >= CantidadTotal;

	public override void _Ready()
	{
		// Si no se asignaron en el Inspector, los busca solos
		Indicador ??= GetNodeOrNull<CanvasItem>("Indicador") ?? GetNodeOrNull<CanvasItem>("Label");
		SpriteFuente ??= GetNodeOrNull<AnimatedSprite2D>("AnimatedSprite2D");
		PuntoDrop ??= GetNodeOrNull<Marker2D>("PuntoDrop") ?? BuscarMarker();

		if (PuntoDrop == null)
			GD.PushWarning($"{Name}: no encontré ningún Marker2D. Las piezas caerán desde la base de la fuente.");

		ElegirAnimacion();

		BodyEntered += OnBodyEntered;
		BodyExited += OnBodyExited;

		ActualizarApariencia();
		ActualizarIndicador(); // arranca oculto
	}

	// Busca cualquier Marker2D hijo, aunque tenga otro nombre
	private Marker2D BuscarMarker()
	{
		foreach (Node hijo in GetChildren())
		{
			if (hijo is Marker2D m)
				return m;
		}
		return null;
	}

	public override void _ExitTree()
	{
		BodyEntered -= OnBodyEntered;
		BodyExited -= OnBodyExited;
	}

	public override void _Process(double delta)
	{
		if (_jugadoresDentro <= 0 || Agotada) return;

		if (Input.IsActionJustPressed(AccionInteractuar))
			SoltarUnRecurso();
	}

	private void OnBodyEntered(Node2D body)
	{
		if (!body.IsInGroup(GrupoJugador)) return;
		_jugadoresDentro++;
		ActualizarIndicador();
	}

	private void OnBodyExited(Node2D body)
	{
		if (!body.IsInGroup(GrupoJugador)) return;
		_jugadoresDentro = Mathf.Max(0, _jugadoresDentro - 1);
		ActualizarIndicador();
	}

	private void SoltarUnRecurso()
	{
		if (EscenaRecurso == null)
		{
			GD.PushWarning($"{Name}: falta asignar EscenaRecurso en el Inspector.");
			return;
		}

		_dropeados++;

		Vector2 origen = PuntoDrop != null ? PuntoDrop.GlobalPosition : GlobalPosition;

		var recurso = EscenaRecurso.Instantiate<Node2D>();
		GetTree().CurrentScene.AddChild(recurso);
		recurso.GlobalPosition = origen;

		// Pequeño empuje aleatorio para que no caigan siempre en el mismo punto
		if (recurso is RigidBody2D cuerpo)
		{
			float x = (float)GD.RandRange(-Dispersion, Dispersion);
			float y = (float)GD.RandRange(-60.0, -20.0);
			cuerpo.LinearVelocity = new Vector2(x, y);
		}

		ActualizarApariencia();
		ActualizarIndicador();
	}

	// Elige "bayas" o "bayas_bad" según el estado del bioma.
	// Si la versión mala no existe, usa la normal.
	private void ElegirAnimacion()
	{
		if (SpriteFuente == null || SpriteFuente.SpriteFrames == null) return;

		StringName deseada = VariablesGlobales.BiomaSaludable
			? new StringName(AnimacionBase)
			: new StringName(AnimacionBase + SufijoEstadoMalo);

		if (SpriteFuente.SpriteFrames.HasAnimation(deseada))
			_animacion = deseada;
		else if (SpriteFuente.SpriteFrames.HasAnimation(AnimacionBase))
			_animacion = AnimacionBase;
		else
			GD.PushWarning($"{Name}: no existe la animación '{deseada}' en el AnimatedSprite2D.");
	}

	// Muestra el fotograma que corresponde a las piezas que quedan.
	// El primer fotograma es la fuente llena y el último la fuente vacía.
	private void ActualizarApariencia()
	{
		if (SpriteFuente == null || SpriteFuente.SpriteFrames == null || _animacion == null)
			return;

		int fotogramas = SpriteFuente.SpriteFrames.GetFrameCount(_animacion);
		if (fotogramas <= 0) return;

		int total = Mathf.Max(1, CantidadTotal);
		float progreso = Mathf.Clamp(_dropeados / (float)total, 0.0f, 1.0f);
		int indice = Mathf.RoundToInt(progreso * (fotogramas - 1));

		SpriteFuente.Animation = _animacion;
		SpriteFuente.Stop();          // no se reproduce sola: la controla el script
		SpriteFuente.Frame = indice;
	}

	private void ActualizarIndicador()
	{
		if (Indicador != null)
			Indicador.Visible = _jugadoresDentro > 0 && !Agotada;
	}
} 
