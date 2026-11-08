using Godot;
using System;

// ¡Aquí está el cambio! Debe decir MusicaFondo para coincidir con el archivo
public partial class MusicaFondo : AudioStreamPlayer 
{
	[Export] public AudioStream MusicaBuena;
	[Export] public AudioStream MusicaMala;

	public override void _Ready()
	{
		if (VariablesGlobales.BiomaSaludable)
		{
			Stream = MusicaBuena;
		}
		else
		{
			Stream = MusicaMala;
		}

		Play();
	}
}
