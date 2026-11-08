using Godot;

public partial class NpcFoca : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 25.0f;
	[Export] public float Gravity = 980.0f;
	[Export] public float PausaMin = 0.8f;            // pausas al dar la vuelta
	[Export] public float PausaMax = 2.0f;
	[Export] public float LimiteCaidaY = 2000.0f;     // si cae por debajo de esta altura, desaparece (0 = desactivado)

	[ExportGroup("Animaciones")]
	[Export] public StringName AnimQuieta = "idle";
	[Export] public StringName AnimMovimiento = "run";

	[ExportGroup("Detección de bordes y muros")]
	[Export(PropertyHint.Layers2DPhysics)] public uint MascaraSuelo = 1;  // capa(s) del suelo
	[Export] public float AlturaRayos = -8.0f;        // altura de los rayos respecto a los pies
	[Export] public float LargoMuro = 24.0f;          // qué tan adelante busca paredes
	[Export] public float DistanciaBorde = 22.0f;     // qué tan adelante mira el suelo
	[Export] public float AlcanceBorde = 20.0f;       // cuánto baja el rayo para encontrar suelo

	[ExportGroup("Comida")]
	[Export] public PackedScene EscenaComida;         // item_comida.tscn
	// NUEVAS VARIABLES: cantidad según el bioma
	[Export] public int CantidadComidaSaludable = 3;  
	[Export] public int CantidadComidaMalEstado = 1;  
	[Export] public string GrupoJugador = "jugador";
	[Export] public float RadioContacto = 60.0f;      // distancia a la que el oso la alcanza
	[Export] public bool SoloEnMalEstado = false;     // true = solo suelta comida en el nivel malo

	private enum State { Patrol, Idle }
	private State _currentState = State.Patrol;
	private Vector2 _direction = Vector2.Right;

	private AnimatedSprite2D _animatedSprite;
	private RayCast2D _rayMuro;
	private RayCast2D _rayBorde;

	private float _pausa = 0.0f;
	private bool _comida = false;

	public override void _Ready()
	{
		_animatedSprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");

		// Usa los RayCast2D de la escena si existen; si no, los crea
		_rayMuro = GetNodeOrNull<RayCast2D>("RayCast2D") ?? CrearRayo("RayCast2D");
		_rayBorde = GetNodeOrNull<RayCast2D>("RayCast2D2") ?? CrearRayo("RayCast2D2");

		_direction = GD.Randf() > 0.5f ? Vector2.Right : Vector2.Left;
		AplicarDireccion();
		ReproducirAnimacion(AnimMovimiento);
	}

	private RayCast2D CrearRayo(string nombre)
	{
		var rayo = new RayCast2D
		{
			Name = nombre,
			Enabled = true,
			CollisionMask = MascaraSuelo
		};
		AddChild(rayo);
		return rayo;
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_comida) return;

		float d = (float)delta;

		// Seguridad: si cae fuera del mapa, desaparece
		if (LimiteCaidaY > 0 && GlobalPosition.Y > LimiteCaidaY)
		{
			QueueFree();
			return;
		}

		Vector2 velocity = Velocity;

		if (!IsOnFloor())
			velocity.Y += Gravity * d;

		switch (_currentState)
		{
			case State.Patrol:
				PatrolUpdate(ref velocity);
				break;
			case State.Idle:
				IdleUpdate(ref velocity, d);
				break;
		}

		Velocity = velocity;
		MoveAndSlide();

		ComprobarJugador();
	}

	private void PatrolUpdate(ref Vector2 velocity)
	{
		_rayMuro.ForceRaycastUpdate();
		_rayBorde.ForceRaycastUpdate();

		bool hayMuro = _rayMuro.IsColliding() || IsOnWall();
		bool faltaSuelo = IsOnFloor() && !_rayBorde.IsColliding();

		if (hayMuro || faltaSuelo)
		{
			FlipDirection();
			_pausa = (float)GD.RandRange(PausaMin, PausaMax);
			_currentState = State.Idle;
			velocity.X = 0;
			ReproducirAnimacion(AnimQuieta);
			return;
		}

		velocity.X = _direction.X * Speed;
		ReproducirAnimacion(AnimMovimiento);
	}

	private void IdleUpdate(ref Vector2 velocity, float delta)
	{
		velocity.X = 0;
		_pausa -= delta;

		if (_pausa <= 0)
		{
			_currentState = State.Patrol;
			ReproducirAnimacion(AnimMovimiento);
		}
	}

	private void FlipDirection()
	{
		_direction.X *= -1;
		AplicarDireccion();
	}

	// Orienta el sprite y los raycasts hacia donde camina
	private void AplicarDireccion()
	{
		float lado = _direction.X;
		_animatedSprite.FlipH = lado < 0;

		_rayMuro.Position = new Vector2(0, AlturaRayos);
		_rayMuro.TargetPosition = new Vector2(LargoMuro * lado, 0);

		_rayBorde.Position = new Vector2(DistanciaBorde * lado, AlturaRayos);
		_rayBorde.TargetPosition = new Vector2(0, AlcanceBorde);
	}

	private void ReproducirAnimacion(StringName nombre)
	{
		if (_animatedSprite.SpriteFrames == null || !_animatedSprite.SpriteFrames.HasAnimation(nombre))
			return;

		if (_animatedSprite.Animation != nombre || !_animatedSprite.IsPlaying())
			_animatedSprite.Play(nombre);
	}

	private void ComprobarJugador()
	{
		if (SoloEnMalEstado && VariablesGlobales.BiomaSaludable) return;

		foreach (Node nodo in GetTree().GetNodesInGroup(GrupoJugador))
		{
			if (nodo is Node2D jugador && jugador.GlobalPosition.DistanceTo(GlobalPosition) <= RadioContacto)
			{
				SoltarComida();
				return;
			}
		}
	}

	private void SoltarComida()
	{
		if (_comida) return;
		_comida = true;

		if (EscenaComida == null)
		{
			GD.PushWarning($"{Name}: falta asignar EscenaComida en el Inspector. No soltará nada.");
		}
		else
		{
			Node escena = GetTree().CurrentScene;
			
			// Lógica para elegir la cantidad según el estado del bioma
			int cantidadActual = VariablesGlobales.BiomaSaludable ? CantidadComidaSaludable : CantidadComidaMalEstado;

			for (int i = 0; i < cantidadActual; i++)
			{
				var comida = EscenaComida.Instantiate<Node2D>();
				escena.AddChild(comida);
				comida.GlobalPosition = GlobalPosition + new Vector2(0, -8);

				if (comida is RigidBody2D cuerpo)
				{
					float x = (float)GD.RandRange(-30.0, 30.0);
					float y = (float)GD.RandRange(-80.0, -40.0);
					cuerpo.LinearVelocity = new Vector2(x, y);
				}
			}
			GD.Print($"{Name}: soltó {cantidadActual} de comida (Bioma Sano: {VariablesGlobales.BiomaSaludable}).");
		}

		QueueFree();
	}
}
