
using Godot;

public partial class EfectoBoton : Node
{
	[ExportGroup("Animación")]
	[Export] public float EscalaPresionado = 0.90f;
	[Export] public float EscalaHover = 1.05f;
	[Export] public float Duracion = 0.10f;

	private BaseButton _boton;
	private Tween _tween;
	private Color _colorOriginal;

	private bool _presionado = false;
	private bool _hover = false;

	public override void _Ready()
	{
		// Obtener el botón padre sin cambiar su tipo
		_boton = GetParent() as BaseButton;

		if (_boton == null)
		{
			GD.PushError(
                "EfectoBoton debe ser hijo de un botón."
			);
			return;
		}

		_colorOriginal = _boton.Modulate;

		// Escalar desde el centro
		ActualizarPivote();

		_boton.Resized += ActualizarPivote;
		_boton.MouseEntered += MouseDentro;
		_boton.MouseExited += MouseFuera;
		_boton.ButtonDown += Presionar;
		_boton.ButtonUp += Soltar;
	}

	private void ActualizarPivote()
	{
		_boton.PivotOffset = _boton.Size / 2f;
	}

	private void MouseDentro()
	{
		_hover = true;

		if (!_presionado)
			Animar(EscalaHover, _colorOriginal);
	}

	private void MouseFuera()
	{
		_hover = false;

		if (!_presionado)
			Animar(1.0f, _colorOriginal);
	}

	private void Presionar()
	{
		_presionado = true;

		// Reducir tamaño y oscurecer
		Animar(
			EscalaPresionado,
			_colorOriginal.Darkened(0.30f)
		);
	}

	private void Soltar()
	{
		_presionado = false;

		Animar(
			_hover ? EscalaHover : 1.0f,
			_colorOriginal
		);
	}

	private void Animar(float escala, Color color)
	{
		_tween?.Kill();

		_tween = CreateTween();
		_tween.SetParallel(true);
		_tween.SetTrans(Tween.TransitionType.Sine);
		_tween.SetEase(Tween.EaseType.Out);

		float tiempo = Mathf.Max(0.01f, Duracion);

		_tween.TweenProperty(
			_boton,
			"scale",
			Vector2.One * escala,
			tiempo
		);

		_tween.TweenProperty(
			_boton,
			"modulate",
			color,
			tiempo
		);
	}

	public override void _ExitTree()
	{
		_tween?.Kill();

		if (_boton == null)
			return;

		_boton.Resized -= ActualizarPivote;
		_boton.MouseEntered -= MouseDentro;
		_boton.MouseExited -= MouseFuera;
		_boton.ButtonDown -= Presionar;
		_boton.ButtonUp -= Soltar;
	}
}
