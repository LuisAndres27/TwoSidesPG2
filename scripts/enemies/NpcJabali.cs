using Godot;

public partial class NpcJabali : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 30.0f;              // velocidad al patrullar
	[Export] public float ChaseSpeed = 85.0f;         // velocidad al perseguir (estado malo)
	[Export] public float DetectionRadius = 180.0f;   // rango de visión (estado malo)
	[Export] public float Gravity = 980.0f;
	[Export] public float PausaMin = 0.8f;            // pausas al dar la vuelta
	[Export] public float PausaMax = 2.0f;
	[Export] public float LimiteCaidaY = 2000.0f;     // si cae por debajo, desaparece (0 = desactivado)

	[ExportGroup("Tamaño por estado")]
	[Export] public Vector2 CuerpoBuenEstado = new Vector2(16, 14);  // ancho x alto del cuerpo (jabalí pequeño)
	[Export] public Vector2 CuerpoMalEstado = new Vector2(36, 20);   // ancho x alto del cuerpo (jabalí grande)
	[Export] public bool AlinearSpriteAlSuelo = true;                // apoya el sprite sobre los pies

	[ExportGroup("Animaciones")]
	[Export] public string AnimQuieta = "idle";
	[Export] public string AnimMovimiento = "run";
	[Export] public string SufijoEstadoMalo = "_bad"; // idle_bad, run_bad

	[ExportGroup("Detección de bordes y muros")]
	[Export(PropertyHint.Layers2DPhysics)] public uint MascaraSuelo = 1;
	[Export] public float AlcanceBorde = 20.0f;       // cuánto baja el rayo para encontrar suelo

	[ExportGroup("Comida (solo en buen estado)")]
	[Export] public PackedScene EscenaComida;         // item_comida.tscn
	[Export] public int CantidadComida = 3;
	[Export] public string GrupoJugador = "jugador";
	[Export] public float RadioContacto = 60.0f;      // distancia a la que el jugador "lo alcanza"

	private enum State { Patrol, Idle }
	private State _state = State.Patrol;
	private Vector2 _direction = Vector2.Right;

	private AnimatedSprite2D _animatedSprite;
	private CollisionShape2D _cuerpoShape;
	private CollisionShape2D _hitboxShape;
	private RayCast2D _rayMuro;
	private RayCast2D _rayBorde;
	private Area2D _hitbox;

	private StringName _animQuieta, _animMovimiento;
	private bool _esHostil = false;
	private bool _terminado = false;
	private float _pausa = 0.0f;

	// Valores de los raycasts (se calculan según el tamaño del cuerpo)
	private float _alturaMuro = -8.0f;
	private float _alturaBorde = -6.0f;
	private float _largoMuro = 24.0f;
	private float _distanciaBorde = 22.0f;

	public override void _Ready()
	{
		_animatedSprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		_cuerpoShape = GetNodeOrNull<CollisionShape2D>("CollisionShape2D");
		_hitbox = GetNodeOrNull<Area2D>("Hitbox");
		_hitboxShape = GetNodeOrNull<CollisionShape2D>("Hitbox/CollisionShape2D");

		_rayMuro = GetNodeOrNull<RayCast2D>("RayCast2D") ?? CrearRayo("RayCast2D");
		_rayBorde = GetNodeOrNull<RayCast2D>("RayCast2D2") ?? CrearRayo("RayCast2D2");

		_esHostil = !VariablesGlobales.BiomaSaludable;

		string sufijo = _esHostil ? SufijoEstadoMalo : "";
		_animQuieta = AnimQuieta + sufijo;
		_animMovimiento = AnimMovimiento + sufijo;

		AplicarTamano();

		if (_hitbox != null && !_esHostil)
		{
			// Buen estado: inofensivo
			_hitbox.SetDeferred(Area2D.PropertyName.Monitorable, false);
			_hitbox.ProcessMode = ProcessModeEnum.Disabled;
		}

		_direction = GD.Randf() > 0.5f ? Vector2.Right : Vector2.Left;
		AplicarDireccion();
		ReproducirAnimacion(_animMovimiento);
	}

	// Ajusta cuerpo, hitbox, sprite y raycasts al tamaño del estado actual.
	// El origen del nodo queda en los pies.
	private void AplicarTamano()
	{
		Vector2 tam = _esHostil ? CuerpoMalEstado : CuerpoBuenEstado;
		if (tam.X <= 0 || tam.Y <= 0) return;

		Vector2 centro = new Vector2(0, -tam.Y / 2.0f);

		if (_cuerpoShape != null)
		{
			_cuerpoShape.Shape = new RectangleShape2D { Size = tam };
			_cuerpoShape.Position = centro;
			_cuerpoShape.Disabled = false; // Forza la activación de la colisión por si estaba desactivada en el editor
		}

		if (_hitboxShape != null)
		{
			_hitboxShape.Shape = new RectangleShape2D { Size = tam };
			_hitboxShape.Position = centro;
		}

		// Apoya el sprite sobre los pies (sprite centrado)
		if (AlinearSpriteAlSuelo && _animatedSprite.SpriteFrames != null
			&& _animatedSprite.SpriteFrames.HasAnimation(_animQuieta)
			&& _animatedSprite.SpriteFrames.GetFrameCount(_animQuieta) > 0)
		{
			Texture2D tex = _animatedSprite.SpriteFrames.GetFrameTexture(_animQuieta, 0);
			if (tex != null)
			{
				float alto = tex.GetHeight() * _animatedSprite.Scale.Y;
				_animatedSprite.Position = new Vector2(_animatedSprite.Position.X, -alto / 2.0f);
			}
		}

		// Raycasts adaptados al ancho del cuerpo
		_alturaMuro = -tam.Y / 2.0f;
		_alturaBorde = -4.0f;
		_largoMuro = tam.X / 2.0f + 8.0f;
		_distanciaBorde = tam.X / 2.0f + 4.0f;
	}

	private RayCast2D CrearRayo(string nombre)
	{
		var rayo = new RayCast2D { Name = nombre, Enabled = true, CollisionMask = MascaraSuelo };
		AddChild(rayo);
		return rayo;
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_terminado) return;

		float d = (float)delta;

		if (LimiteCaidaY > 0 && GlobalPosition.Y > LimiteCaidaY)
		{
			QueueFree();
			return;
		}

		Vector2 velocity = Velocity;
		if (!IsOnFloor())
			velocity.Y += Gravity * d;

		Node2D jugador = JugadorMasCercano(out float distancia);

		if (!_esHostil)
		{
			// ----- BUEN ESTADO: pacífico, suelta comida al acercarse el jugador -----
			ActualizarPatrulla(ref velocity, d);

			if (jugador != null && distancia <= RadioContacto)
			{
				SoltarComida();
				return;
			}
		}
		else
		{
			// ----- MAL ESTADO: agresivo, solo patrulla, persigue y daña con su Hitbox -----
			if (jugador != null && distancia <= DetectionRadius)
				ChaseUpdate(ref velocity, jugador);
			else
				ActualizarPatrulla(ref velocity, d);
		}

		Velocity = velocity;
		MoveAndSlide();
	}

	private Node2D JugadorMasCercano(out float distancia)
	{
		Node2D mejor = null;
		distancia = float.MaxValue;

		foreach (Node nodo in GetTree().GetNodesInGroup(GrupoJugador))
		{
			if (nodo is Node2D j)
			{
				float dist = j.GlobalPosition.DistanceTo(GlobalPosition);
				if (dist < distancia)
				{
					distancia = dist;
					mejor = j;
				}
			}
		}
		return mejor;
	}

	// ---------- Patrulla ----------
	private void ActualizarPatrulla(ref Vector2 velocity, float d)
	{
		if (_state == State.Idle)
		{
			velocity.X = 0;
			_pausa -= d;
			if (_pausa <= 0)
			{
				_state = State.Patrol;
				ReproducirAnimacion(_animMovimiento);
			}
			return;
		}

		_rayMuro.ForceRaycastUpdate();
		_rayBorde.ForceRaycastUpdate();

		bool hayMuro = _rayMuro.IsColliding() || IsOnWall();
		bool faltaSuelo = IsOnFloor() && !_rayBorde.IsColliding();

		if (hayMuro || faltaSuelo)
		{
			FlipDirection();
			_pausa = (float)GD.RandRange(PausaMin, PausaMax);
			_state = State.Idle;
			velocity.X = 0;
			ReproducirAnimacion(_animQuieta);
			return;
		}

		velocity.X = _direction.X * Speed;
		ReproducirAnimacion(_animMovimiento);
	}

	// ---------- Persecución ----------
	private void ChaseUpdate(ref Vector2 velocity, Node2D jugador)
	{
		float dir = jugador.GlobalPosition.X - GlobalPosition.X > 0 ? 1 : -1;
		if (dir != _direction.X)
		{
			_direction.X = dir;
			AplicarDireccion();
		}

		_rayMuro.ForceRaycastUpdate();
		_rayBorde.ForceRaycastUpdate();

		bool hayMuro = _rayMuro.IsColliding() || IsOnWall();
		bool faltaSuelo = IsOnFloor() && !_rayBorde.IsColliding();

		// No cae por bordes ni choca contra muros mientras persigue
		if (hayMuro || faltaSuelo)
		{
			velocity.X = 0;
			ReproducirAnimacion(_animQuieta);
		}
		else
		{
			velocity.X = _direction.X * ChaseSpeed;
			ReproducirAnimacion(_animMovimiento);
		}
	}

	private void FlipDirection()
	{
		_direction.X *= -1;
		AplicarDireccion();
	}

	private void AplicarDireccion()
	{
		float lado = _direction.X;
		_animatedSprite.FlipH = lado < 0;

		_rayMuro.Position = new Vector2(0, _alturaMuro);
		_rayMuro.TargetPosition = new Vector2(_largoMuro * lado, 0);

		_rayBorde.Position = new Vector2(_distanciaBorde * lado, _alturaBorde);
		_rayBorde.TargetPosition = new Vector2(0, AlcanceBorde);
	}

	private void ReproducirAnimacion(StringName nombre)
	{
		if (_animatedSprite.SpriteFrames == null || !_animatedSprite.SpriteFrames.HasAnimation(nombre))
			return;

		if (_animatedSprite.Animation != nombre || !_animatedSprite.IsPlaying())
			_animatedSprite.Play(nombre);
	}

	// ---------- Comida (solo buen estado) ----------
	private void SoltarComida()
	{
		if (_terminado) return;
		_terminado = true;

		if (EscenaComida == null)
		{
			GD.PushWarning($"{Name}: falta asignar EscenaComida en el Inspector. No soltará nada.");
		}
		else
		{
			Node escena = GetTree().CurrentScene;
			for (int i = 0; i < CantidadComida; i++)
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
			GD.Print($"{Name}: soltó {CantidadComida} de comida.");
		}

		QueueFree();
	}
}
