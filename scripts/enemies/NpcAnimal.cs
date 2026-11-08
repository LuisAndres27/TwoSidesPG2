using Godot;

public partial class NpcAnimal : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 40.0f;
	[Export] public float ChaseSpeed = 90.0f;
	[Export] public float DetectionRadius = 200.0f;
	[Export] public float Gravity = 980.0f;
	[Export] public string GrupoJugador = "jugador";
	[Export] public bool EsMarino = false;

	[ExportGroup("Movimiento marino")]
	[Export] public float AceleracionMarina = 500.0f;
	[Export] public float FriccionMarina = 250.0f;
	[Export] public float MaxTiltDegrees = 25.0f;
	[Export] public float TiltSpeed = 8.0f;
	[Export] public float RadioPatrullaHorizontal = 150.0f;
	[Export] public float RadioPatrullaVertical = 75.0f;

	[ExportGroup("Comportamiento")]
	[Export] public bool AtacarEnBuenEstado = false;
	[Export] public bool AtacarEnMalEstado = true;
	[Export] public bool SoloAparecerEnMalEstado = false;

	[ExportGroup("Daño")]
	[Export] public int Danio = 1;

	[ExportGroup("Animaciones")]
	[Export] public string AnimQuieta = "idle";
	[Export] public string AnimMovimiento = "run";
	[Export] public string SufijoEstadoMalo = "_bad";

	[ExportGroup("Pausas")]
	[Export] public float TiempoMinimoQuieto = 1.5f;
	[Export] public float TiempoMaximoQuieto = 3.0f;
	[Export] public float TiempoEntrePausas = 4.0f;
	[Export] public float TiempoSinPerseguir = 1.5f;

	[ExportGroup("Raycasts terrestres")]
	[Export(PropertyHint.Layers2DPhysics)] public uint MascaraSuelo = 1;
	[Export] public float DistanciaRayoMuro = 20.0f;
	[Export] public float DistanciaRayoBorde = 20.0f;

	private enum State { Patrol, Idle, Chase }
	private State _currentState = State.Patrol;
	private Vector2 _direction = Vector2.Right;

	private AnimatedSprite2D _sprite;
	private RayCast2D _rayCastMuro;
	private RayCast2D _rayCastBorde;
	private Area2D _hitbox;
	private Node2D _player;

	private bool _esHostil;
	private bool _estadoAnterior;
	private bool _ocultoPorBioma;
	private StringName _animQuieta, _animMovimiento;
	private double _temporizadorQuieto, _temporizadorPatrulla, _temporizadorSinPerseguir;
	private readonly RandomNumberGenerator _rng = new();
	private uint _hitboxLayer, _hitboxMask, _capaOriginal, _mascaraOriginal;

	private Vector2 _centroPatrullaMarina, _destinoMarino;
	private bool _tieneDestinoMarino;

	public override void _Ready()
	{
		_rng.Randomize();
		_capaOriginal = CollisionLayer;
		_mascaraOriginal = CollisionMask;
		_sprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		_hitbox = GetNodeOrNull<Area2D>("Hitbox");
		_centroPatrullaMarina = GlobalPosition;

		// El movimiento marino usa las físicas flotantes del delfín.
		MotionMode = EsMarino ? MotionModeEnum.Floating : MotionModeEnum.Grounded;

		// Los rayos solo se utilizan en tierra.
		if (!EsMarino)
		{
			_rayCastMuro = GetNodeOrNull<RayCast2D>("RayCast2D") ?? CrearRayoMuro();
			_rayCastBorde = GetNodeOrNull<RayCast2D>("RayCast2D2") ?? CrearRayoBorde();
			_rayCastMuro.Enabled = true;
			_rayCastBorde.Enabled = true;
			ActualizarRaycasts();
		}

		_estadoAnterior = VariablesGlobales.BiomaSaludable;
		_esHostil = DebeAtacar();

		if (_hitbox != null)
		{
			_hitboxLayer = _hitbox.CollisionLayer;
			_hitboxMask = _hitbox.CollisionMask;
			_hitbox.BodyEntered += OnHitboxBodyEntered;
		}

		ElegirAnimaciones();
		ConfigurarHitbox(_esHostil);
		_temporizadorPatrulla = TiempoEntrePausas;
		Reproducir(_animQuieta);
		ActualizarVisibilidad();
	}

	public override void _ExitTree()
	{
		if (_hitbox != null)
			_hitbox.BodyEntered -= OnHitboxBodyEntered;
	}

	private bool DebeAtacar() => VariablesGlobales.BiomaSaludable
		? AtacarEnBuenEstado : AtacarEnMalEstado;

	private void ActualizarComportamiento()
	{
		bool saludable = VariablesGlobales.BiomaSaludable;
		if (_estadoAnterior != saludable)
		{
			_estadoAnterior = saludable;
			ElegirAnimaciones();
		}

		bool hostilAhora = DebeAtacar();
		if (_esHostil != hostilAhora)
		{
			_esHostil = hostilAhora;
			ConfigurarHitbox(_esHostil && !_ocultoPorBioma);
			_temporizadorSinPerseguir = 0;
		}
	}

	private void ActualizarVisibilidad()
	{
		bool ocultar = SoloAparecerEnMalEstado && VariablesGlobales.BiomaSaludable;
		if (_ocultoPorBioma == ocultar) return;

		_ocultoPorBioma = ocultar;
		Visible = !ocultar;
		CollisionLayer = ocultar ? 0u : _capaOriginal;
		CollisionMask = ocultar ? 0u : _mascaraOriginal;
		ConfigurarHitbox(!ocultar && _esHostil);

		if (ocultar)
		{
			Velocity = Vector2.Zero;
			_player = null;
			_currentState = State.Idle;
			_tieneDestinoMarino = false;
		}
	}

	private void OnHitboxBodyEntered(Node2D body)
	{
		if (!_esHostil || _ocultoPorBioma) return;

		// Mantiene el daño directo al mono del código original.
		// Los demás jugadores pueden usar el sistema Hitbox/Hurtbox.
		if (body is PlayerMono jugador)
			jugador.RecibirDanio(Danio, GlobalPosition);
	}

	private void ConfigurarHitbox(bool activo)
	{
		if (_hitbox == null) return;

		_hitbox.CollisionLayer = activo ? _hitboxLayer : 0u;
		_hitbox.CollisionMask = activo ? _hitboxMask : 0u;
		_hitbox.SetDeferred(Area2D.PropertyName.Monitoring, activo);
		_hitbox.SetDeferred(Area2D.PropertyName.Monitorable, activo);

		foreach (Node hijo in _hitbox.GetChildren())
		{
			if (hijo is CollisionShape2D forma)
				forma.SetDeferred(CollisionShape2D.PropertyName.Disabled, !activo);
			else if (hijo is CollisionPolygon2D poligono)
				poligono.SetDeferred(CollisionPolygon2D.PropertyName.Disabled, !activo);
		}
	}

	private void ElegirAnimaciones()
	{
		var frames = _sprite.SpriteFrames;
		string sufijo = VariablesGlobales.BiomaSaludable ? "" : SufijoEstadoMalo;
		_animQuieta = ResolverAnimacion(frames, AnimQuieta, sufijo);
		_animMovimiento = ResolverAnimacion(frames, AnimMovimiento, sufijo);
	}

	private StringName ResolverAnimacion(SpriteFrames frames, string nombreBase, string sufijo)
	{
		if (frames != null && frames.HasAnimation(nombreBase + sufijo))
			return nombreBase + sufijo;
		if (frames != null && frames.HasAnimation(nombreBase))
			return nombreBase;
		GD.PushWarning($"{Name}: falta animación '{nombreBase + sufijo}'");
		return nombreBase;
	}

	private void Reproducir(StringName animacion)
	{
		var frames = _sprite.SpriteFrames;
		if (frames == null || !frames.HasAnimation(animacion)) return;
		if (_sprite.Animation != animacion || !_sprite.IsPlaying())
			_sprite.Play(animacion);
	}

	private RayCast2D CrearRayoMuro()
	{
		RayCast2D rayo = new()
		{
			Name = "RayCast2D", Enabled = true, CollisionMask = MascaraSuelo,
			Position = new Vector2(0, -8),
			TargetPosition = new Vector2(DistanciaRayoMuro, 0)
		};
		AddChild(rayo);
		return rayo;
	}

	private RayCast2D CrearRayoBorde()
	{
		RayCast2D rayo = new()
		{
			Name = "RayCast2D2", Enabled = true, CollisionMask = MascaraSuelo,
			Position = new Vector2(14, -4),
			TargetPosition = new Vector2(0, DistanciaRayoBorde)
		};
		AddChild(rayo);
		return rayo;
	}

	private void ActualizarRaycasts()
	{
		_rayCastMuro.TargetPosition = new Vector2(DistanciaRayoMuro * _direction.X, 0);
		_rayCastBorde.Position = new Vector2(
			Mathf.Abs(_rayCastBorde.Position.X) * _direction.X,
			_rayCastBorde.Position.Y);
		_rayCastMuro.ForceRaycastUpdate();
		_rayCastBorde.ForceRaycastUpdate();
	}

	private void FlipDirection()
	{
		_direction.X *= -1;
		_sprite.FlipH = _direction.X < 0;
		ActualizarRaycasts();
	}

	public override void _PhysicsProcess(double delta)
	{
		ActualizarVisibilidad();
		ActualizarComportamiento();
		if (_ocultoPorBioma) return;

		if (_temporizadorSinPerseguir > 0)
			_temporizadorSinPerseguir -= delta;

		_player = null;
		if (_esHostil && _temporizadorSinPerseguir <= 0)
		{
			Node2D candidato = JugadorMasCercano(out float distancia);
			if (candidato != null && distancia <= DetectionRadius)
				_player = candidato;
		}

		if (_player != null)
		{
			_currentState = State.Chase;
			_temporizadorQuieto = 0;
			_tieneDestinoMarino = false;
		}
		else if (_temporizadorQuieto > 0)
		{
			_temporizadorQuieto -= delta;
			_currentState = State.Idle;
		}
		else
		{
			_temporizadorPatrulla -= delta;
			if (_temporizadorPatrulla <= 0)
			{
				_temporizadorQuieto = _rng.RandfRange(
					Mathf.Min(TiempoMinimoQuieto, TiempoMaximoQuieto),
					Mathf.Max(TiempoMinimoQuieto, TiempoMaximoQuieto));
				_temporizadorPatrulla = TiempoEntrePausas;
				_currentState = State.Idle;
			}
			else
			{
				_currentState = State.Patrol;
			}
		}

		if (EsMarino)
			ActualizarMovimientoMarino((float)delta);
		else
			ActualizarMovimientoTerrestre((float)delta);

		MoveAndSlide();

		if (EsMarino)
		{
			// Inclinación equivalente a PlayerDelfin.cs.
			float lado = _sprite.FlipH ? -1f : 1f;
			float velocidadBase = Mathf.Max(1f, Speed);
			float inclinacion = Mathf.DegToRad(
				Mathf.Clamp(Velocity.Y / velocidadBase, -1f, 1f) * MaxTiltDegrees) * lado;
			_sprite.Rotation = Mathf.LerpAngle(
				_sprite.Rotation, inclinacion, TiltSpeed * (float)delta);

			// Si choca durante la patrulla, selecciona otro punto.
			if (_currentState == State.Patrol && GetSlideCollisionCount() > 0)
				_tieneDestinoMarino = false;
		}

		bool enMovimiento = EsMarino ? Velocity.Length() > 10f : Mathf.Abs(Velocity.X) > 1f;
		Reproducir(enMovimiento ? _animMovimiento : _animQuieta);
	}

	private void ActualizarMovimientoTerrestre(float dt)
	{
		Vector2 velocidad = Velocity;
		if (!IsOnFloor()) velocidad.Y += Gravity * dt;

		switch (_currentState)
		{
			case State.Patrol: PatrolUpdate(ref velocidad); break;
			case State.Chase: ChaseUpdate(ref velocidad); break;
			case State.Idle: velocidad.X = 0; break;
		}
		Velocity = velocidad;
	}

	private void ActualizarMovimientoMarino(float dt)
	{
		Vector2 direccion = Vector2.Zero;

		if (_currentState == State.Chase && _player != null)
		{
			Vector2 diferencia = _player.GlobalPosition - GlobalPosition;
			if (diferencia.Length() > 10f)
				direccion = diferencia.Normalized();
		}
		else if (_currentState == State.Patrol)
		{
			if (!_tieneDestinoMarino)
			{
				_destinoMarino = _centroPatrullaMarina + new Vector2(
					_rng.RandfRange(-RadioPatrullaHorizontal, RadioPatrullaHorizontal),
					_rng.RandfRange(-RadioPatrullaVertical, RadioPatrullaVertical));
				_tieneDestinoMarino = true;
			}

			Vector2 diferencia = _destinoMarino - GlobalPosition;
			if (diferencia.Length() > 10f)
				direccion = diferencia.Normalized();
			else
			{
				_tieneDestinoMarino = false;
				_temporizadorQuieto = _rng.RandfRange(
					Mathf.Min(TiempoMinimoQuieto, TiempoMaximoQuieto),
					Mathf.Max(TiempoMinimoQuieto, TiempoMaximoQuieto));
			}
		}

		if (Mathf.Abs(direccion.X) > 0.05f)
			_sprite.FlipH = direccion.X < 0;

		float velocidadMax = _currentState == State.Chase ? ChaseSpeed : Speed;
		Velocity = direccion != Vector2.Zero
			? Velocity.MoveToward(direccion * velocidadMax, AceleracionMarina * dt)
			: Velocity.MoveToward(Vector2.Zero, FriccionMarina * dt);
	}

	private Node2D JugadorMasCercano(out float distancia)
	{
		Node2D mejor = null;
		distancia = float.MaxValue;
		foreach (Node nodo in GetTree().GetNodesInGroup(GrupoJugador))
		{
			if (nodo is Node2D jugador)
			{
				float dist = jugador.GlobalPosition.DistanceTo(GlobalPosition);
				if (dist < distancia) { distancia = dist; mejor = jugador; }
			}
		}
		return mejor;
	}

	private void PatrolUpdate(ref Vector2 velocidad)
	{
		ActualizarRaycasts();
		if (_rayCastMuro.IsColliding() || !_rayCastBorde.IsColliding())
		{
			FlipDirection();
			if (_rayCastMuro.IsColliding() || !_rayCastBorde.IsColliding())
			{
				velocidad.X = 0;
				_temporizadorQuieto = 0.5f;
				return;
			}
		}
		velocidad.X = _direction.X * Speed;
	}

	private void ChaseUpdate(ref Vector2 velocidad)
	{
		if (_player == null) { velocidad.X = 0; return; }
		float distanciaX = _player.GlobalPosition.X - GlobalPosition.X;
		if (Mathf.Abs(distanciaX) <= 8f) { velocidad.X = 0; return; }

		_direction.X = distanciaX > 0 ? 1 : -1;
		_sprite.FlipH = _direction.X < 0;
		ActualizarRaycasts();

		if (_rayCastMuro.IsColliding() || !_rayCastBorde.IsColliding())
		{
			velocidad.X = 0;
			_temporizadorSinPerseguir = TiempoSinPerseguir;
			_temporizadorQuieto = 0.5f;
			_currentState = State.Idle;
			return;
		}
		velocidad.X = _direction.X * ChaseSpeed;
	}
}
