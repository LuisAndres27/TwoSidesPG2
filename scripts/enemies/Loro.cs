
using Godot;

public partial class Loro : Node2D
{
	[ExportGroup("Vuelo")]
	[Export] public float Velocidad = 60.0f;
	[Export] public float TiempoEspera = 1.0f;
	[Export] public Marker2D PuntoA;
	[Export] public Marker2D PuntoB;

	[ExportGroup("Animaciones")]
	[Export] public string AnimacionVuelo = "fly";

	private AnimatedSprite2D _sprite;
	private bool _haciaB = true;
	private float _temporizador = 0;

	public override void _Ready()
	{
		_sprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");

		if (PuntoA == null || PuntoB == null)
		{
			GD.PushError("Loro: Asigna PuntoA y PuntoB.");
			SetProcess(false);
			return;
		}

		// Comenzar el vuelo en el primer punto
		GlobalPosition = PuntoA.GlobalPosition;

		if (_sprite.SpriteFrames != null &&
			_sprite.SpriteFrames.HasAnimation(AnimacionVuelo))
		{
			_sprite.Play(AnimacionVuelo);
		}

		ActualizarEstado();
	}

	public override void _Process(double delta)
	{
		// Si el bioma está degradado, el loro desaparece
		ActualizarEstado();

		if (!Visible)
			return;

		// Esperar antes de cambiar de dirección
		if (_temporizador > 0)
		{
			_temporizador -= (float)delta;
			return;
		}

		Vector2 destino = _haciaB
			? PuntoB.GlobalPosition
			: PuntoA.GlobalPosition;

		Vector2 direccion = destino - GlobalPosition;

		// Girar el sprite hacia donde vuela
		if (Mathf.Abs(direccion.X) > 1.0f)
			_sprite.FlipH = direccion.X < 0;

		// Mover el loro
		GlobalPosition = GlobalPosition.MoveToward(
			destino,
			Velocidad * (float)delta
		);

		// Al llegar al destino, cambiar de dirección
		if (GlobalPosition.DistanceTo(destino) < 2.0f)
		{
			_haciaB = !_haciaB;
			_temporizador = TiempoEspera;
		}
	}

	private void ActualizarEstado()
	{
		Visible = VariablesGlobales.BiomaSaludable;
	}
}
