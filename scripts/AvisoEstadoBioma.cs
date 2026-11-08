
using Godot;

public partial class AvisoEstadoBioma : CanvasLayer
{
	[ExportGroup("Mensaje buen estado")]
	[Export] public string TituloBueno =
		"¡Bioma saludable!";

	[Export(PropertyHint.MultilineText)]
	public string MensajeBueno =
		"¡Felicidades! Tomaste una buena decisión ambiental. " +
		"Este bioma tendrá más recursos y menos peligros. " +
		"Los animales tendrán mejores condiciones para sobrevivir.";

	[ExportGroup("Mensaje mal estado")]
	[Export] public string TituloMalo =
		"¡Bioma degradado!";

	[Export(PropertyHint.MultilineText)]
	public string MensajeMalo =
		"Tomaste una mala decisión ambiental. " +
		"La escasez de recursos ha provocado cambios " +
		"en el comportamiento de los animales. " +
		"Algunos miembros de tu propia especie serán " +
		"agresivos y otros podrían ser todavía más peligrosos.";

	private Label _titulo;
	private Label _mensaje;
	private Button _botonContinuar;

	private bool _introActiva = false;

	public override void _Ready()
	{
		// El aviso debe funcionar aunque el juego esté pausado
		ProcessMode = ProcessModeEnum.Always;
		Layer = 30;

		_titulo = GetNode<Label>(
			"Centro/Tablero/Margen/Contenido/Titulo");

		_mensaje = GetNode<Label>(
			"Centro/Tablero/Margen/Contenido/Mensaje");

		_botonContinuar = GetNode<Button>(
			"Centro/Tablero/Margen/Contenido/BotonContinuar");

		_botonContinuar.Pressed += ContinuarJuego;

		// Elegir el mensaje según la decisión ambiental
		bool saludable = VariablesGlobales.BiomaSaludable;

		_titulo.Text = saludable ? TituloBueno : TituloMalo;
		_mensaje.Text = saludable ? MensajeBueno : MensajeMalo;

		_mensaje.AutowrapMode = TextServer.AutowrapMode.WordSmart;
		_botonContinuar.Text = "Continuar";

		// Bloquear controles del nivel
		_introActiva = true;
		AddToGroup("intro_bioma_activa");

		GetTree().Paused = true;
		_botonContinuar.GrabFocus();
	}

	private void ContinuarJuego()
	{
		if (!_introActiva) return;

		_introActiva = false;
		RemoveFromGroup("intro_bioma_activa");

		// Reanudar la partida
		GetTree().Paused = false;

		QueueFree();
	}

	public override void _ExitTree()
	{
		if (_botonContinuar != null)
			_botonContinuar.Pressed -= ContinuarJuego;

		// Seguridad si se elimina el aviso antes de continuar
		if (_introActiva)
		{
			_introActiva = false;
			GetTree().Paused = false;
		}
	}
}
