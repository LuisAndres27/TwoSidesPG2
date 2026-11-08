
using Godot;

public partial class PlayerDelfin : CharacterBody2D
{
	[ExportGroup("Movimiento")]
	[Export] public float Speed = 180.0f;
	[Export] public float Acceleration = 500.0f;
	[Export] public float Friction = 250.0f;
	[Export] public float MaxTiltDegrees = 25.0f;
	[Export] public float TiltSpeed = 8.0f;

	[ExportGroup("Vida y daño")]
	[Export] public int MaxHealth = 3;
	[Export] public Vector2 KnockbackFuerza = new(260.0f, -120.0f);
	[Export] public float DuracionPerdidaControl = 0.35f;
	[Export] public float DuracionInvulnerabilidad = 1.2f;
	[Export] public float DuracionAnimacionDanio = 0.3f;

	public int CurrentHealth { get; private set; }

	private Hurtbox _hurtbox;
	private AnimatedSprite2D _animatedSprite;
	private Estadisticas _stats;

	private float _controlTimer;
	private float _invulnTimer;
	private float _damageAnimTimer;

	private bool _muerto = false;

	// ----------------------------------------
	// INICIALIZACIÓN
	// ----------------------------------------

	public override void _Ready()
	{
		AddToGroup("jugador");

		CurrentHealth = MaxHealth;
		MotionMode = MotionModeEnum.Floating;

		RegisterKeyAction("nadar_arriba", Key.W);
		RegisterKeyAction("nadar_abajo", Key.S);

		_animatedSprite = GetNode<AnimatedSprite2D>(
            "AnimatedSprite2D"
		);

		_hurtbox = GetNodeOrNull<Hurtbox>("Hurtbox");

		_stats = GetNodeOrNull<Estadisticas>("Estadisticas")
			?? GetNodeOrNull<Estadisticas>("/root/Estadisticas");

		if (_hurtbox != null)
		{
			_hurtbox.ReceivedDamage += OnReceivedDamage;
		}
		else
		{
			GD.PushWarning(
                "PlayerDelfin: falta el nodo Hurtbox."
			);
		}

		if (_stats != null)
		{
			_stats.SetSalud(CurrentHealth, MaxHealth);
		}
		else
		{
			GD.PushWarning(
                "PlayerDelfin: no se encontró Estadisticas."
			);
		}
	}

	public override void _ExitTree()
	{
		if (_hurtbox != null)
			_hurtbox.ReceivedDamage -= OnReceivedDamage;
	}

	// ----------------------------------------
	// CONTROLES
	// ----------------------------------------

	private static void RegisterKeyAction(
		string action, Key key)
	{
		if (!InputMap.HasAction(action))
			InputMap.AddAction(action);

		foreach (InputEvent evento in
			InputMap.ActionGetEvents(action))
		{
			if (evento is InputEventKey tecla &&
				tecla.PhysicalKeycode == key)
				return;
		}

		InputMap.ActionAddEvent(
			action,
			new InputEventKey
			{
				PhysicalKeycode = key
			}
		);
	}

	// ----------------------------------------
	// MOVIMIENTO ACUÁTICO
	// ----------------------------------------

	public override void _PhysicsProcess(double delta)
	{
		if (_muerto)
			return;

		float dt = (float)delta;

		_controlTimer = Mathf.Max(
			0f, _controlTimer - dt
		);

		_invulnTimer = Mathf.Max(
			0f, _invulnTimer - dt
		);

		_damageAnimTimer = Mathf.Max(
			0f, _damageAnimTimer - dt
		);

		Vector2 input = Vector2.Zero;

		if (_controlTimer > 0)
		{
			// Frenar gradualmente después del impacto
			Velocity = Velocity.MoveToward(
				Vector2.Zero,
				Friction * dt
			);
		}
		else
		{
			// Movimiento libre en cuatro direcciones
			input = Input.GetVector(
				"left",
				"right",
				"nadar_arriba",
                "nadar_abajo"
			);

			float velocidad = Speed *
				(_stats?.MultiplicadorVelocidad ?? 1.0f);

			float cambio = input != Vector2.Zero
				? Acceleration
				: Friction;

			Velocity = Velocity.MoveToward(
				input * velocidad,
				cambio * dt
			);
		}

		MoveAndSlide();

		UpdateAnimations(input, dt);
	}

	// ----------------------------------------
	// ANIMACIONES
	// ----------------------------------------

	private void UpdateAnimations(Vector2 input, float dt)
	{
		if (input.X != 0)
			_animatedSprite.FlipH = input.X < 0;

		float lado = _animatedSprite.FlipH
			? -1f
			: 1f;

		float inclinacion = Mathf.DegToRad(
			Velocity.Y / Mathf.Max(1f, Speed)
			* MaxTiltDegrees
		) * lado;

		_animatedSprite.Rotation = Mathf.LerpAngle(
			_animatedSprite.Rotation,
			inclinacion,
			TiltSpeed * dt
		);

		if (_damageAnimTimer > 0)
			return;

		Reproducir(
			Velocity.Length() > 10f
				? "run"
				: "idle"
		);
	}

	private void Reproducir(string nombre)
	{
		if (_animatedSprite.SpriteFrames == null ||
			!_animatedSprite.SpriteFrames.HasAnimation(nombre))
			return;

		if (_animatedSprite.Animation != nombre ||
			!_animatedSprite.IsPlaying())
		{
			_animatedSprite.Play(nombre);
		}
	}

	// ----------------------------------------
	// RECIBIR DAÑO
	// ----------------------------------------

	private void OnReceivedDamage(int amount)
	{
		if (_muerto || _invulnTimer > 0 || amount <= 0)
			return;

		CurrentHealth = Mathf.Max(
			0,
			CurrentHealth - amount
		);

		// Actualizar corazones del HUD
		_stats?.SetSalud(CurrentHealth, MaxHealth);

		GD.Print(
			$"¡Delfín recibió impacto! Vida actual: " +
			$"{CurrentHealth}/{MaxHealth}"
		);

		if (CurrentHealth <= 0)
		{
			Die();
			return;
		}

		// Activar retroceso e invulnerabilidad
		_controlTimer = DuracionPerdidaControl;

		_invulnTimer = Mathf.Max(
			DuracionInvulnerabilidad,
			DuracionPerdidaControl
		);

		_damageAnimTimer = DuracionAnimacionDanio;

		// Empujar en dirección contraria a la mirada
		float direccion = _animatedSprite.FlipH
			? 1f
			: -1f;

		Velocity = new Vector2(
			KnockbackFuerza.X * direccion,
			KnockbackFuerza.Y
		);

		Reproducir("damage");
	}

	// ----------------------------------------
	// MUERTE Y GAME OVER
	// ----------------------------------------

	private void Die()
	{
		if (_muerto)
			return;

		_muerto = true;

		GD.Print("Delfín derrotado.");

		// Detener al jugador
		Velocity = Vector2.Zero;
		SetPhysicsProcess(false);

		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree()
			.GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print(
                "[PlayerDelfin] Mostrando Game Over."
			);

			// Mostrar pantalla de derrota
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[PlayerDelfin] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté " +
                "instanciada en bioma_mar.tscn."
			);
		}
	}
}
