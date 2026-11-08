
using Godot;

public partial class InfoDecision : Control
{
	[ExportGroup("Textos")]
	[Export] public string Titulo = "";

	[Export(PropertyHint.MultilineText)]
	public string Texto = "";

	[ExportGroup("Escena siguiente")]
	[Export(PropertyHint.File, "*.tscn")]
	public string EscenaSiguiente = "";

	[ExportGroup("Velocidad")]
	[Export] public float VelocidadTexto = 40.0f;
	[Export] public float EsperaParaContinuar = 0.3f;
	[Export] public float AvanzarAutomaticoSegundos = 0.0f;

	private RichTextLabel _texto;
	private Label _continuar;
	private Tween _tween;
	private Tween _tweenAuto;

	private bool _escribiendo = true;
	private bool _puedeContinuar = false;
	private bool _yaSalio = false;

	private string _textoContinuarOriginal;

	// ----------------------------------------
	// INICIALIZACIÓN
	// ----------------------------------------

	public override void _Ready()
	{
		var tituloLabel = GetNode<Label>("Titulo");

		_texto = GetNode<RichTextLabel>("Texto");
		_continuar = GetNode<Label>("Continuar");

		_textoContinuarOriginal = _continuar.Text;

		if (!string.IsNullOrEmpty(Titulo))
			tituloLabel.Text = Titulo;

		if (!string.IsNullOrEmpty(Texto))
			_texto.Text = Texto;

		_continuar.Visible = false;
		_texto.VisibleRatio = 0.0f;

		float duracion = Mathf.Max(
			0.1f,
			_texto.Text.Length / Mathf.Max(1f, VelocidadTexto)
		);

		_tween = CreateTween();

		_tween.TweenProperty(
			_texto,
			"visible_ratio",
			1.0f,
			duracion
		);

		_tween.Finished += TerminarDeEscribir;
	}

	public override void _ExitTree()
	{
		_tween?.Kill();
		_tweenAuto?.Kill();
	}

	// ----------------------------------------
	// CONTROL DE ENTRADAS
	// ----------------------------------------

	public override void _Input(InputEvent evento)
	{
		// No aceptar entradas mientras cambia de escena
		if (_yaSalio)
			return;

		bool teclado = evento.IsActionPressed("ui_accept")
			&& !(evento is InputEventKey tecla && tecla.Echo);

		bool mouse = evento is InputEventMouseButton mb
			&& mb.Pressed
			&& mb.ButtonIndex == MouseButton.Left;

		if (!teclado && !mouse)
			return;

		GetViewport().SetInputAsHandled();

		if (_escribiendo)
		{
			// Completar el texto inmediatamente
			_tween?.Kill();
			_texto.VisibleRatio = 1.0f;

			TerminarDeEscribir();
		}
		else if (_puedeContinuar)
		{
			IrALaSiguienteEscena();
		}
	}

	// ----------------------------------------
	// TERMINAR EFECTO DE TEXTO
	// ----------------------------------------

	private void TerminarDeEscribir()
	{
		if (!_escribiendo || _yaSalio)
			return;

		_escribiendo = false;
		_continuar.Visible = true;

		_tweenAuto?.Kill();

		_tweenAuto = CreateTween();

		_tweenAuto.TweenInterval(
			Mathf.Max(0f, EsperaParaContinuar)
		);

		_tweenAuto.TweenCallback(
			Callable.From(() => _puedeContinuar = true)
		);

		// Avance automático opcional
		if (AvanzarAutomaticoSegundos > 0)
		{
			_tweenAuto.TweenInterval(
				AvanzarAutomaticoSegundos
			);

			_tweenAuto.TweenCallback(
				Callable.From(IrALaSiguienteEscena)
			);
		}
	}

	// ----------------------------------------
	// CAMBIAR ESCENA SIN BLOQUEARSE
	// ----------------------------------------

	private async void IrALaSiguienteEscena()
	{
		// Evitar solicitudes repetidas
		if (_yaSalio)
			return;

		if (string.IsNullOrWhiteSpace(EscenaSiguiente))
		{
			GD.PushError(
                "[InfoDecision] EscenaSiguiente está vacía."
			);
			return;
		}

		if (!ResourceLoader.Exists(EscenaSiguiente))
		{
			GD.PushError(
				$"[InfoDecision] No existe: {EscenaSiguiente}"
			);
			return;
		}

		// Bloquear entradas inmediatamente
		_yaSalio = true;
		_puedeContinuar = false;

		SetProcessInput(false);

		_tween?.Kill();
		_tweenAuto?.Kill();

		_continuar.Text = "Cargando...";

		var transicion = GetNodeOrNull<Transicion>(
            "/root/Transicion"
		);

		if (transicion != null)
		{
			// Esperar a que termine la transición anterior
			ulong inicioEspera = Time.GetTicksMsec();

			while (transicion.Ocupado)
			{
				// Evitar una espera infinita
				if (Time.GetTicksMsec() - inicioEspera > 6000UL)
				{
					GD.PushError(
						"[InfoDecision] La transición sigue " +
                        "ocupada después de 6 segundos."
					);

					DesbloquearEntrada();
					return;
				}

				await ToSignal(
					GetTree(),
					SceneTree.SignalName.ProcessFrame
				);

				// La escena podría haberse eliminado
				if (!IsInsideTree())
					return;

				if (!GodotObject.IsInstanceValid(transicion))
					return;
			}

			GD.Print(
				$"[InfoDecision] Cambiando a: {EscenaSiguiente}"
			);

			GetTree().Paused = false;

			transicion.CambiarEscena(EscenaSiguiente);
		}
		else
		{
			// Cambiar sin gestor de transición
			GetTree().Paused = false;

			GetTree().CallDeferred(
				SceneTree.MethodName.ChangeSceneToFile,
				EscenaSiguiente
			);
		}
	}

	// ----------------------------------------
	// RECUPERAR CONTROL SI FALLA
	// ----------------------------------------

	private void DesbloquearEntrada()
	{
		_yaSalio = false;
		_puedeContinuar = true;

		_continuar.Text = _textoContinuarOriginal;
		_continuar.Visible = true;

		SetProcessInput(true);
	}
}
