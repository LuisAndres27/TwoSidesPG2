using Godot;

public partial class PlayerMono : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 160f;
	[Export] public float JumpVelocity = -280f;

	[ExportGroup("Vida y daño")]
	[Export] public int MaxHealth = 3;
	[Export] public Vector2 KnockbackFuerza = new(250, -180);
	[Export] public float DuracionPerdidaControl = 0.4f;
	[Export] public float DuracionInvulnerabilidad = 1.5f;

	[ExportGroup("Animaciones")]
	[Export] public string AnimIdle = "idle";
	[Export] public string AnimRun = "run";
	[Export] public string AnimJump = "jump";
	[Export] public string AnimDamage = "damage";
	[Export] public string SufijoEstadoMalo = "_bad";

	public int CurrentHealth { get; private set; }

	private Hurtbox _hurtbox;
	private AnimatedSprite2D _sprite;
	private Estadisticas _stats;
	private double _controlTimer, _invulnTimer;
	private bool _muerto;

	private bool PerdioControl => _controlTimer > 0;
	private bool Invulnerable => _invulnTimer > 0;

	public override void _Ready()
	{
		AddToGroup("jugador");
		CurrentHealth = MaxHealth;

		_sprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		_hurtbox = GetNodeOrNull<Hurtbox>("Hurtbox");

		_stats = GetNodeOrNull<Estadisticas>("Estadisticas")
			?? GetNodeOrNull<Estadisticas>("/root/Estadisticas");

		_stats?.SetSalud(CurrentHealth, MaxHealth);

		if (_hurtbox != null)
			_hurtbox.ReceivedDamage += OnReceivedDamage;

		Reproducir(AnimIdle);
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
		_controlTimer = Mathf.Max(0, (float)(_controlTimer - delta));
		_invulnTimer = Mathf.Max(0, (float)(_invulnTimer - delta));

		Vector2 velocity = Velocity;

		if (!IsOnFloor())
			velocity += GetGravity() * dt;

		if (!PerdioControl)
		{
			if (Input.IsActionJustPressed("jump") && IsOnFloor())
				velocity.Y = JumpVelocity;

			float velocidad = Speed * (_stats?.MultiplicadorVelocidad ?? 1f);
			float direction = Input.GetAxis("left", "right");

			velocity.X = direction != 0
				? direction * velocidad
				: Mathf.MoveToward(velocity.X, 0, Speed);

			if (direction != 0)
				_sprite.FlipH = direction < 0;
		}
		else
		{
			velocity.X = Mathf.MoveToward(velocity.X, 0, Speed * dt);
		}

		Velocity = velocity;
		MoveAndSlide();

		if (!PerdioControl)
		{
			string anim = !IsOnFloor() ? AnimJump
				: Mathf.Abs(Velocity.X) > 1 ? AnimRun : AnimIdle;

			Reproducir(anim);
		}
	}

	private void Reproducir(string nombre)
	{
		var frames = _sprite.SpriteFrames;
		if (frames == null) return;

		string anim = VariablesGlobales.BiomaSaludable
			? nombre : nombre + SufijoEstadoMalo;

		if (!frames.HasAnimation(anim))
			anim = frames.HasAnimation(nombre) ? nombre : AnimIdle;

		if (frames.HasAnimation(anim) &&
			(_sprite.Animation != anim || !_sprite.IsPlaying()))
			_sprite.Play(anim);
	}

	private void OnReceivedDamage(int amount)
	{
		float direccion = _sprite.FlipH ? 1f : -1f;
		AplicarDanio(amount, direccion);
	}

	public void RecibirDanio(int cantidad, Vector2 posicionEnemigo)
	{
		float direccion = GlobalPosition.X >= posicionEnemigo.X ? 1f : -1f;
		AplicarDanio(cantidad, direccion);
	}

	private void AplicarDanio(int cantidad, float direccion)
	{
		if (_muerto || Invulnerable || cantidad <= 0) return;

		CurrentHealth = Mathf.Max(0, CurrentHealth - cantidad);
		_stats?.SetSalud(CurrentHealth, MaxHealth);

		GD.Print($"¡Mono recibió daño! Vida: {CurrentHealth}/{MaxHealth}");

		if (CurrentHealth <= 0)
		{
			Die();
			return;
		}

		_controlTimer = DuracionPerdidaControl;
		_invulnTimer = Mathf.Max(
			DuracionInvulnerabilidad, DuracionPerdidaControl
		);

		Velocity = new Vector2(
			KnockbackFuerza.X * direccion,
			KnockbackFuerza.Y
		);

		Reproducir(AnimDamage);
	}

	// ----------------------------------------
	// MUERTE Y GAME OVER (Adaptado)
	// ----------------------------------------
	private void Die()
	{
		if (_muerto)
			return;

		_muerto = true;

		GD.Print("Mono derrotado.");

		// Detener al jugador
		Velocity = Vector2.Zero;
		SetPhysicsProcess(false);

		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree()
			.GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print("[PlayerMono] Mostrando Game Over.");

			// Mostrar pantalla de derrota
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[PlayerMono] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté " +
				"instanciada en la escena del bioma."
			);
		}
	}
}
