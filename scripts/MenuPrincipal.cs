#nullable enable
using Godot;
using TwoSides.Network;
using TwoSides.Integration.Sqlite;

public partial class MenuPrincipal : Control
{
	[Export] public PackedScene? EscenaNiveles;
	[Export] public PackedScene? EscenaIntroduccion;
	[Export] public PackedScene? EscenaEstadisticas;
	private GamePersistenceContext? _context;
	private LocalProfileView _view = null!;
	private Button _statistics = null!, _exit = null!;
	private bool _leaving, _navigating;
	private string? _message;
	private LocalStatisticsScreen? _statisticsScreen;
	private VBoxContainer _content=null!;
	private bool Alive => !_leaving && IsInstanceValid(this) && IsInsideTree();
	private bool TransitionBusy => GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true;

	public override async void _Ready()
	{
		GetTree().Paused = false;
		_context = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
		var content = GetNode<VBoxContainer>("Centro/Tablero/Margen/Contenido");
		_content=content;
		content.AddThemeConstantOverride("separation", 6);
		GetNode<TextureButton>("Centro/Tablero/Margen/Contenido/BotonJugar").Visible = false;
		GetNode<Label>("Centro/Tablero/Margen/Contenido/Titulo").Text = "Two Sides";
		_view = new LocalProfileView(); content.AddChild(_view); content.MoveChild(_view, 1);
		_view.CreateRequested += CreateProfile;
		_view.NewGameRequested += RequestNewGame;
		_view.ContinueRequested += ContinueGame;
		_view.RetryRequested += Retry;
		_statistics = GetNode<Button>("Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonEstadisticas");
		_exit = GetNode<Button>("Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonSalir");
		_statistics.Disabled = true;
		_statistics.Pressed += Statistics;
		_exit.Pressed += Exit;
		if (_context is null) { _message = "No está disponible el almacenamiento local."; return; }
		await _context.Initialization;
		if (!Alive) return;
		// Reopening the menu reloads SQLite, never creates a game.
		if (_context.State.Ready && !_context.State.HasPendingWrite) await _context.State.RefreshAsync();
		if (_context.State.Ready && _context.State.Profile is not null) GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.BeginLocalSession();
		Render();
	}
	public override void _Process(double delta) => Render();
	private void Render()
	{
		if(_statistics is not null)_statistics.Disabled=_context is null || !_context.State.Ready || _context.State.Busy || _context.State.HasPendingWrite || _navigating || TransitionBusy;
		if (_view is not null && _context is not null) _view.Render(_context.State, _navigating || TransitionBusy, _message);
	}
	private async void CreateProfile()
	{
		if (!Alive || _context is null || _navigating || TransitionBusy) return;
		_message = null;
		await _context.State.CreateProfileAsync(_view.DisplayName);
		if (Alive) Render();
	}
	private void RequestNewGame()
	{
		if (!Alive || _context is null || _context.State.Busy || _navigating || TransitionBusy) return;
		if (!_context.State.CanStartNewGame) { _message = "Continúa tu partida actual para terminarla."; Render(); return; }
		NewGame();
	}
	private async void NewGame()
	{
		if (!Alive || _context is null || _navigating || TransitionBusy) return;
		_message = null;
		if (await _context.State.NewGameAsync() && Alive) ContinueGame();
		if (Alive) Render();
	}
	private async void Retry()
	{
		if (!Alive || _context is null || _context.State.Busy || _navigating || TransitionBusy) return;
		_message = null;
		if (_context.State.Profile is null) await _context.State.CreateProfileAsync(_view.DisplayName);
		else if (_context.State.NeedsFinal || _context.State.HasPendingFinalPreparation || _context.State.CanContinue) ContinueGame();
		else if (await _context.State.NewGameAsync() && Alive) ContinueGame();
		if (Alive) Render();
	}
	private async void ContinueGame()
	{
		if (!Alive || _context is null || _navigating || TransitionBusy) return;
		_navigating = true; _message = null;
		try
		{
			if (!_context.State.HasPendingWrite && !await _context.State.RefreshAsync()) return;
			bool final=_context.State.NeedsFinal || _context.State.HasPendingFinalPreparation;
			if (!(final ? await _context.State.PrepareFinalAsync() : await _context.State.PrepareSelectionAsync()) || !Alive) return;
			string destination = final ? LocalGameState.FinalDestination : "res://scenes/levels/menu_niveles.tscn";
			if (!ResourceLoader.Exists(destination, "PackedScene")) { NavigationFailed(); return; }
			var transition = GetNodeOrNull<Transicion>("/root/Transicion");
			bool Validate() => Alive && (final ? _context.State.ConfirmedEnding is not null : _context.State.CanEnterSelection);
			bool changed = transition is not null
				? await transition.CambiarEscenaValidadaAsync(destination, Validate)
				: Validate() && GetTree().ChangeSceneToFile(destination) == Error.Ok;
			if (!changed && Alive) NavigationFailed();
		}
		finally { if (Alive) { _navigating = false; Render(); } }
	}
	private void NavigationFailed()
	{
		_context?.State.CancelSelection();
		_message = "La partida está guardada. No se pudo abrir la selección; puedes reintentar Continuar.";
	}
	private async void Statistics()
	{
		if(!Alive || _navigating || TransitionBusy || _context is null || !_context.State.Ready || _context.State.Busy || _context.State.HasPendingWrite)return;
		_navigating=true;_message="Consultando estadísticas locales…";Render();
		var state=new LocalStatisticsScreenState(_context.Statistics);
		await state.LoadAsync();
		if(!Alive){state.Close();return;}
		_statisticsScreen=new LocalStatisticsScreen{State=state};
		_statisticsScreen.Closed+=CloseStatistics;
		_content.Hide();_content.GetParent().AddChild(_statisticsScreen);
	}
	private void CloseStatistics()
	{
		if(!Alive || _statisticsScreen is null)return;
		_statisticsScreen.Closed-=CloseStatistics;_statisticsScreen.Hide();_statisticsScreen.QueueFree();_statisticsScreen=null;
		_content.Show();_navigating=false;_message=null;Render();_statistics.GrabFocus();
	}
	private async void Exit()
	{
		if(_context?.State.Busy==true || _navigating)return;
		if(_context is not null)await _context.QuitAsync();else GetTree().Quit();
	}
	public override void _ExitTree()
	{
		_leaving = true;
		if(_statisticsScreen is not null){_statisticsScreen.State.Close();_statisticsScreen.Closed-=CloseStatistics;}
		if (_view is not null)
		{
			_view.CreateRequested -= CreateProfile; _view.NewGameRequested -= RequestNewGame;
			_view.ContinueRequested -= ContinueGame; _view.RetryRequested -= Retry;
		}
		if (_statistics is not null) _statistics.Pressed -= Statistics;
		if (_exit is not null) _exit.Pressed -= Exit;
	}
}
