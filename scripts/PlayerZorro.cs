using Godot;

public partial class PlayerZorro : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 150.0f;
	[Export] public float JumpVelocity = -300.0f;

	[ExportGroup("Vida y daño")]
	[Export] public int MaxHealth = 3;
	// X = distancia, Y = altura del empuje
	[Export] public Vector2 KnockbackFuerza = new Vector2(200.0f, -250.0f);
	[Export] public float DuracionPerdidaControl = 0.4f;
	[Export] public float DuracionInvulnerabilidad = 1.5f; // total, incluye la pérdida de control

	[ExportGroup("Animaciones")]
	[Export] public string AnimIdle = "idle";
	[Export] public string AnimRun = "run";
	[Export] public string AnimJump = "jump";
	[Export] public string AnimDamage = "damage";
	[Export] public string SufijoEstadoMalo = "_bad"; // se añade al nombre en el nivel degradado

	[ExportGroup("Grupo")]
	[Export] public string GrupoJugador = "jugador";  // lo usan fuentes, recursos y NPC para detectarlo

	public int CurrentHealth { get; private set; }

	private Hurtbox _hurtbox;
	private AnimatedSprite2D _animatedSprite;
	private Estadisticas _stats;

	// Nombres de animación finales (se calculan una sola vez)
	private StringName _animIdle, _animRun, _animJump, _animDamage;

	private double _controlTimer = 0;
	private double _invulnTimer = 0;

	private bool PerdioControl => _controlTimer > 0;
	private bool Invulnerable => _invulnTimer > 0;
	
	// Variable añadida para el sistema de Game Over
	private bool _muerto = false;

	public override void _Ready()
	{
		// Se añade al grupo por código, así no depende de configurarlo en el editor
		AddToGroup(GrupoJugador);

		CurrentHealth = MaxHealth;
		_hurtbox = GetNode<Hurtbox>("Hurtbox");
		_animatedSprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");

		// Lo busca por tipo, así funciona aunque el nodo tenga otro nombre
		_stats = BuscarEstadisticas();
		if (_stats == null)
			GD.PushWarning($"{Name}: no hay ningún hijo con el script Estadisticas.cs. No se actualizarán los corazones.");
		else
			_stats.SetSalud(CurrentHealth, MaxHealth);

		string sufijo = VariablesGlobales.BiomaSaludable ? "" : SufijoEstadoMalo;
		_animIdle = AnimIdle + sufijo;
		_animRun = AnimRun + sufijo;
		_animJump = AnimJump + sufijo;
		_animDamage = AnimDamage + sufijo;

		_hurtbox.ReceivedDamage += OnReceivedDamage;
	}

	private Estadisticas BuscarEstadisticas()
	{
		foreach (Node hijo in GetChildren())
		{
			if (hijo is Estadisticas e)
				return e;
		}
		return null;
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

			// La velocidad baja solo si falta agua o comida (la salud no la afecta)
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

		ReproducirAnimacion(anim);
	}

	// Solo reproduce si la animación existe, para no dar error
	private void ReproducirAnimacion(StringName anim)
	{
		if (_animatedSprite.SpriteFrames == null || !_animatedSprite.SpriteFrames.HasAnimation(anim))
			return;

		if (_animatedSprite.Animation != anim)
			_animatedSprite.Play(anim);
	}

	private void OnReceivedDamage(int amount)
	{
		GD.Print($"[Zorro] Golpe detectado. Daño={amount}, invulnerable={Invulnerable}");

		if (_muerto || Invulnerable) return;

		if (amount <= 0)
		{
			GD.PushWarning($"{Name}: el Hitbox que te golpeó tiene Damage = {amount}. Ponlo en 1 o más.");
			return;
		}

		CurrentHealth -= amount;
		_stats?.SetSalud(Mathf.Max(CurrentHealth, 0), MaxHealth);
		GD.Print($"¡Zorro recibió impacto! Vida actual: {CurrentHealth}/{MaxHealth}");

		if (CurrentHealth <= 0)
		{
			Die();
			return;
		}

		_controlTimer = DuracionPerdidaControl;
		_invulnTimer = DuracionInvulnerabilidad;

		ReproducirAnimacion(_animDamage);

		// Empuje hacia el lado contrario al que mira
		float direccionEmpuje = _animatedSprite.FlipH ? 1.0f : -1.0f;
		Velocity = new Vector2(KnockbackFuerza.X * direccionEmpuje, KnockbackFuerza.Y);
	}

	// ----------------------------------------
	// MUERTE Y GAME OVER (Adaptado del Delfín)
	// ----------------------------------------
	private void Die()
	{
		if (_muerto)
			return;

		_muerto = true;

		GD.Print("Zorro derrotado.");

		// Detener al jugador
		Velocity = Vector2.Zero;
		SetPhysicsProcess(false);

		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree()
			.GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print("[PlayerZorro] Mostrando Game Over.");

			// Mostrar pantalla de derrota
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[PlayerZorro] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté " +
				"instanciada en la escena del bioma."
			);
		}
	}
}
