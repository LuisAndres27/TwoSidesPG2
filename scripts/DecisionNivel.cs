
using Godot;

public partial class DecisionNivel : Node2D
{
	[ExportGroup("Textos")]
	[Export] public string[] Dialogo =
	{
		"Párrafo 1",
		"Párrafo 2",
        "Párrafo 3"
	};

	[Export(PropertyHint.MultilineText)]
	public string Pregunta = "¿Qué decides?";

	[Export] public float VelocidadTexto = 40.0f;
	[Export] public float PausaEntreEntradas = 0.12f;

	[ExportGroup("Escenas")]
	[Export(PropertyHint.File, "*.tscn")]
	public string EscenaInfoBuena = "";

	[Export(PropertyHint.File, "*.tscn")]
	public string EscenaInfoMala = "";

	private enum EstadoDialogo
	{
		EscribiendoParrafo,
		EsperandoAvance,
		EscribiendoPregunta,
		EsperandoDecision,
		CambiandoEscena
	}

	private EstadoDialogo _estado;
	private int _indice = 0;
	private bool _decisionTomada = false;
	private ulong _ultimoInput = 0;

	private Tween _tween;
	private RichTextLabel _texto;
	private Control _indicador;
	private CanvasItem _botonBuena;
	private CanvasItem _botonMala;

	// ----------------------------------------
	// INICIALIZACIÓN
	// ----------------------------------------

	public override void _Ready()
	{
		_texto = GetNode<RichTextLabel>(
			"Dialogo/Panel/Texto");

		_indicador = GetNode<Control>(
			"Dialogo/Panel/Indicador");

		_botonBuena = GetNode<CanvasItem>("BotonBuena");
		_botonMala = GetNode<CanvasItem>("BotonMala");

		_botonBuena.Visible = false;
		_botonMala.Visible = false;
		_indicador.Visible = false;

		// Conectar botones automáticamente
		ConectarBoton(_botonBuena, nameof(OnBotonBuenaPressed));
		ConectarBoton(_botonMala, nameof(OnBotonMalaPressed));

		if (Dialogo == null || Dialogo.Length == 0)
			MostrarPregunta();
		else
			MostrarParrafo();
	}

	public override void _ExitTree()
	{
		_tween?.Kill();

		DesconectarBoton(_botonBuena, nameof(OnBotonBuenaPressed));
		DesconectarBoton(_botonMala, nameof(OnBotonMalaPressed));
	}
	private void ConectarBoton(CanvasItem boton, string metodo)
	{
		var llamada = new Callable(this, metodo);
		if ((boton is BaseButton || boton is TouchScreenButton) && !boton.IsConnected("pressed", llamada))
			boton.Connect("pressed", llamada);
	}
	private void DesconectarBoton(CanvasItem boton, string metodo)
	{
		var llamada = new Callable(this, metodo);
		if (GodotObject.IsInstanceValid(boton) && boton.IsConnected("pressed", llamada)) boton.Disconnect("pressed", llamada);
	}

	// ----------------------------------------
	// CONTROL DE ENTRADAS
	// ----------------------------------------

	public override void _Input(InputEvent evento)
	{
		if (_decisionTomada ||
			_estado == EstadoDialogo.EsperandoDecision ||
			_estado == EstadoDialogo.CambiandoEscena)
			return;

		bool teclado = evento.IsActionPressed("ui_accept")
			&& !(evento is InputEventKey tecla && tecla.Echo);

		bool mouse = evento is InputEventMouseButton mb
			&& mb.Pressed
			&& mb.ButtonIndex == MouseButton.Left;

		if (!teclado && !mouse) return;

		GetViewport().SetInputAsHandled();

		// Evitar múltiples entradas demasiado rápidas
		ulong ahora = Time.GetTicksMsec();
		ulong intervalo = (ulong)(
			Mathf.Max(0f, PausaEntreEntradas) * 1000f
		);

		if (ahora - _ultimoInput < intervalo)
			return;

		_ultimoInput = ahora;

		switch (_estado)
		{
			case EstadoDialogo.EscribiendoParrafo:
				CompletarTexto();
				break;

			case EstadoDialogo.EsperandoAvance:
				_indice++;

				if (_indice < Dialogo.Length)
					MostrarParrafo();
				else
					MostrarPregunta();
				break;

			case EstadoDialogo.EscribiendoPregunta:
				CompletarTexto();
				break;
		}
	}

	// ----------------------------------------
	// MOSTRAR DIÁLOGO
	// ----------------------------------------

	private void MostrarParrafo()
	{
		_estado = EstadoDialogo.EscribiendoParrafo;

		_texto.Text = Dialogo[_indice];
		_texto.VisibleRatio = 0f;
		_indicador.Visible = false;

		IniciarEscritura(_texto.Text.Length, TerminarParrafo);
	}

	private void TerminarParrafo()
	{
		if (_estado != EstadoDialogo.EscribiendoParrafo)
			return;

		_texto.VisibleRatio = 1f;
		_indicador.Visible = true;

		_estado = EstadoDialogo.EsperandoAvance;
	}

	// ----------------------------------------
	// MOSTRAR PREGUNTA
	// ----------------------------------------

	private void MostrarPregunta()
	{
		_estado = EstadoDialogo.EscribiendoPregunta;

		_texto.Text = Pregunta;
		_texto.VisibleRatio = 0f;
		_indicador.Visible = false;

		IniciarEscritura(_texto.Text.Length, MostrarOpciones);
	}

	private void MostrarOpciones()
	{
		if (_estado != EstadoDialogo.EscribiendoPregunta)
			return;

		_texto.VisibleRatio = 1f;

		_botonBuena.Visible = true;
		_botonMala.Visible = true;

		_estado = EstadoDialogo.EsperandoDecision;
	}

	// ----------------------------------------
	// EFECTO DE ESCRITURA
	// ----------------------------------------

	private void IniciarEscritura(
		int caracteres, System.Action terminado)
	{
		_tween?.Kill();

		float duracion = Mathf.Max(
			0.1f,
			caracteres / Mathf.Max(1f, VelocidadTexto)
		);

		_tween = CreateTween();

		_tween.TweenProperty(
			_texto,
			"visible_ratio",
			1.0f,
			duracion
		);

		_tween.Finished += terminado.Invoke;
	}

	private void CompletarTexto()
	{
		_tween?.Kill();
		_texto.VisibleRatio = 1f;

		if (_estado == EstadoDialogo.EscribiendoParrafo)
			TerminarParrafo();

		else if (_estado == EstadoDialogo.EscribiendoPregunta)
			MostrarOpciones();
	}

	// ----------------------------------------
	// BOTONES DE DECISIÓN
	// ----------------------------------------

	public void OnBotonBuenaPressed()
	{
		Decidir(true, EscenaInfoBuena);
	}

	public void OnBotonMalaPressed()
	{
		Decidir(false, EscenaInfoMala);
	}

	// ----------------------------------------
	// GUARDAR DECISIÓN Y CAMBIAR ESCENA
	// ----------------------------------------

	protected bool PuedeDecidir => !_decisionTomada && _estado == EstadoDialogo.EsperandoDecision;
	protected void MostrarEsperaBackend(string mensaje)
	{
		_decisionTomada = true;
		_estado = EstadoDialogo.CambiandoEscena;
		_tween?.Kill();
		_texto.Text = mensaje;
		_texto.VisibleRatio = 1f;
		_indicador.Visible = false;
		_botonBuena.Visible = false;
		_botonMala.Visible = false;
	}

	protected virtual async void Decidir(bool saludable, string escena)
	{
		if (_decisionTomada ||
			_estado != EstadoDialogo.EsperandoDecision)
			return;

		if (string.IsNullOrWhiteSpace(escena) ||
			!ResourceLoader.Exists(escena))
		{
			GD.PushError(
				$"{Name}: La escena de información " +
				$"no existe o no fue asignada: {escena}"
			);
			return;
		}

		_decisionTomada = true;
		_estado = EstadoDialogo.CambiandoEscena;

		_botonBuena.Visible = false;
		_botonMala.Visible = false;

		// Evitar que una pausa anterior bloquee la transición
		GetTree().Paused = false;

		var transicion =
			GetNodeOrNull<Transicion>("/root/Transicion");

		if (transicion != null)
		{
			// Esperar si otra transición está terminando
			int intentos = 0;

			while (transicion.Ocupado && intentos < 180)
			{
				await ToSignal(
					GetTree(),
					SceneTree.SignalName.ProcessFrame
				);

				if (!IsInsideTree()) return;

				intentos++;
			}

			if (transicion.Ocupado)
			{
				GD.PushWarning(
					"La transición sigue ocupada. " +
                    "Puedes volver a elegir."
				);

				_decisionTomada = false;
				_estado = EstadoDialogo.EsperandoDecision;

				_botonBuena.Visible = true;
				_botonMala.Visible = true;
				return;
			}
		}

		// Registrar la decisión
		VariablesGlobales.BiomaSaludable = saludable;

		GD.Print(
			$"[DecisionNivel] Decisión: " +
			$"{(saludable ? "Buena" : "Mala")}"
		);

		GD.Print(
			$"[DecisionNivel] Cambiando a: {escena}"
		);

		if (transicion != null)
		{
			transicion.CambiarEscena(escena);
		}
		else
		{
			GetTree().CallDeferred(
				SceneTree.MethodName.ChangeSceneToFile,
				escena
			);
		}
	}
}
