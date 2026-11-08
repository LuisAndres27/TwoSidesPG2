using Godot;

public partial class Hitbox : Area2D
{
	[Export] public int Damage { get; set; } = 1;
}
