using Godot;
using System.Collections.Generic;

public partial class VariablesGlobales : Node
{
	// Estado actual del bioma que se está jugando
	public static bool BiomaSaludable = true;

	// ----------------------------------------
	// ESTADOS DE LOS NIVELES PARA EL MENÚ
	// ----------------------------------------

	public enum TipoNivel
	{
		Oceano,
		Selva,
		Desierto,
		Bosque,
		Tundra
	}

	public enum EstadoNivel
	{
		NoJugado,
		Bueno,
		Malo
	}

	private static readonly Dictionary<TipoNivel, EstadoNivel> _estadosNiveles = new()
	{
		{ TipoNivel.Oceano, EstadoNivel.NoJugado },
		{ TipoNivel.Selva, EstadoNivel.NoJugado },
		{ TipoNivel.Desierto, EstadoNivel.NoJugado },
		{ TipoNivel.Bosque, EstadoNivel.NoJugado },
		{ TipoNivel.Tundra, EstadoNivel.NoJugado }
	};

	public static void GuardarResultadoNivel(TipoNivel nivel, bool decisionBuena)
	{
		_estadosNiveles[nivel] = decisionBuena
			? EstadoNivel.Bueno
			: EstadoNivel.Malo;
	}

	public static EstadoNivel ObtenerEstadoNivel(TipoNivel nivel)
	{
		if (_estadosNiveles.TryGetValue(nivel, out EstadoNivel estado))
			return estado;

		return EstadoNivel.NoJugado;
	}

	public static void ReiniciarEstadosNiveles()
	{
		_estadosNiveles[TipoNivel.Oceano] = EstadoNivel.NoJugado;
		_estadosNiveles[TipoNivel.Selva] = EstadoNivel.NoJugado;
		_estadosNiveles[TipoNivel.Desierto] = EstadoNivel.NoJugado;
		_estadosNiveles[TipoNivel.Bosque] = EstadoNivel.NoJugado;
		_estadosNiveles[TipoNivel.Tundra] = EstadoNivel.NoJugado;
	}
}
