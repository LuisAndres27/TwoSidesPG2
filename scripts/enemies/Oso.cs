using Godot;
using System;

public partial class Oso : CharacterBody2D
{
	[Export] public float Speed = 40.0f;
	[Export] public float ChaseSpeed = 90.0f; // Velocidad al perseguir
	[Export] public float DetectionRadius = 200.0f; // Rango de visión
	[Export] public float Gravity = 980.0f;

	private enum State { Patrol, Idle, Chase }
	private State _currentState = State.Patrol;
	private Vector2 _direction = Vector2.Right;

	private AnimatedSprite2D _animatedSprite;
	private RayCast2D _rayCastMuro;
	private RayCast2D _rayCastBorde;
	private Area2D _hitbox;

	private Node2D _player; 
	private bool _esHostil = false;

	public override void _Ready()
	{
		_animatedSprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
		_rayCastMuro = GetNode<RayCast2D>("RayCast2D");
		_rayCastBorde = GetNode<RayCast2D>("RayCast2D2");
		_hitbox = GetNode<Area2D>("Hitbox");

		// Obtiene la referencia al jugador (Asegúrate de que la ruta sea correcta según tu árbol de nodos)
		_player = GetNodeOrNull<Node2D>("../PlayerOso");

		if (VariablesGlobales.BiomaSaludable)
		{
			_animatedSprite.Play("Npc");
			_hitbox.ProcessMode = ProcessModeEnum.Disabled;
			_esHostil = false;
		}
		else
		{
			_animatedSprite.Play("NpcBad");
			_hitbox.ProcessMode = ProcessModeEnum.Inherit; 
			_esHostil = true; 
		}
	}

	public override void _PhysicsProcess(double delta)
	{
		Vector2 velocity = Velocity;

		if (!IsOnFloor())
		{
			velocity.Y += Gravity * (float)delta;
		}

		// Lógica de hostilidad y detección (Dificultad dinámica según estado ambiental)
		if (_esHostil && _player != null)
		{
			float distance = GlobalPosition.DistanceTo(_player.GlobalPosition);
			if (distance < DetectionRadius)
			{
				_currentState = State.Chase;
			}
			else
			{
				_currentState = State.Patrol;
			}
		}

		switch (_currentState)
		{
			case State.Patrol:
				PatrolUpdate(ref velocity);
				break;
			case State.Chase:
				ChaseUpdate(ref velocity);
				break;
			case State.Idle:
				velocity.X = 0;
				break;
		}

		Velocity = velocity;
		MoveAndSlide();
	}

	private void PatrolUpdate(ref Vector2 velocity)
	{
		if (_rayCastMuro.IsColliding() || !_rayCastBorde.IsColliding())
		{
			FlipDirection();
		}
		velocity.X = _direction.X * Speed;
	}

	private void ChaseUpdate(ref Vector2 velocity)
	{
		// Calcula hacia qué lado está el jugador
		float distToPlayer = _player.GlobalPosition.X - GlobalPosition.X;
		_direction.X = distToPlayer > 0 ? 1 : -1;
		
		_animatedSprite.FlipH = _direction.X < 0;

		// Ajusta los raycasts para que siempre miren hacia donde persigue
		_rayCastMuro.TargetPosition = new Vector2(Mathf.Abs(_rayCastMuro.TargetPosition.X) * _direction.X, _rayCastMuro.TargetPosition.Y);
		_rayCastBorde.Position = new Vector2(Mathf.Abs(_rayCastBorde.Position.X) * _direction.X, _rayCastBorde.Position.Y);

		// Evita caer por bordes o chocar contra muros mientras persigue
		if (!_rayCastBorde.IsColliding() || _rayCastMuro.IsColliding())
		{
			velocity.X = 0;
		}
		else
		{
			velocity.X = _direction.X * ChaseSpeed;
		}
	}

	private void FlipDirection()
	{
		_direction.X *= -1;
		_animatedSprite.FlipH = _direction.X < 0;

		_rayCastMuro.TargetPosition = new Vector2(
			_rayCastMuro.TargetPosition.X * -1,
			_rayCastMuro.TargetPosition.Y
		);

		_rayCastBorde.Position = new Vector2(
			_rayCastBorde.Position.X * -1,
			_rayCastBorde.Position.Y
		);
	}
}
