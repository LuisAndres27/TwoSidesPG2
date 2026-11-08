
using Godot;
using TwoSides.Network;

public partial class GameOver : CanvasLayer
{
	[ExportGroup("Escenas")]
	[Export] public PackedScene EscenaMenuNiveles;

	[ExportGroup("Transición")]
	[Export] public float DuracionFundido = 1.5f;

	[ExportGroup("Pruebas")]
	[Export] public bool MostrarAlIniciar = false;

	private Control _pantalla;
	private Button _botonReintentar;
	private Button _botonNiveles;

	private Tween _tween;
	private bool _mostrado = false;
	private bool _saliendo;
	private SceneTree _tree;

	public override void _Ready()
	{
		_tree = GetTree();
		ProcessMode = ProcessModeEnum.Always;
		Layer = 50;

		AddToGroup("game_over");

		_pantalla = GetNode<Control>("Pantalla");

		_botonReintentar = GetNode<Button>(
			"Pantalla/Botones/BotonReintentar");

		_botonNiveles = GetNode<Button>(
			"Pantalla/Botones/BotonNiveles");

		_botonReintentar.Pressed += Reintentar;
		_botonNiveles.Pressed += VolverMenu;

		// Pantalla inicialmente invisible
		_pantalla.Modulate = new Color(1, 1, 1, 0);
		_pantalla.Hide();

		if (MostrarAlIniciar)
			MostrarDerrota();
	}

	// ----------------------------------------
	// MOSTRAR GAME OVER
	// ----------------------------------------

	public void MostrarDerrota()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (_mostrado) return;

		_mostrado = true;
		GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.Telemetry.Died();

		// Desactivar botones mientras aparece
		_botonReintentar.Disabled = true;
		_botonNiveles.Disabled = true;

		// Empezar completamente transparente
		_pantalla.Modulate = new Color(1, 1, 1, 0);
		_pantalla.Show();

		// Pausar el juego
		GetTree().Paused = true;

		// Evitar transiciones duplicadas
		_tween?.Kill();

		// Crear transición de fundido
		_tween = CreateTween();

		// Ejecutar aunque el juego esté pausado
		_tween.SetPauseMode(
			Tween.TweenPauseMode.Process
		);

		// Transición suave
		_tween.SetTrans(
			Tween.TransitionType.Sine
		);

		_tween.SetEase(
			Tween.EaseType.InOut
		);

		// Aumentar la opacidad gradualmente
		_tween.TweenProperty(
			_pantalla,
			"modulate:a",
			1.0f,
			Mathf.Max(0.01f, DuracionFundido)
		);

		// Habilitar botones al terminar
		_tween.Finished += () =>
		{
			if (!GodotObject.IsInstanceValid(this) || _saliendo || !IsInsideTree()) return;

			_botonReintentar.Disabled = false;
			_botonNiveles.Disabled = false;

			_botonReintentar.GrabFocus();
		};
	}

	// Final negativo del bioma
	public void MostrarFinalNegativo()
	{
		MostrarDerrota();
	}

	// ----------------------------------------
	// REINTENTAR NIVEL
	// ----------------------------------------

	private async void Reintentar()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (!_mostrado || _botonReintentar.Disabled || AnimalSegmentFlow.IsBlocking(this)) return;
		if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado==true) return;
		_saliendo=true;
		GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.Telemetry.RequestRestart(true);
		var result=await AnimalSegmentFlow.RestartLocalAsync(this);
		if (!result.Success && GodotObject.IsInstanceValid(this) && IsInsideTree())
		{
			_saliendo=false;
			ShowLocalError(AnimalSegmentFlow.RestartMessage(result.Code));
		}
	}

	// ----------------------------------------
	// REGRESAR AL MENÚ DE NIVELES
	// ----------------------------------------

	private async void VolverMenu()
	{
		if (_saliendo || !IsInsideTree()) return;
		if (!_mostrado || _botonNiveles.Disabled || AnimalSegmentFlow.IsBlocking(this)) return;
		if (GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
		_saliendo = true;
		var result=await AnimalSegmentFlow.ReturnToLevelsLocalAsync(this);
		if (!result.Success && GodotObject.IsInstanceValid(this) && IsInsideTree())
		{
			_saliendo = false;
			ShowLocalError(AnimalSegmentFlow.LevelsReturnMessage(result.Code));
		}
	}
	private void ShowLocalError(string message)
	{
		// Reuse existing controls; no new visual elements or scene connections.
		_botonReintentar.TooltipText=message;
		_botonNiveles.TooltipText=message;
		GD.PushWarning(message);
	}

	public override void _ExitTree()
	{
		_saliendo = true;
		_tween?.Kill();

		if (_botonReintentar != null)
			_botonReintentar.Pressed -= Reintentar;

		if (_botonNiveles != null)
			_botonNiveles.Pressed -= VolverMenu;

		if (_mostrado && GodotObject.IsInstanceValid(_tree))
			_tree.Paused = false;
	}
}
