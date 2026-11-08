#nullable enable
using Godot;
using System.Threading.Tasks;
using TwoSides.Network;

namespace TwoSides.Integration.Sqlite;

// One application-owned child, not a second Autoload. Only this copy's separate runtime path.
public partial class GamePersistenceContext : Node
{
    // Null in the normal game. With the explicit local-test arguments it is a disposable SyntheticSandbox database (see GameTestStorage).
    private readonly GameTestStorage? _testStorage=GameTestStorage.FromArguments(Godot.OS.GetCmdlineUserArgs());
    private readonly GamePersistenceAdapter _adapter;
    public LocalGameState State { get; }
    public TwoSides.LocalPersistence.ISaveDatabase? SyncStorage=>_quitting?null:_adapter.SyncStorage;
    // Set only when local-test synchronization is enabled: awaited (bounded) before the database closes.
    public System.Func<Task>? BeforeStorageClose { get; set; }
    public ILocalStatisticsReader Statistics=>_adapter;
    public TwoSides.LocalPersistence.IStatisticsDeliveryStore StatisticalDelivery=>_adapter;
    public LocalGameplayObserver Telemetry {get;}
    private Node? _animalScene;
    private string? _animalGame,_animalBiome;
    private bool _initializingTelemetry,_quitting;
    private Task? _quitTask;
    private Task _telemetryInitialization=Task.CompletedTask;
    private string? _lastOutboxCode;
    private string? _telemetryDiagnostic;
    private string? _lastStatisticsCode;
    public GamePersistenceContext()
    {
        // Normal game: the per-user production store. Test flags: only their own disposable sandbox. The developer's historical store is never opened here.
        _adapter=_testStorage?.CreateAdapter()??new(production:true);
        State=new(_adapter,_testStorage is null?GamePersistenceAdapter.ProductionStoragePath:GameTestStorage.OpenPath);
        // Telemetry may finish off-thread or after the Node was freed: no Godot calls here.
        Telemetry=new(_adapter,diagnostic:code=>System.Threading.Interlocked.Exchange(ref _telemetryDiagnostic,code));
    }
    public Task Initialization { get; private set; } = Task.CompletedTask;
    public Task Shutdown { get; private set; } = Task.CompletedTask;
    public override void _Ready()
    {
        ProcessMode=ProcessModeEnum.Always;GetTree().AutoAcceptQuit=false;
        Initialization=State.InitializeAsync();
    }
    public override void _Process(double delta)
    {
        if(_quitting)return;
        var telemetryCode=System.Threading.Interlocked.Exchange(ref _telemetryDiagnostic,null);
        if(telemetryCode is not null)GD.PushWarning("[Local telemetry] "+telemetryCode);
        var outbox=_adapter.OutboxDiagnostic;
        var statisticsCode=_adapter.StatisticalDiagnostic;
        if(_lastStatisticsCode!=statisticsCode){_lastStatisticsCode=statisticsCode;
            if(statisticsCode is "STATISTICS_INITIALIZATION_FAILED" or "STATISTICS_RECONCILIATION_PENDING" or "STATISTICS_CAPTURE_GAP" or "STATISTICS_VOLUME_REVIEW")GD.PushWarning("[Local statistics] "+statisticsCode);}
        if(_lastOutboxCode!=outbox.Code)
        {
            _lastOutboxCode=outbox.Code;
            if(outbox.IntegrityFailure)GD.PushError("[Local storage integrity] "+outbox.Code);
            else if(outbox.Code is not "OUTBOX_IDLE" and not "OUTBOX_INACTIVE" and not "OUTBOX_LOCAL_READY" and not "OUTBOX_WAITING_PROFILE")
                GD.PushWarning("[Local outbox] "+outbox.Code);
        }
        if(!_initializingTelemetry && State.Ready && State.Profile is not null)
        {_initializingTelemetry=true;_telemetryInitialization=Telemetry.InitializeAsync(State.Profile.LocalPlayerId);}
        var tree=GetTree();var scene=tree.CurrentScene;
        bool same=_animalScene is not null && IsInstanceValid(_animalScene) && ReferenceEquals(scene,_animalScene);
        var active=_adapter.CommittedTelemetryScope;
        bool human=scene is not null&&active?.BiomeId is string humanBiome&&LocalBiomeSelection.HumanSceneFor(humanBiome)==scene.SceneFilePath;
        if(human&&Telemetry.Ready)Telemetry.HumanStarted(active!.GameId,active.BiomeId!,scene!.GetInstanceId().ToString(System.Globalization.CultureInfo.InvariantCulture));
        if(same && Telemetry.Ready && _animalGame is not null && _animalBiome is not null)
            Telemetry.AnimalStarted(_animalGame,_animalBiome,_animalScene!.GetInstanceId().ToString(System.Globalization.CultureInfo.InvariantCulture));
        bool transition=GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado==true;
        bool blocking=same && AnimalSegmentFlow.IsBlocking(this);
        Telemetry.Observe(same||human,tree.Paused,transition||blocking,DisplayServer.WindowIsFocused());
    }
    public void AnimalStarted(Node scene,string game,string biome)
    {
        if(_quitting)return;
        _animalScene=scene;
        _animalGame=game;_animalBiome=biome;
        Telemetry.AnimalStarted(game,biome,scene.GetInstanceId().ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
    public override void _Notification(int what)
    {
        if(what==NotificationWMCloseRequest)_ = QuitAsync();
        if(!_quitting && what==NotificationApplicationFocusOut && IsInsideTree())Telemetry.Observe(true,GetTree().Paused,true,false);
    }
    public Task QuitAsync()=>_quitTask??=QuitCoreAsync();
    private async Task QuitCoreAsync()
    {
        if(_quitting)return;_quitting=true;
        var tree=GetTree();
        if(BeforeStorageClose is not null){try{await Task.WhenAny(BeforeStorageClose(),Task.Delay(3000));}catch{/* sync never blocks quitting */}}
        // Bound telemetry shutdown: gameplay progress is never held hostage by a full/failed queue.
        async Task FinishTelemetry()
        {await Initialization;await _telemetryInitialization;await Telemetry.CloseAsync();}
        var close=FinishTelemetry();
        await Task.WhenAny(close,Task.Delay(3000));
        if(IsInstanceValid(this) && IsInsideTree())
        {
            if(!close.IsCompleted)GD.PushWarning("[Local telemetry] TELEMETRY_CLOSE_TIMEOUT");
            else if(close.IsFaulted)GD.PushWarning("[Local telemetry] TELEMETRY_CLOSE_FAILED");
        }
        // Never start the terminal barrier before all source close writes have completed.
        if(close.IsCompletedSuccessfully && Telemetry.Pending==0)
        {
            var drain=await _adapter.DrainOutboxAsync(System.TimeSpan.FromSeconds(1));
            if(IsInstanceValid(this) && IsInsideTree())
            {
                if(drain.IntegrityFailure)GD.PushError("[Local storage integrity] "+drain.Code);
                else if(!drain.Completed)GD.PushWarning("[Local outbox] "+drain.Code);
                else GD.Print("[Local outbox] OUTBOX_DRAINED");
            }
        }
        else if(IsInstanceValid(this) && IsInsideTree())GD.PushWarning("[Local outbox] OUTBOX_CLOSE_DEFERRED");
        // Teardown can outlive the budget only in managed code; never touch a freed Node.
        async Task DisposeAfterSourceClose()
        {
            try{await close;}catch{/* Source failure was diagnosed; release managed resources. */}
            try{await State.DisposeAsync();}
            catch{System.Threading.Interlocked.Exchange(ref _telemetryDiagnostic,"LOCAL_STORAGE_CLOSE_FAILED");}
            _testStorage?.Dispose();
        }
        Shutdown=DisposeAfterSourceClose();
        await Task.WhenAny(Shutdown,Task.Delay(1000));
        var shutdownCode=System.Threading.Interlocked.Exchange(ref _telemetryDiagnostic,null);
        if(shutdownCode is not null && IsInstanceValid(this) && IsInsideTree())GD.PushWarning("[Local storage] "+shutdownCode);
        if(IsInstanceValid(this) && IsInsideTree())tree.Quit();
    }
    public override void _ExitTree(){_quitting=true;if(_quitTask is null)Shutdown=DisposeStorageAsync();}
    private async Task DisposeStorageAsync(){try{await State.DisposeAsync();}finally{_testStorage?.Dispose();}}
}
