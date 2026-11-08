
using Godot;
using System.Collections.Generic;

public partial class Estadisticas : Node
{
	[ExportGroup("Agua y comida")]
	[Export] public float AguaMax = 100.0f;
	[Export] public float ComidaMax = 100.0f;
	[Export] public float DrenajeAgua = 2.5f;
	[Export] public float DrenajeComida = 2.0f;
	[Export] public int RecursosParaLlenar = 3;

	[ExportGroup("Activar estadísticas")]
	[Export] public bool ActivarAgua = true;
	[Export] public bool ActivarComida = true;

	[ExportGroup("Estado del bioma")]
	[Export] public float MultiplicadorDrenajeBueno = 0.6f;
	[Export] public float MultiplicadorDrenajeMalo = 1.6f;

	[ExportGroup("Velocidad")]
	[Export] public float MultiplicadorMinimo = 0.5f;

	[ExportGroup("Interfaz")]
	[Export] public Texture2D IconoSalud;
	[Export] public Texture2D IconoAgua;
	[Export] public Texture2D IconoComida;
	[Export] public float EscalaHud = 1.5f;
	[Export] public int Margen = 8;

	public float Agua { get; private set; }
	public float Comida { get; private set; }

	private int _saludActual = 3;
	private int _saludMax = 3;

	private CanvasLayer _hud;
	private HBoxContainer _corazones;
	private readonly List<TextureRect> _iconosSalud = new();
	private TextureProgressBar _barraAgua, _barraComida;

	private float MultiplicadorDrenaje =>
		VariablesGlobales.BiomaSaludable
			? MultiplicadorDrenajeBueno
			: MultiplicadorDrenajeMalo;

	public float MultiplicadorVelocidad
	{
		get
		{
			float agua = ActivarAgua
				? Agua / Mathf.Max(1f, AguaMax) : 1f;

			float comida = ActivarComida
				? Comida / Mathf.Max(1f, ComidaMax) : 1f;

			float factor = Mathf.Clamp(
				Mathf.Min(agua, comida), 0f, 1f
			);

			return Mathf.Lerp(MultiplicadorMinimo, 1f, factor);
		}
	}

	public override void _Ready()
	{
		Agua = AguaMax;
		Comida = ComidaMax;

		IconoSalud ??= CargarIcono(
            "res://assets/sprites/ui/ICONOS RECURSOS_0001.png"
		);

		IconoAgua ??= CargarIcono(
            "res://assets/sprites/ui/ICONOS RECURSOS_0002.png"
		);

		IconoComida ??= CargarIcono(
            "res://assets/sprites/ui/ICONOS RECURSOS_0003.png"
		);

		ConstruirHud();
		ActualizarHud();
	}

	public override void _Process(double delta)
	{
		float tiempo = (float)delta * MultiplicadorDrenaje;

		if (ActivarAgua)
			Agua = Mathf.Max(0f, Agua - DrenajeAgua * tiempo);

		if (ActivarComida)
			Comida = Mathf.Max(0f, Comida - DrenajeComida * tiempo);

		ActualizarHud();
	}

	public void Recuperar(TipoRecurso tipo, int unidades)
	{
		float fraccion = unidades /
			(float)Mathf.Max(1, RecursosParaLlenar);

		if (tipo == TipoRecurso.Agua && ActivarAgua)
			Agua = Mathf.Min(
				AguaMax, Agua + AguaMax * fraccion
			);

		else if (tipo == TipoRecurso.Comida && ActivarComida)
			Comida = Mathf.Min(
				ComidaMax, Comida + ComidaMax * fraccion
			);

		ActualizarHud();
	}

	public void SetSalud(int actual, int max)
	{
		max = Mathf.Max(1, max);

		bool cambioMax = max != _saludMax;

		_saludMax = max;
		_saludActual = Mathf.Clamp(actual, 0, max);

		if (cambioMax && _corazones != null)
			ReconstruirCorazones();

		ActualizarHud();
	}

	private static Texture2D CargarIcono(string ruta) =>
		ResourceLoader.Exists(ruta)
			? GD.Load<Texture2D>(ruta) : null;

	private void ConstruirHud()
	{
		_hud = new CanvasLayer
		{
			Layer = 10,
			Scale = Vector2.One * EscalaHud
		};

		AddChild(_hud);

		var margen = new MarginContainer
		{
			MouseFilter = Control.MouseFilterEnum.Ignore
		};

		margen.AddThemeConstantOverride("margin_left", Margen);
		margen.AddThemeConstantOverride("margin_top", Margen);
		_hud.AddChild(margen);

		var caja = new HBoxContainer
		{
			MouseFilter = Control.MouseFilterEnum.Ignore
		};

		caja.AddThemeConstantOverride("separation", 6);
		margen.AddChild(caja);

		_corazones = new HBoxContainer
		{
			MouseFilter = Control.MouseFilterEnum.Ignore
		};

		_corazones.AddThemeConstantOverride("separation", 1);
		caja.AddChild(_corazones);

		ReconstruirCorazones();

		_barraAgua = CrearBarra(IconoAgua, AguaMax);
		_barraComida = CrearBarra(IconoComida, ComidaMax);

		caja.AddChild(_barraAgua);
		caja.AddChild(_barraComida);
	}

	private TextureProgressBar CrearBarra(Texture2D icono, float max)
	{
		return new TextureProgressBar
		{
			TextureUnder = icono,
			TextureProgress = icono,
			TintUnder = Colors.Black,

			FillMode = (int)
				TextureProgressBar.FillModeEnum.BottomToTop,

			MinValue = 0,
			MaxValue = Mathf.Max(1f, max),
			Value = max,

			TextureFilter =
				CanvasItem.TextureFilterEnum.Nearest,

			MouseFilter =
				Control.MouseFilterEnum.Ignore
		};
	}

	private void ReconstruirCorazones()
	{
		foreach (Node hijo in _corazones.GetChildren())
		{
			_corazones.RemoveChild(hijo);
			hijo.QueueFree();
		}

		_iconosSalud.Clear();

		for (int i = 0; i < _saludMax; i++)
		{
			var corazon = new TextureRect
			{
				Texture = IconoSalud,
				TextureFilter =
					CanvasItem.TextureFilterEnum.Nearest,
				MouseFilter =
					Control.MouseFilterEnum.Ignore
			};

			_corazones.AddChild(corazon);
			_iconosSalud.Add(corazon);
		}
	}

	private void ActualizarHud()
	{
		if (_barraAgua != null)
		{
			_barraAgua.Visible = ActivarAgua;
			_barraAgua.Value = Agua;
		}

		if (_barraComida != null)
		{
			_barraComida.Visible = ActivarComida;
			_barraComida.Value = Comida;
		}

		for (int i = 0; i < _iconosSalud.Count; i++)
		{
			_iconosSalud[i].Modulate =
				i < _saludActual
					? Colors.White
					: Colors.Black;
		}
	}
}
