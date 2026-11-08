using Godot;

public partial class PlayerRataCanguro : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 150.0f;
	[Export] public float JumpVelocity = -360.0f;

	[ExportGroup("Vida y daño")]
	[Export] public int MaxHealth = 3;
	[Export] public Vector2 KnockbackFuerza = new(220, -250);
	[Export] public float DuracionPerdidaControl = 0.4f;
	[Export] public float DuracionInvulnerabilidad = 1.5f;

	[ExportGroup("Animaciones")]
	[Export] public string SufijoEstadoMalo = "_bad";

	public int CurrentHealth { get; private set; }

	private Hurtbox _hurtbox;
	private AnimatedSprite2D _animatedSprite;
	private Estadisticas _stats;

	private double _controlTimer = 0;
	private double _invulnTimer = 0;
	private bool _muerto = false;

	private bool PerdioControl => _controlTimer > 0;
	private bool Invulnerable => _invulnTimer > 0;

	public override void _Ready()
	{
		AddToGroup("jugador");

		CurrentHealth = MaxHealth;

		_animatedSprite = GetNode<AnimatedSprite2D>(
			"AnimatedSprite2D"
		);

		_hurtbox = GetNode<Hurtbox>("Hurtbox");
		_hurtbox.ReceivedDamage += OnReceivedDamage;

		// Buscar estadísticas
		_stats = GetNodeOrNull<Estadisticas>("Estadisticas")
			?? GetNodeOrNull<Estadisticas>("/root/Estadisticas");

		if (_stats == null)
			GD.PushWarning("No se encontró Estadisticas.");

		_stats?.SetSalud(CurrentHealth, MaxHealth);
	}

	public override void _ExitTree()
	{
		if (_hurtbox != null)
			_hurtbox.ReceivedDamage -= OnReceivedDamage;
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_muerto) return;

		float dt = (float)delta;

		// Temporizadores
		if (_controlTimer > 0)
			_controlTimer -= delta;

		if (_invulnTimer > 0)
			_invulnTimer -= delta;

		Vector2 velocity = Velocity;

		// Gravedad
		if (!IsOnFloor())
			velocity += GetGravity() * dt;

		if (!PerdioControl)
		{
			// Salto
			if (Input.IsActionJustPressed("jump") && IsOnFloor())
				velocity.Y = JumpVelocity;

			// Movimiento horizontal
			float direction = Input.GetAxis("left", "right");

			float velocidadMax = Speed *
				(_stats?.MultiplicadorVelocidad ?? 1.0f);

			velocity.X = direction != 0
				? direction * velocidadMax
				: Mathf.MoveToward(velocity.X, 0, Speed);

			if (direction != 0)
				_animatedSprite.FlipH = direction < 0;
		}
		else
		{
			// Desacelerar durante el retroceso
			velocity.X = Mathf.MoveToward(
				velocity.X, 0, Speed * dt
			);
		}

		Velocity = velocity;
		MoveAndSlide();

		if (!PerdioControl)
		{
			float direction = Input.GetAxis("left", "right");
			UpdateAnimations(direction);
		}
	}

	// ----------------------------------------
	// ANIMACIONES
	// ----------------------------------------

	private void UpdateAnimations(float direction)
	{
		string animacion = !IsOnFloor() ? "jump"
			: direction != 0 ? "run" : "idle";

		Reproducir(animacion);
	}

	private void Reproducir(string nombre)
	{
		var frames = _animatedSprite.SpriteFrames;
		if (frames == null) return;

		string animacion = VariablesGlobales.BiomaSaludable
			? nombre : nombre + SufijoEstadoMalo;

		if (!frames.HasAnimation(animacion))
			animacion = nombre;

		if (frames.HasAnimation(animacion) &&
			(_animatedSprite.Animation != animacion ||
			 !_animatedSprite.IsPlaying()))
		{
			_animatedSprite.Play(animacion);
		}
	}

	// ----------------------------------------
	// RECIBIR DAÑO
	// ----------------------------------------

	private void OnReceivedDamage(int amount)
	{
		if (_muerto || Invulnerable || amount <= 0)
			return;

		CurrentHealth = Mathf.Max(0, CurrentHealth - amount);

		// Actualizar corazones
		_stats?.SetSalud(CurrentHealth, MaxHealth);

		GD.Print(
			$"¡Rata canguro recibió impacto! " +
			$"Vida actual: {CurrentHealth}/{MaxHealth}"
		);

		if (CurrentHealth <= 0)
		{
			Die();
			return;
		}

		// Bloquear controles
		_controlTimer = DuracionPerdidaControl;

		// Evitar daño continuo
		_invulnTimer = Mathf.Max(
			DuracionInvulnerabilidad,
			DuracionPerdidaControl
		);

		// Animación de daño
		Reproducir("damage");

		// Empujar en dirección contraria a donde mira
		float direccionEmpuje =
			_animatedSprite.FlipH ? 1.0f : -1.0f;

		Velocity = new Vector2(
			KnockbackFuerza.X * direccionEmpuje,
			KnockbackFuerza.Y
		);
	}

	// ----------------------------------------
	// MUERTE Y GAME OVER (Adaptado del Delfín)
	// ----------------------------------------

	private void Die()
	{
		if (_muerto)
			return;

		_muerto = true;

		GD.Print("Rata canguro derrotada.");

		// Detener al jugador
		Velocity = Vector2.Zero;
		SetPhysicsProcess(false);

		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree()
			.GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print(
				"[PlayerRataCanguro] Mostrando Game Over."
			);

			// Mostrar pantalla de derrota
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[PlayerRataCanguro] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté " +
				"instanciada en la escena del bioma."
			);
		}
	}
}
