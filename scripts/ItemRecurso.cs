
using Godot;

public enum TipoRecurso { Agua, Comida, Calor }

public partial class ItemRecurso : RigidBody2D
{
	[Export] public TipoRecurso Tipo = TipoRecurso.Agua;
	[Export] public int Cantidad = 1;
	[Export] public string GrupoJugador = "jugador";
	[Export] public float TiempoAntesDeRecoger = 0.4f;
	[Export] public float TiempoDeVida = 0.0f;

	private Area2D _deteccion;
	private double _espera;
	private double _vida;
	private bool _recogido = false;

	public override void _Ready()
	{
		_deteccion = GetNode<Area2D>("Deteccion");
		_deteccion.BodyEntered += OnBodyEntered;
		_espera = TiempoAntesDeRecoger;

		// Evitar colisiones físicas con los jugadores
		foreach (Node nodo in GetTree().GetNodesInGroup(GrupoJugador))
		{
			if (nodo is PhysicsBody2D jugador)
				AddCollisionExceptionWith(jugador);
		}
	}

	public override void _ExitTree()
	{
		if (_deteccion != null)
			_deteccion.BodyEntered -= OnBodyEntered;
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_recogido) return;

		if (TiempoDeVida > 0)
		{
			_vida += delta;

			if (_vida >= TiempoDeVida)
			{
				QueueFree();
				return;
			}
		}

		if (_espera > 0)
		{
			_espera -= delta;

			if (_espera <= 0)
			{
				foreach (Node2D body in _deteccion.GetOverlappingBodies())
				{
					if (body.IsInGroup(GrupoJugador))
					{
						Recoger(body);
						return;
					}
				}
			}
		}
	}

	private void OnBodyEntered(Node2D body)
	{
		if (!body.IsInGroup(GrupoJugador)) return;

		// Evitar colisión física con este jugador
		if (body is PhysicsBody2D jugador)
			AddCollisionExceptionWith(jugador);

		if (_espera > 0) return;

		Recoger(body);
	}

	private void Recoger(Node2D jugador)
	{
		if (_recogido) return;
		_recogido = true;

		Estadisticas stats = null;

		foreach (Node hijo in jugador.GetChildren())
		{
			if (hijo is Estadisticas e)
			{
				stats = e;
				break;
			}
		}

		// Buscar también las estadísticas en Autoload
		stats ??= GetNodeOrNull<Estadisticas>(
            "/root/Estadisticas"
		);

		stats?.Recuperar(Tipo, Cantidad);

		QueueFree();
	}
}
