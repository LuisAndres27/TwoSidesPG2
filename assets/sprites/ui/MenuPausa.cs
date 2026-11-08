
using Godot;
using TwoSides.Network;

public partial class MenuPausa : CanvasLayer
{
	[ExportGroup("Escenas")]
	[Export] public PackedScene EscenaMenuNiveles;

	private TextureButton _botonPausa;
	private Control _fondoMenu;
	private TextureButton _botonInicio;
	private TextureButton _botonReiniciar;
	private TextureButton _botonCerrar;

	private bool _abierto = false;
	private bool _saliendo;
	private SceneTree _tree;
	private Label _error;

	public override void _Ready()
	{
		_tree = GetTree();
		_error = new Label { Position = new Vector2(20, 20), Size = new Vector2(550, 80), AutowrapMode = TextServer.AutowrapMode.WordSmart, Visible = false };
		// Permitir que el menú funcione durante la pausa
		ProcessMode = ProcessModeEnum.Always;

		_botonPausa = GetNode<TextureButton>(
			"Interfaz/BotonPausa");

		_fondoMenu = GetNode<Control>(
			"Interfaz/FondoMenu");
		_fondoMenu.AddChild(_error);

		_botonInicio = GetNode<TextureButton>(
			"Interfaz/FondoMenu/Tablero/BotonInicio");

		_botonReiniciar = GetNode<TextureButton>(
			"Interfaz/FondoMenu/Tablero/BotonReiniciar");

		_botonCerrar = GetNode<TextureButton>(
			"Interfaz/FondoMenu/Tablero/BotonCerrar");

		// Conectar botones
		_botonPausa.Pressed += AbrirMenu;
		_botonInicio.Pressed += IrMenuNiveles;
		_botonReiniciar.Pressed += ReiniciarNivel;
		_botonCerrar.Pressed += CerrarMenu;

		// Estado inicial
		_fondoMenu.Hide();
		_botonPausa.Show();
	}

	public override void _Input(InputEvent evento)
	{
		if (_saliendo || !IsInsideTree()) return;
		if (evento.IsActionPressed("ui_cancel") &&
			!(evento is InputEventKey tecla && tecla.Echo))
		{
			if (_abierto)
				CerrarMenu();
			else
				AbrirMenu();

			GetViewport().SetInputAsHandled();
		}
	}

	// ----------------------------------------
	// ABRIR MENÚ
	// ----------------------------------------

	private void AbrirMenu()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (AnimalSegmentFlow.IsBlocking(this)) return;
		if (_abierto) return;

		_abierto = true;

		_fondoMenu.Show();
		_botonPausa.Hide();

		GetTree().Paused = true;
		GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.Telemetry.Paused(true);
	}

	// ----------------------------------------
	// CERRAR MENÚ
	// ----------------------------------------

	private void CerrarMenu()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (AnimalSegmentFlow.IsBlocking(this)) return;
		if (!_abierto) return;

		GetTree().Paused = false;
		GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.Telemetry.Paused(false);

		_abierto = false;

		_fondoMenu.Hide();
		_botonPausa.Show();
	}

	// ----------------------------------------
	// REINICIAR NIVEL
	// ----------------------------------------

	private async void ReiniciarNivel()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (AnimalSegmentFlow.IsBlocking(this)) return;
		if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado==true) return;
		_saliendo=true; _error.Hide();
		GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.Telemetry.RequestRestart(false);
		var result=await AnimalSegmentFlow.RestartLocalAsync(this);
		if (!result.Success && GodotObject.IsInstanceValid(this) && IsInsideTree())
		{
			_saliendo=false;
			_error.Text=AnimalSegmentFlow.RestartMessage(result.Code); _error.Show();
		}
	}

	// ----------------------------------------
	// REGRESAR A LA SELECCIÓN LOCAL DE NIVELES
	// ----------------------------------------

	private async void IrMenuNiveles()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (AnimalSegmentFlow.IsBlocking(this)) return;
		if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
		_saliendo=true; _error.Hide();
		var result=await AnimalSegmentFlow.ReturnToLevelsLocalAsync(this);
		if (!result.Success && GodotObject.IsInstanceValid(this) && IsInsideTree())
		{
			_saliendo = false;
			_fondoMenu.Show();
			_error.Text=AnimalSegmentFlow.LevelsReturnMessage(result.Code); _error.Show();
		}
	}

	public override void _ExitTree()
	{
		_saliendo = true;
		_botonPausa.Pressed -= AbrirMenu;
		_botonInicio.Pressed -= IrMenuNiveles;
		_botonReiniciar.Pressed -= ReiniciarNivel;
		_botonCerrar.Pressed -= CerrarMenu;
		// Evitar que el juego quede pausado al salir
		if (_abierto && GodotObject.IsInstanceValid(_tree))
			_tree.Paused = false;
	}
}
