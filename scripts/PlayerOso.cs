using Godot;

public partial class PlayerOso : CharacterBody2D
{
	[Export] public float Speed = 150.0f;
	[Export] public float JumpVelocity = -300.0f;
	[Export] public int MaxHealth = 3;

	// X = distancia, Y = altura del empuje
	[Export] public Vector2 KnockbackFuerza = new Vector2(200.0f, -250.0f);
	[Export] public float DuracionPerdidaControl = 0.4f;
	[Export] public float DuracionInvulnerabilidad = 1.5f; // total, incluye la pérdida de control

	public int CurrentHealth { get; private set; }

	private Hurtbox _hurtbox;
	private AnimatedSprite2D _animatedSprite;
	private Estadisticas _stats;

	// Nombres de animación cacheados (se calculan una sola vez)
	private StringName _animIdle, _animRun, _animJump, _animDamage;

	private double _controlTimer = 0;
	private double _invulnTimer = 0;
	private bool _muerto = false;

	private bool PerdioControl => _controlTimer > 0;
	private bool Invulnerable => _invulnTimer > 0;

	public override void _Ready()
	{
		CurrentHealth = MaxHealth;
		_hurtbox = GetNode<Hurtbox>("Hurtbox");
		_animatedSprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		_stats = GetNodeOrNull<Estadisticas>("Estadisticas");
		_stats?.SetSalud(CurrentHealth, MaxHealth);

		string sufijo = VariablesGlobales.BiomaSaludable ? "" : "_bad";
		_animIdle = "idle" + sufijo;
		_animRun = "run" + sufijo;
		_animJump = "jump" + sufijo;
		_animDamage = "damage" + sufijo;

		_hurtbox.ReceivedDamage += OnReceivedDamage;
	}

	public override void _ExitTree()
	{
		if (_hurtbox != null)
			_hurtbox.ReceivedDamage -= OnReceivedDamage;
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_muerto)
			return;

		// Actualizar temporizadores
		if (_controlTimer > 0) _controlTimer -= delta;
		if (_invulnTimer > 0) _invulnTimer -= delta;

		Vector2 velocity = Velocity;

		// Gravedad
		if (!IsOnFloor())
			velocity += GetGravity() * (float)delta;

		if (!PerdioControl)
		{
			if (Input.IsActionJustPressed("jump") && IsOnFloor())
				velocity.Y = JumpVelocity;

			// La velocidad baja si falta agua, comida o salud
			float velocidadMax = Speed * (_stats?.MultiplicadorVelocidad ?? 1.0f);

			float direction = Input.GetAxis("left", "right");
			velocity.X = direction != 0
				? direction * velocidadMax
				: Mathf.MoveToward(velocity.X, 0, Speed);

			UpdateAnimations(direction);
		}
		else
		{
			// Fricción mientras es empujado
			velocity.X = Mathf.MoveToward(velocity.X, 0, Speed * (float)delta);
		}

		Velocity = velocity;
		MoveAndSlide();
	}

	private void UpdateAnimations(float direction)
	{
		if (direction != 0)
			_animatedSprite.FlipH = direction < 0;

		StringName anim = !IsOnFloor() ? _animJump
						: direction != 0 ? _animRun
						: _animIdle;

		if (_animatedSprite.Animation != anim)
			_animatedSprite.Play(anim);
	}

	private void OnReceivedDamage(int amount)
	{
		if (_muerto || Invulnerable) return;

		CurrentHealth -= amount;
		_stats?.SetSalud(Mathf.Max(CurrentHealth, 0), MaxHealth);
		GD.Print($"¡Jugador recibió impacto! Vida actual: {CurrentHealth}/{MaxHealth}");

		if (CurrentHealth <= 0)
		{
			Die();
			return;
		}

		_controlTimer = DuracionPerdidaControl;
		_invulnTimer = DuracionInvulnerabilidad;

		_animatedSprite.Play(_animDamage);

		// Empuje hacia el lado contrario al que mira
		float direccionEmpuje = _animatedSprite.FlipH ? 1.0f : -1.0f;
		Velocity = new Vector2(KnockbackFuerza.X * direccionEmpuje, KnockbackFuerza.Y);
	}

	// ----------------------------------------
	// MUERTE Y GAME OVER (Adaptado)
	// ----------------------------------------
	private void Die()
	{
		if (_muerto)
			return;

		_muerto = true;

		GD.Print("Jugador derrotado.");
		
		// Detener al jugador
		Velocity = Vector2.Zero;
		SetPhysicsProcess(false); // evita seguir procesando

		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree()
			.GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print("[PlayerOso] Mostrando Game Over.");

			// Mostrar pantalla de derrota
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[PlayerOso] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté " +
				"instanciada en la escena del bioma."
			);
		}
	}
}
