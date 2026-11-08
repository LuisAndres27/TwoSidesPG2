using Godot;
using System;

public partial class Hurtbox : Area2D
{
	[Signal]
	public delegate void ReceivedDamageEventHandler(int amount);

	[Export] public float CooldownDano = 2.0f;

	private double _cooldownRestante = 0;

	public override void _PhysicsProcess(double delta)
	{
		if (!IsInsideTree()) return;

		// Reducir el cooldown
		if (_cooldownRestante > 0)
		{
			_cooldownRestante -= delta;
			return;
		}

		var areas = GetOverlappingAreas();

		foreach (Area2D area in areas)
		{
			if (area is Hitbox hitbox)
			{
				TakeDamage(hitbox.Damage);
				_cooldownRestante = CooldownDano;
				break;
			}
		}
	}

	public void TakeDamage(int damage)
	{
		EmitSignal(SignalName.ReceivedDamage, damage);
	}
}
