using Godot;
using System;

public partial class BiomaNieve : Node2D
{
	private Node2D _buenEstado;
	private Node2D _malEstado;
	private ParallaxBackground _fondoBueno;
	private ParallaxBackground _fondoMalo;
	
	// 1. Agregamos la variable para el nodo de partículas
	private CpuParticles2D _particulasNieveMala;

	public override void _Ready()
	{
		_buenEstado = GetNode<Node2D>("Buen estado");
		_malEstado = GetNode<Node2D>("Mal estado");
		_fondoBueno = GetNode<ParallaxBackground>("FondoBueno");
		_fondoMalo = GetNode<ParallaxBackground>("FondoMalo");
		
		// 2. Vinculamos el nodo (asegúrate de que el nombre coincida con el que pusiste en la escena)
		_particulasNieveMala = GetNode<CpuParticles2D>("ParticulasNieveMala");

		AplicarConsecuenciasAmbientales();
	}

	private void AplicarConsecuenciasAmbientales()
	{
		if (VariablesGlobales.BiomaSaludable)
		{
			// ----- APLICAR ESTADO BUENO -----
			_buenEstado.Visible = true;
			_fondoBueno.Visible = true;
			_buenEstado.ProcessMode = ProcessModeEnum.Inherit; 

			_malEstado.Visible = false;
			_fondoMalo.Visible = false;
			_malEstado.ProcessMode = ProcessModeEnum.Disabled; 
			
			// Apagar la tormenta de nieve
			_particulasNieveMala.Emitting = false;
		}
		else
		{
			// ----- APLICAR ESTADO MALO -----
			_buenEstado.Visible = false;
			_fondoBueno.Visible = false;
			_buenEstado.ProcessMode = ProcessModeEnum.Disabled;

			_malEstado.Visible = true;
			_fondoMalo.Visible = true;
			_malEstado.ProcessMode = ProcessModeEnum.Inherit;
			
			// Encender la tormenta de nieve como evento climático extremo (RF-016)
			_particulasNieveMala.Emitting = true;
		}
	}
}
