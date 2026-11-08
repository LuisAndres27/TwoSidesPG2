
using Godot;
using System;
using System.Threading.Tasks;

public partial class Transicion : CanvasLayer
{
	[Export] public float Duracion = 0.8f;

	private ColorRect _rect;
	private bool _ocupado = false;

	// Permite que DecisionNivel consulte la transición
	public bool Ocupado => _ocupado;

	public override void _Ready()
	{
		// Continuar funcionando cuando el juego esté pausado
		ProcessMode = ProcessModeEnum.Always;
		Layer = 100;

		_rect = new ColorRect
		{
			Color = new Color(0, 0, 0, 0),
			MouseFilter = Control.MouseFilterEnum.Ignore
		};

		AddChild(_rect);

		_rect.SetAnchorsAndOffsetsPreset(
			Control.LayoutPreset.FullRect
		);
	}

	// ----------------------------------------
	// CAMBIAR ESCENA
	// ----------------------------------------

	public async void CambiarEscena(string ruta) => await CambiarEscenaValidadaAsync(ruta, () => true);

	// La validacion se ejecuta tras el fundido, antes de instanciar la escena.
	public Task<bool> CambiarEscenaValidadaAsync(string ruta, Func<bool> antesDeCambiar)
		=> CambiarEscenaValidadaAsync(ruta, antesDeCambiar, () => { });
	public async Task<bool> CambiarEscenaValidadaAsync(string ruta, Func<bool> antesDeCambiar, Action despuesDeAceptar)
	{
		GD.Print(
			$"[Transicion] Pedido: {ruta} " +
			$"(ocupado={_ocupado})"
		);

		// Evitar cambios simultáneos
		if (_ocupado)
			return false;

		if (string.IsNullOrWhiteSpace(ruta))
		{
			GD.PushError(
                "[Transicion] La ruta de la escena está vacía."
			);
			return false;
		}

		_ocupado = true;

		try
		{
			// Verificar que la escena exista
			PackedScene escena =
				ResourceLoader.Load<PackedScene>(ruta);

			if (escena == null)
			{
				GD.PushError(
					$"[Transicion] No se pudo cargar: {ruta}"
				);
				return false;
			}

			// Bloquear clics durante el fundido
			_rect.MouseFilter =
				Control.MouseFilterEnum.Stop;

			// Oscurecer la pantalla
			await Fundir(1.0f);
			if (!antesDeCambiar()) return false;

			// Cambiar escena
			Error error = GetTree().ChangeSceneToPacked(
				escena
			);

			if (error != Error.Ok)
			{
				GD.PushError(
					$"[Transicion] Error al cambiar: {error}"
				);
			}
			else
			{
				despuesDeAceptar?.Invoke();
				// Esperar a que la nueva escena se inicialice
				await ToSignal(
					GetTree(),
					SceneTree.SignalName.ProcessFrame
				);

				await ToSignal(
					GetTree(),
					SceneTree.SignalName.ProcessFrame
				);

				GD.Print("[Transicion] Escena cambiada.");
			}

			// Mostrar el nuevo nivel
			await Fundir(0.0f);
			return error == Error.Ok;
		}
		catch (Exception ex)
		{
			GD.PushError(
				$"[Transicion] Error: {ex.Message}"
			);
			return false;
		}
		finally
		{
			// Evitar dejar la pantalla negra
			if (GodotObject.IsInstanceValid(_rect))
			{
				_rect.Color = new Color(0, 0, 0, 0);

				_rect.MouseFilter =
					Control.MouseFilterEnum.Ignore;
			}

			// Permitir otra transición
			_ocupado = false;
		}
	}

	// ----------------------------------------
	// ANIMACIÓN DE FUNDIDO
	// ----------------------------------------

	private async Task Fundir(float alpha)
	{
		Tween tween = CreateTween();

		// Funciona aunque AvisoEstadoBioma pause el juego
		tween.SetPauseMode(
			Tween.TweenPauseMode.Process
		);

		tween.SetTrans(Tween.TransitionType.Sine);
		tween.SetEase(Tween.EaseType.InOut);

		tween.TweenProperty(
			_rect,
			"color:a",
			alpha,
			Mathf.Max(0.01f, Duracion)
		);

		await ToSignal(
			tween,
			Tween.SignalName.Finished
		);
	}
}
