using Godot;

public partial class DesicionNieve : Node2D
{
	[Export] public float VelocidadTexto = 40.0f; // caracteres por segundo

	private readonly string[] _dialogo =
	{
		"Una empresa petrolera ha descubierto enormes reservas de petróleo y gas bajo la tundra. Dicen que la plataforma traería empleo y mucho dinero a la región. [Presiona espacio para continuar]",
	"Pero los científicos advierten que las emisiones de una extracción masiva alterarían el clima de forma extrema. La tundra es el hogar de osos, zorros y muchas otras especies.[Presiona espacio para continuar]",
    "La decisión está en tus manos: el progreso económico o la protección de este ecosistema. [Presiona espacio para continuar]"
	};

	private const string PREGUNTA = "¿Apruebas la plataforma de extracción de petróleo y gas en la tundra?";

	private const string ESCENA_INFO_BUENA = "res://scenes/levels/info_buena.tscn";
	private const string ESCENA_INFO_MALA = "res://scenes/levels/info_mala.tscn";

	private int _indice = 0;
	private bool _escribiendo = false;
	private bool _dialogoTerminado = false;
	private bool _decisionTomada = false;
	private bool _opcionesVisibles = false;
	private DecisionSceneFlow _flow;
	private Tween _tween;

	private CanvasLayer _dialogoLayer;
	private RichTextLabel _texto;
	private Control _indicador;
	private CanvasItem _botonBuena;
	private CanvasItem _botonMala;

	public override void _Ready()
	{
		_dialogoLayer = GetNode<CanvasLayer>("Dialogo");
		_texto = GetNode<RichTextLabel>("Dialogo/Panel/Texto");
		_indicador = GetNode<Control>("Dialogo/Panel/Indicador");
		_botonBuena = GetNode<CanvasItem>("BotonBuena");
		_botonMala = GetNode<CanvasItem>("BotonMala");
		_flow = new DecisionSceneFlow(this, () => "tundra", () => !_decisionTomada && _opcionesVisibles,
			MostrarEsperaBackend, () => ESCENA_INFO_BUENA, () => ESCENA_INFO_MALA);

		// Los botones empiezan ocultos hasta terminar la conversación y la pregunta
		_botonBuena.Visible = false;
		_botonMala.Visible = false;

		MostrarParrafo();
	}

	public override void _ExitTree()
	{
		_tween?.Kill();
	}

	public override async void _UnhandledInput(InputEvent @event)
	{
		if (_flow != null && _flow.AcceptsRetry(@event)) { await _flow.RetryInputAsync(@event); return; }
		if (_dialogoTerminado) return;

		bool avanzar = @event.IsActionPressed("ui_accept")
			|| (@event is InputEventMouseButton mb && mb.Pressed && mb.ButtonIndex == MouseButton.Left);

		if (!avanzar) return;

		GetViewport().SetInputAsHandled();

		if (_escribiendo)
		{
			// Si todavía escribe, completa el párrafo al instante
			_tween?.Kill();
			_texto.VisibleRatio = 1.0f;
			TerminarDeEscribir();
		}
		else
		{
			_indice++;
			if (_indice < _dialogo.Length)
				MostrarParrafo();
			else
				MostrarPregunta();
		}
	}

	private void MostrarParrafo()
	{
		_texto.Text = _dialogo[_indice];
		_texto.VisibleRatio = 0.0f;
		_indicador.Visible = false;
		_escribiendo = true;

		float duracion = _dialogo[_indice].Length / VelocidadTexto;

		_tween?.Kill();
		_tween = CreateTween();
		_tween.TweenProperty(_texto, "visible_ratio", 1.0f, duracion);
		_tween.Finished += TerminarDeEscribir;
	}

	private void TerminarDeEscribir()
	{
		_escribiendo = false;
		_indicador.Visible = true;
	}

	private void MostrarPregunta()
	{
		_dialogoTerminado = true;
		_indicador.Visible = false;

		_texto.Text = PREGUNTA;
		_texto.VisibleRatio = 0.0f;

		_tween?.Kill();
		_tween = CreateTween();
		_tween.TweenProperty(_texto, "visible_ratio", 1.0f, PREGUNTA.Length / VelocidadTexto);
		_tween.Finished += () =>
		{
			// El panel se queda visible con la pregunta; ahora aparecen los botones
			_botonBuena.Visible = true;
			_botonMala.Visible = true;
			_opcionesVisibles = true;
		};
	}

	// BUENA decisión: prohibir la plataforma y proteger la tundra
	public async void OnBotonBuenaPressed()
	{
		if (_flow != null) await _flow.ChooseAsync(true);
	}

	// MALA decisión: aprobar la extracción (en el nivel se activa la tormenta de nieve severa)
	public async void OnBotonMalaPressed()
	{
		if (_flow != null) await _flow.ChooseAsync(false);
	}
	private void MostrarEsperaBackend(string mensaje)
	{
		_decisionTomada = true;
		_opcionesVisibles = false;
		_tween?.Kill();
		_texto.Text = mensaje;
		_texto.VisibleRatio = 1.0f;
		_indicador.Visible = false;
		_botonBuena.Visible = false;
		_botonMala.Visible = false;
	}
}
