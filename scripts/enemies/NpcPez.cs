
using Godot;
using System.Collections.Generic;

public partial class NpcPez : CharacterBody2D
{
	[ExportGroup("Movimiento acuático")]
	[Export] public float Speed = 90.0f;
	[Export] public float Acceleration = 500.0f;
	[Export] public float Friction = 250.0f;
	[Export] public float MaxTiltDegrees = 25.0f;
	[Export] public float TiltSpeed = 8.0f;
	[Export] public float RadioHorizontal = 150.0f;
	[Export] public float RadioVertical = 75.0f;
	[Export] public float PausaMin = 0.8f;
	[Export] public float PausaMax = 2.0f;
	[Export] public float DuracionEscape = 0.65f;

	[Export(PropertyHint.Layers2DPhysics)]
	public uint MascaraObstaculos = 1;

	[ExportGroup("Animaciones")]
	[Export] public string AnimQuieta = "idle";
	[Export] public string AnimNado = "run";
	[Export] public string SufijoEstadoMalo = "_bad";

	[ExportGroup("Comida")]
	[Export] public PackedScene EscenaComida;
	[Export] public int CantidadComidaSaludable = 3;
	[Export] public int CantidadComidaMalEstado = 1;
	[Export] public string GrupoJugador = "jugador";
	[Export] public float RadioContacto = 40.0f;
	[Export] public bool SoloEnMalEstado = false;

	private AnimatedSprite2D _sprite;
	private Vector2 _origen, _destino;
	private Vector2 _direccionEscape = Vector2.Zero;
	private float _pausa = 0.0f;
	private float _tiempoEscape = 0.0f;
	private bool _comidaSoltada = false;
	private readonly HashSet<ulong> _jugadoresIgnorados = new();

	public override void _Ready()
	{
		_sprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		MotionMode = MotionModeEnum.Floating;

		// Choca con el terreno, pero no bloquea al delfín
		CollisionLayer = 0;
		CollisionMask = MascaraObstaculos;

		_origen = GlobalPosition;
		ElegirDestino();
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_comidaSoltada) return;

		float dt = (float)delta;

		ComprobarJugador();
		if (_comidaSoltada) return;

		// Movimiento para escapar de una superficie
		if (_tiempoEscape > 0.0f)
		{
			_tiempoEscape = Mathf.Max(
				0.0f, _tiempoEscape - dt
			);

			Velocity = Velocity.MoveToward(
				_direccionEscape * Speed,
				Acceleration * dt
			);

			if (_tiempoEscape <= 0.0f)
			{
				// Continuar alejándose del obstáculo
				_destino = GlobalPosition
					+ _direccionEscape * 45.0f;
			}
		}
		else if (_pausa > 0.0f)
		{
			_pausa -= dt;

			Velocity = Velocity.MoveToward(
				Vector2.Zero,
				Friction * dt
			);

			if (_pausa <= 0.0f)
				ElegirDestino();
		}
		else
		{
			Vector2 diferencia = _destino - GlobalPosition;

			if (diferencia.Length() < 10.0f)
			{
				_pausa = (float)GD.RandRange(
					PausaMin, PausaMax
				);

				Velocity = Velocity.MoveToward(
					Vector2.Zero,
					Friction * dt
				);
			}
			else
			{
				Velocity = Velocity.MoveToward(
					diferencia.Normalized() * Speed,
					Acceleration * dt
				);
			}
		}

		MoveAndSlide();

		// Detectar choque con pared, suelo o techo
		if (_tiempoEscape <= 0.0f &&
			GetSlideCollisionCount() > 0)
		{
			RebotarSuperficie();
		}

		ActualizarAnimacion(dt);
	}

	// ----------------------------------
	// PATRULLA ACUÁTICA
	// ----------------------------------

	private void ElegirDestino()
	{
		_destino = _origen + new Vector2(
			(float)GD.RandRange(
				-RadioHorizontal, RadioHorizontal
			),
			(float)GD.RandRange(
				-RadioVertical, RadioVertical
			)
		);
	}

	// ----------------------------------
	// REBOTE CONTRA SUPERFICIES
	// ----------------------------------

	private void RebotarSuperficie()
	{
		KinematicCollision2D choque = GetSlideCollision(0);

		if (choque == null) return;

		// Normal de la superficie: apunta hacia afuera
		Vector2 normal = choque.GetNormal();

		// Movimiento lateral para evitar quedar atrapado
		Vector2 tangente = new Vector2(
			-normal.Y,
			normal.X
		);

		if (GD.Randf() < 0.5f)
			tangente = -tangente;

		_direccionEscape = (
			normal * 1.5f + tangente * 0.65f
		).Normalized();

		_tiempoEscape = Mathf.Max(
			0.15f, DuracionEscape
		);

		_pausa = 0.0f;
		Velocity = _direccionEscape * Speed;
	}

	// ----------------------------------
	// ANIMACIONES
	// ----------------------------------

	private void ActualizarAnimacion(float dt)
	{
		if (Mathf.Abs(Velocity.X) > 3.0f)
			_sprite.FlipH = Velocity.X < 0;

		float lado = _sprite.FlipH ? -1.0f : 1.0f;

		float inclinacion = Mathf.DegToRad(
			Mathf.Clamp(
				Velocity.Y / Mathf.Max(Speed, 1.0f),
				-1.0f, 1.0f
			) * MaxTiltDegrees
		) * lado;

		_sprite.Rotation = Mathf.LerpAngle(
			_sprite.Rotation,
			inclinacion,
			TiltSpeed * dt
		);

		string baseAnim = Velocity.Length() > 10.0f
			? AnimNado : AnimQuieta;

		string anim = VariablesGlobales.BiomaSaludable
			? baseAnim
			: baseAnim + SufijoEstadoMalo;

		SpriteFrames frames = _sprite.SpriteFrames;

		if (frames == null) return;

		if (!frames.HasAnimation(anim))
			anim = frames.HasAnimation(baseAnim)
				? baseAnim : AnimNado;

		if (frames.HasAnimation(anim) &&
			(_sprite.Animation != anim || !_sprite.IsPlaying()))
		{
			_sprite.Play(anim);
		}
	}

	// ----------------------------------
	// DETECTAR AL JUGADOR
	// ----------------------------------

	private void ComprobarJugador()
	{
		foreach (Node nodo in GetTree().GetNodesInGroup(
			GrupoJugador))
		{
			if (nodo is not Node2D jugador)
				continue;

			// Evitar colisiones físicas con el jugador
			if (jugador is PhysicsBody2D cuerpo &&
				_jugadoresIgnorados.Add(cuerpo.GetInstanceId()))
			{
				AddCollisionExceptionWith(cuerpo);
			}

			if (SoloEnMalEstado &&
				VariablesGlobales.BiomaSaludable)
				continue;

			if (GlobalPosition.DistanceTo(
				jugador.GlobalPosition) <= RadioContacto)
			{
				SoltarComida();
				return;
			}
		}
	}

	// ----------------------------------
	// SOLTAR COMIDA
	// ----------------------------------

	private void SoltarComida()
	{
		if (_comidaSoltada || EscenaComida == null)
		{
			if (EscenaComida == null)
				GD.PushWarning(
					$"{Name}: asigna EscenaComida en el Inspector."
				);
			return;
		}

		_comidaSoltada = true;

		int cantidad = VariablesGlobales.BiomaSaludable
			? CantidadComidaSaludable
			: CantidadComidaMalEstado;

		for (int i = 0; i < Mathf.Max(0, cantidad); i++)
		{
			Node2D comida = EscenaComida.Instantiate<Node2D>();

			GetTree().CurrentScene.AddChild(comida);

			comida.GlobalPosition =
				GlobalPosition + new Vector2(0, -8);

			if (comida is RigidBody2D cuerpo)
			{
				cuerpo.LinearVelocity = new Vector2(
					(float)GD.RandRange(-30.0, 30.0),
					(float)GD.RandRange(-80.0, -40.0)
				);
			}
		}

		QueueFree();
	}
}
