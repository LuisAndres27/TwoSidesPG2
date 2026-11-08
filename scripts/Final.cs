
using Godot;
using TwoSides.Network;
using TwoSides.Integration.Sqlite;

public partial class Final : Control
{
	// ----------------------------------------
	// TIPOS DE FINAL
	// ----------------------------------------

	public enum TipoFinal
	{
		Bueno,
		Medio,
		Malo
	}

	[ExportGroup("Configuración")]

	[Export] public float VelocidadTexto = 40.0f;
	[Export] public float EsperaContinuar = 0.3f;

	[Export] public PackedScene EscenaMenuNiveles;

	// ----------------------------------------
	// FINAL BUENO
	// ----------------------------------------

	[ExportGroup("Final bueno")]
	[Export] public string TituloBueno =
		"¡Un futuro sostenible!";

	[Export(PropertyHint.MultilineText)]
	public string TextoBueno =
		"¡Felicidades! Tus decisiones contribuyeron a " +
		"proteger los cinco ecosistemas y conservar " +
		"sus recursos naturales.\n\n" +
		"Gracias a tus acciones responsables, los " +
		"animales encontraron condiciones favorables " +
		"para sobrevivir y la biodiversidad pudo " +
		"mantenerse en equilibrio.\n\n" +
		"Has demostrado que las decisiones humanas " +
		"pueden construir un futuro más sostenible.";

	// ----------------------------------------
	// FINAL MEDIO
	// ----------------------------------------

	[ExportGroup("Final medio")]
	[Export] public string TituloMedio =
		"Un futuro incierto";

	[Export(PropertyHint.MultilineText)]
	public string TextoMedio =
		"Tus decisiones tuvieron consecuencias tanto " +
		"positivas como negativas en los ecosistemas.\n\n" +
		"Algunos biomas conservaron sus recursos y su " +
		"biodiversidad, mientras otros experimentaron " +
		"deterioro ambiental.\n\n" +
		"Aunque todavía existe esperanza, es necesario " +
		"tomar decisiones más responsables para " +
		"proteger el equilibrio de la naturaleza.";

	// ----------------------------------------
	// FINAL MALO
	// ----------------------------------------

	[ExportGroup("Final malo")]
	[Export] public string TituloMalo =
		"Las consecuencias de nuestras decisiones";

	[Export(PropertyHint.MultilineText)]
	public string TextoMalo =
		"Las decisiones tomadas provocaron un " +
		"deterioro considerable en los ecosistemas.\n\n" +
		"La pérdida de biodiversidad, la escasez de " +
		"recursos y los cambios ambientales afectaron " +
		"las condiciones de vida de los animales.\n\n" +
		"Este resultado demuestra la importancia de " +
		"actuar responsablemente para proteger " +
		"el futuro del planeta.";

	// ----------------------------------------
	// NODOS
	// ----------------------------------------

	private Label _titulo;
	private RichTextLabel _texto;
	private Label _continuar;

	private Tween _tween;

	private bool _escribiendo = true;
	private bool _cambiando = false;

	private ulong _momentoContinuar = 0;
	private LocalGameState _local;
	private string _game;
	private bool _closed;
	private string _ending;

	// ----------------------------------------
	// INICIALIZACIÓN
	// ----------------------------------------

	public override async void _Ready()
	{
		Visible = false;
		var context = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
		if (context == null) { GoRecovery(); return; }
		await context.Initialization;
		if (!IsInstanceValid(this) || !IsInsideTree()) return;
		_local=context.State;
		if (!await _local.PrepareFinalAsync()) { GoRecovery(); return; }
		if (!IsInstanceValid(this) || !IsInsideTree()) return;
		_ending = _local.ConfirmedEnding;
		_game = _local.ActiveGame?.Game.GameId;
		if (_ending == null) { GoRecovery(); return; }
		Visible = true;
		GetTree().Paused = false;

		_titulo = GetNode<Label>("Titulo");
		_texto = GetNode<RichTextLabel>("Texto");
		_continuar = GetNode<Label>("Continuar");

		TipoFinal resultado = _ending == "good" ? TipoFinal.Bueno : _ending == "medium" ? TipoFinal.Medio : TipoFinal.Malo;

		GD.Print(
			$"[Final] Mostrando final: {resultado}"
		);

		// Seleccionar los textos correspondientes
		switch (resultado)
		{
			case TipoFinal.Bueno:
				_titulo.Text = TituloBueno;
				_texto.Text = TextoBueno;
				break;

			case TipoFinal.Medio:
				_titulo.Text = TituloMedio;
				_texto.Text = TextoMedio;
				break;

			case TipoFinal.Malo:
				_titulo.Text = TituloMalo;
				_texto.Text = TextoMalo;
				break;
		}

		// Preparar animación de escritura
		_escribiendo = true;
		_cambiando = false;

		_continuar.Text = "Clic para salir del final e iniciar una nueva partida ▼";
		_continuar.Hide();

		_texto.VisibleRatio = 0.0f;

		float duracion = Mathf.Max(
			0.1f,
			_texto.GetParsedText().Length /
			Mathf.Max(1.0f, VelocidadTexto)
		);

		_tween = CreateTween();

		_tween.TweenProperty(
			_texto,
			"visible_ratio",
			1.0f,
			duracion
		);

		_tween.Finished += TerminarTexto;
	}

	// ----------------------------------------
	// DETECTAR CLIC O ESPACIO
	// ----------------------------------------

	public override void _Input(InputEvent evento)
	{
		if (_cambiando || !Visible)
			return;

		bool teclado = evento.IsActionPressed("ui_accept")
			&& !(evento is InputEventKey tecla && tecla.Echo);

		bool mouse =
			evento is InputEventMouseButton mb &&
			mb.Pressed &&
			mb.ButtonIndex == MouseButton.Left;

		if (!teclado && !mouse)
			return;

		GetViewport().SetInputAsHandled();

		if (_escribiendo)
		{
			// Completar el texto inmediatamente
			_tween?.Kill();

			TerminarTexto();
		}
		else if (
			Time.GetTicksMsec() >= _momentoContinuar)
		{
			IrAlMenu();
		}
	}

	// ----------------------------------------
	// TERMINAR ESCRITURA
	// ----------------------------------------

	private void TerminarTexto()
	{
		if (!_escribiendo)
			return;

		_escribiendo = false;

		_texto.VisibleRatio = 1.0f;

		_continuar.Show();

		_momentoContinuar =
			Time.GetTicksMsec() +
			(ulong)(
				Mathf.Max(0.0f, EsperaContinuar) *
				1000.0f
			);
	}

	// ----------------------------------------
	// REGRESAR AL MENÚ
	// ----------------------------------------

	private async void IrAlMenu()
	{
		if (_cambiando || _local == null || GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
		_cambiando = true;
		_continuar.Text = "Confirmando salida...";
		bool confirmed = _closed || await _local.CloseFinalAsync(_game,_ending);
		if (!IsInstanceValid(this) || !IsInsideTree()) return;
		_cambiando = false;
		if (confirmed)
		{
			_closed=true;
			var tree=GetTree();
			if(tree.ChangeSceneToFile(LocalMenuReturn.Destination)==Error.Ok)tree.Paused=false;
			else _continuar.Text="Partida cerrada y conservada. No se pudo abrir el menú; clic para reintentar.";
		}
		else
		{
			_continuar.Text = "No se confirmó la salida. Clic para reintentar la misma operación.";
		}
	}
	private void GoRecovery()
	{
		Visible = false; _cambiando = true;
		GetTree().Paused=false;
		GetTree().CallDeferred(SceneTree.MethodName.ChangeSceneToFile, LocalMenuReturn.Destination);
	}
	public override void _Process(double delta)
	{
		// The immutable SQLite-confirmed result remains visible until explicit local exit.
	}

	// ----------------------------------------
	// LIMPIEZA
	// ----------------------------------------

	public override void _ExitTree()
	{
		_tween?.Kill();
	}
}
