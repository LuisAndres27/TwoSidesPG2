using Godot;
using System;

public partial class ZonaMuerte : Area2D
{
	public override void _Ready()
	{
		BodyEntered += OnBodyEntered;
	}

	private void OnBodyEntered(Node2D body)
	{
		if (body.IsInGroup("jugador"))
		{
			GD.Print("El jugador cayó a la zona de muerte.");
			
			// Le pedimos a Godot que espere un instante (CallDeferred) antes de mostrar el Game Over, 
			// para evitar chocar con el motor de físicas.
			CallDeferred(MethodName.MostrarGameOver);
		}
	}

	private void MostrarGameOver()
	{
		// Buscar GameOver en el bioma actual
		GameOver gameOver = GetTree().GetFirstNodeInGroup("game_over") as GameOver;

		if (gameOver != null)
		{
			GD.Print("[ZonaMuerte] Mostrando Game Over.");
			gameOver.MostrarDerrota();
		}
		else
		{
			GD.PushError(
				"[ZonaMuerte] No se encontró GameOver. " +
				"Verifica que game_over.tscn esté instanciada en la escena."
			);
		}
	}
}
