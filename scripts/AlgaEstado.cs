
using Godot;

public partial class AlgaEstado : AnimatedSprite2D
{
	[ExportGroup("Animaciones")]
	[Export] public string AnimBuenEstado = "alga";
	[Export] public string AnimMalEstado = "alga_bad";

	private bool _estadoAnterior;

	public override void _Ready()
	{
		_estadoAnterior = VariablesGlobales.BiomaSaludable;
		ActualizarAnimacion();
	}

	public override void _Process(double delta)
	{
		if (_estadoAnterior != VariablesGlobales.BiomaSaludable)
		{
			_estadoAnterior = VariablesGlobales.BiomaSaludable;
			ActualizarAnimacion();
		}
	}

	private void ActualizarAnimacion()
	{
		if (SpriteFrames == null)
		{
			GD.PushWarning($"{Name}: No tiene SpriteFrames.");
			return;
		}

		string animacion = VariablesGlobales.BiomaSaludable
			? AnimBuenEstado
			: AnimMalEstado;

		// Si no existe la animación solicitada,
		// intentar utilizar la animación del estado bueno.
		if (!SpriteFrames.HasAnimation(animacion))
		{
			GD.PushWarning(
				$"{Name}: No existe '{animacion}'. " +
				$"Animaciones disponibles: " +
				string.Join(", ", SpriteFrames.GetAnimationNames())
			);

			animacion = AnimBuenEstado;
		}

		// No reproducir animaciones inexistentes.
		if (!SpriteFrames.HasAnimation(animacion))
		{
			Stop();
			return;
		}

		if (SpriteFrames.GetFrameCount(animacion) == 0)
		{
			Stop();
			return;
		}

		if (Animation != animacion || !IsPlaying())
			Play(animacion);
	}
}
