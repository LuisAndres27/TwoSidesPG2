using Godot;

public partial class NpcPresa : Node
{
	[ExportGroup("Vida")]
	[Export] public int VidaMax = 3;
	[Export] public bool SoloEnMalEstado = true;     // en buen estado no hace ni recibe daño

	[ExportGroup("Contacto con el jugador")]
	[Export] public string GrupoJugador = "jugador";
	[Export] public float RadioContacto = 40.0f;     // distancia a la que el jugador "toca" al NPC
	[Export] public float IntervaloDano = 1.0f;      // segundos entre golpes
	[Export] public int DanoRecibido = 1;

	[ExportGroup("Empuje")]
	[Export] public float DistanciaEmpuje = 16.0f;   // cuánto se desplaza al recibir daño
	[Export] public float DuracionEmpuje = 0.15f;

	[ExportGroup("Comida")]
	[Export] public PackedScene EscenaComida;        // item_comida.tscn
	[Export] public int CantidadComida = 2;

	[ExportGroup("Daño al jugador")]
	[Export] public Area2D HitboxNpc;                // opcional: si se deja vacío busca un hijo llamado "Hitbox"

	private Node2D _padre;
	private int _vida;
	private float _cooldown = 0.0f;
	private float _empujeRestante = 0.0f;
	private Vector2 _empujeVel = Vector2.Zero;
	private bool _muerto = false;
	private Tween _flash;

	public override void _Ready()
	{
		_padre = GetParent<Node2D>();
		_vida = VidaMax;

		HitboxNpc ??= _padre.GetNodeOrNull<Area2D>("Hitbox");

		bool activo = !SoloEnMalEstado || !VariablesGlobales.BiomaSaludable;
		if (!activo)
		{
			// Buen estado: el NPC es inofensivo y no se puede dañar
			HitboxNpc?.SetDeferred(Area2D.PropertyName.Monitorable, false);
			SetPhysicsProcess(false);
		}
	}

	public override void _ExitTree()
	{
		_flash?.Kill();
	}

	public override void _PhysicsProcess(double delta)
	{
		if (_muerto) return;

		float d = (float)delta;
		if (_cooldown > 0) _cooldown -= d;

		// Empuje corto después de recibir daño
		if (_empujeRestante > 0)
		{
			_empujeRestante -= d;
			MoverPadre(_empujeVel * d);
		}

		if (_cooldown > 0) return;

		Node2D jugador = JugadorCercano();
		if (jugador != null)
			RecibirDano(jugador);
	}

	private Node2D JugadorCercano()
	{
		foreach (Node nodo in GetTree().GetNodesInGroup(GrupoJugador))
		{
			if (nodo is Node2D j && j.GlobalPosition.DistanceTo(_padre.GlobalPosition) <= RadioContacto)
				return j;
		}
		return null;
	}

	private void RecibirDano(Node2D jugador)
	{
		_vida -= DanoRecibido;
		_cooldown = IntervaloDano;

		// Empuje en dirección contraria al jugador
		float dir = Mathf.Sign(_padre.GlobalPosition.X - jugador.GlobalPosition.X);
		if (dir == 0) dir = 1;
		_empujeVel = new Vector2(dir * DistanciaEmpuje / Mathf.Max(0.01f, DuracionEmpuje), 0);
		_empujeRestante = DuracionEmpuje;

		// Destello rojo
		_flash?.Kill();
		_padre.Modulate = new Color(1.0f, 0.4f, 0.4f);
		_flash = CreateTween();
		_flash.TweenProperty(_padre, "modulate", Colors.White, 0.2f);

		if (_vida <= 0)
			Morir();
	}

	private void MoverPadre(Vector2 desplazamiento)
	{
		if (_padre is PhysicsBody2D cuerpo)
			cuerpo.MoveAndCollide(desplazamiento); // respeta el suelo y las paredes
		else
			_padre.GlobalPosition += desplazamiento;
	}

	private void Morir()
	{
		if (_muerto) return;
		_muerto = true;

		// Ya no puede hacer daño
		HitboxNpc?.SetDeferred(Area2D.PropertyName.Monitorable, false);

		SoltarComida();
		_padre.QueueFree();
	}

	private void SoltarComida()
	{
		if (EscenaComida == null)
		{
			GD.PushWarning($"{_padre.Name}: falta asignar EscenaComida en NpcPresa.");
			return;
		}

		Node escena = GetTree().CurrentScene;
		for (int i = 0; i < CantidadComida; i++)
		{
			var comida = EscenaComida.Instantiate<Node2D>();
			escena.AddChild(comida);
			comida.GlobalPosition = _padre.GlobalPosition;

			if (comida is RigidBody2D cuerpo)
			{
				float x = (float)GD.RandRange(-25.0, 25.0);
				float y = (float)GD.RandRange(-60.0, -20.0);
				cuerpo.LinearVelocity = new Vector2(x, y);
			}
		}
	}
}
