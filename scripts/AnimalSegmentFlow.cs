#nullable enable
using Godot;
using System;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.Network;
using TwoSides.Network.Progress;
using TwoSides.Integration.Sqlite;

// Aviso modal de confirmacion. No guarda datos del recorrido ni credenciales.
public partial class AnimalSegmentFlow : CanvasLayer
{
    public const string BlockingGroup = "animal_operation_blocker";
    private static AnimalSegmentFlow? _active;
    private GameApplicationServices _app = null!;
    private string _biome = "";
    private string? _reason;
    private bool _completion, _start, _busy, _leaving;
    private Label _message = null!;
    private Button _retry = null!;
    private SceneTree _tree = null!;
    private bool _localMode, _localEntryRetry, _resumePaused;
    private bool _localCompletion, _localBiomeConfirmed, _allCompleted, _levelFinishedShown;
    private Button _recovery = null!;
    private string _localCode = "";
    private Node? _entryOwner;
    private int _entryLevel;
    private static WeakReference<Node>? _localScene;
    private static Task<bool>? _localValidation;
    private static bool _localValidated;
    private static int _localEpoch;
    private static readonly LocalAnimalRestart _restart = new();
    private static readonly LocalMenuReturn _levelsReturn = new();
    public static Task<LocalSaveResult<bool>> ReturnToLevelsLocalAsync(Node owner) => ReturnToLevelsCoreAsync(owner,false);
    private static async Task<LocalSaveResult<bool>> ReturnToLevelsCoreAsync(Node owner, bool confirmedCompletion)
    {
        if(!confirmedCompletion && IsBlocking(owner)) return new(false,"PENDING_OPERATION");
        var tree=owner.GetTree();var scene=tree.CurrentScene;
        bool Alive()=>IsInstanceValid(owner) && owner.IsInsideTree() && IsInstanceValid(scene) && ReferenceEquals(tree.CurrentScene,scene);
        try
        {
            var context=owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
            if(context is null) return new(false,"STORAGE_CLOSED");
            await context.Initialization;
            if(!Alive()) return new(false,"STORAGE_CLOSED");
            const string destination=LocalMenuReturn.SelectionDestination;
            if(!ResourceLoader.Exists(destination,"PackedScene")) return new(false,"SCENE_UNAVAILABLE");
            var packed=GD.Load<PackedScene>(destination);
            if(packed is null) return new(false,"SCENE_UNAVAILABLE");
            bool changed=await _levelsReturn.ReturnToSelectionAsync(context.State,tree.Paused,
                paused=>{if(Alive()) tree.Paused=paused;},
                ()=>
                {
                    if(!Alive() || GetTransitionBusy(owner) || !context.State.CanEnterSelection)return Task.FromResult(false);
                    context.Telemetry.Loading();
                    bool changed=tree.ChangeSceneToPacked(packed)==Error.Ok;
                    if(changed)context.Telemetry.Leave();
                    return Task.FromResult(changed);
                });
            return new(changed,_levelsReturn.Code,changed);
        }
        catch { return new(false,"STORAGE_ERROR"); }
    }
    public static string LevelsReturnMessage(string code)=>code=="SCENE_UNAVAILABLE"
        ? $"No se pudo cargar la selección: {LocalMenuReturn.SelectionDestination}. Tu progreso se conserva."
        : code==_levelsReturn.Code ? _levelsReturn.Message : LocalAnimalEntryReader.MessageFor(code);
    public static async Task<LocalSaveResult<bool>> RestartLocalAsync(Node owner)
    {
        if (_restart.Busy || IsBlocking(owner)) return new(false,"PENDING_OPERATION");
        var tree=owner.GetTree();
        var scene=tree.CurrentScene;
        bool wasPaused=tree.Paused;
        bool Alive()=>IsInstanceValid(owner) && owner.IsInsideTree() && IsInstanceValid(scene) && ReferenceEquals(tree.CurrentScene,scene);
        try
        {
            var context=owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
            if(context is null || scene is null) return new(false,"STORAGE_CLOSED");
            await context.Initialization;
            if(!Alive()) return new(false,"STORAGE_CLOSED");
            PackedScene? packed=null;
            bool changed=await _restart.RestartAsync(context.State,scene.SceneFilePath,
                path=>Alive() && ResourceLoader.Exists(path,"PackedScene") && (packed=GD.Load<PackedScene>(path)) is not null,
                (confirmed,path)=>
                {
                    if(!Alive() || packed is null || GetTransitionBusy(owner)) return Task.FromResult(false);
                    context.Telemetry.Loading();
                    bool previousEnvironment=VariablesGlobales.BiomaSaludable;
                    if(previousEnvironment!=confirmed.Healthy) VariablesGlobales.BiomaSaludable=confirmed.Healthy;
                    tree.Paused=false;
                    try
                    {
                        if(tree.ChangeSceneToPacked(packed)==Error.Ok) return Task.FromResult(true);
                    }
                    catch
                    {
                        VariablesGlobales.BiomaSaludable=previousEnvironment;
                        if(Alive()) tree.Paused=wasPaused;
                        throw;
                    }
                    VariablesGlobales.BiomaSaludable=previousEnvironment;
                    if(Alive()) tree.Paused=wasPaused;
                    return Task.FromResult(false);
                });
            if(!changed)context.Telemetry.NavigationFailed();
            return new(changed,_restart.Code,changed);
        }
        catch { if(Alive()) tree.Paused=wasPaused;return new(false,"STORAGE_ERROR"); }
    }
    private static bool GetTransitionBusy(Node owner)=>owner.GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado==true;
    public static string RestartMessage(string code)=>code==_restart.Code ? _restart.Message : LocalAnimalEntryReader.MessageFor(code);
    private static bool SameLocalScene(Node scene) => _localScene is not null && _localScene.TryGetTarget(out var existing) &&
        IsInstanceValid(existing) && ReferenceEquals(scene,existing);
    public static Task<bool> ValidateLocalEntryAsync(Node owner, int expectedLevel)
    {
        var scene=owner.GetTree().CurrentScene;
        if (scene is null || (scene!=owner && !scene.IsAncestorOf(owner))) scene=owner.Owner;
        if (scene is null) return Task.FromResult(false);
        if (SameLocalScene(scene))
        {
            if (_localValidated) return Task.FromResult(true);
            if (_localValidation is {IsCompleted:false}) return _localValidation;
        }
        _localScene=new(scene);_localValidated=false;
        int epoch=++_localEpoch;
        return _localValidation=ValidateLocalCore(owner,scene,expectedLevel,epoch);
    }
    private static async Task<bool> ValidateLocalCore(Node owner, Node scene, int expectedLevel, int epoch)
    {
        var tree=owner.GetTree();
        bool wasPaused=_active is not null && IsInstanceValid(_active) && _active._localMode ? _active._resumePaused : tree.Paused;
        tree.Paused=true;
        bool Alive()=>epoch==_localEpoch && IsInstanceValid(owner) && owner.IsInsideTree() && IsInstanceValid(scene) && scene.IsInsideTree() && ReferenceEquals(tree.CurrentScene,scene);
        string biome=LocalBiomeSelection.BiomeFor(expectedLevel) ?? "";
        try
        {
            if (LocalBiomeSelection.AnimalSceneFor(biome)!=scene.SceneFilePath)
            { ShowLocalFailure(owner,biome,expectedLevel,"INVALID_BIOME_SCENE",wasPaused);return false; }
            var context=owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
            if (context is null) { ShowLocalFailure(owner,biome,expectedLevel,"STORAGE_CLOSED",wasPaused);return false; }
            await context.Initialization;
            if (!Alive()) return false;
            var read=await context.State.ReadAnimalEntryAsync(biome);
            if (!Alive()) return false;
            if (!read.Success || read.Data is null)
            { ShowLocalFailure(owner,biome,expectedLevel,read.Code,wasPaused);return false; }
            // Never project late in Ready: visual/actor initialization has already consumed this value.
            if (!LocalAnimalEntryReader.MatchesPreparedEnvironment(read.Data,VariablesGlobales.BiomaSaludable))
            { ShowLocalFailure(owner,biome,expectedLevel,"ENVIRONMENT_NOT_PREPARED",wasPaused);return false; }
            _localValidated=true;
            if (_active is not null && IsInstanceValid(_active) && _active._localMode)
            {
                var flow=_active;_active=null;flow._leaving=true;flow._resumePaused=wasPaused;flow.QueueFree();
            }
            tree.Paused=wasPaused;
            context.AnimalStarted(scene,read.Data.GameId,biome);
            return true;
        }
        catch
        {
            if (Alive()) ShowLocalFailure(owner,biome,expectedLevel,"STORAGE_ERROR",wasPaused);
            return false;
        }
    }
    private static void ShowLocalFailure(Node owner,string biome,int expectedLevel,string code,bool wasPaused)
    {
        if (_active is not null && IsInstanceValid(_active))
        {
            if (_active._localMode)
            {
                _active._localCode=code;
                if (_active._message is not null) _active._message.Text=LocalAnimalEntryReader.MessageFor(code);
            }
            return;
        }
        owner.GetTree().Paused=true;
        var flow=new AnimalSegmentFlow{_localMode=true,_localEntryRetry=code!="LOCAL_OPERATION_UNSUPPORTED",_localCode=code,
            _resumePaused=wasPaused,_entryOwner=owner,_entryLevel=expectedLevel,_biome=biome,_start=false};
        _active=flow;flow.AddToGroup(BlockingGroup);
        (owner.GetTree().CurrentScene ?? owner.Owner).CallDeferred(Node.MethodName.AddChild,flow);
    }
    public static string? BiomeForScene(Node owner)
    {
        string path = owner.GetTree().CurrentScene?.SceneFilePath ?? "";
        foreach (string biome in new[] { "ocean", "jungle", "desert", "forest", "tundra" })
            if (BiomeCardController.SceneFor(biome, true) == path) return biome;
        return null;
    }
    public static bool IsBlocking(Node owner)
    {
        if (_restart.Busy || _levelsReturn.Busy) return true;
        if (_active is not null && IsInstanceValid(_active)) return true;
        var context=owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext");
        if (context?.Local is not null)
        {
            var scene=owner.GetTree().CurrentScene;
            return scene is null || !SameLocalScene(scene) || !_localValidated;
        }
        return context?.Services?.Animals.BlocksGameplay==true || context?.Services?.Connectivity.BlocksOperations==true;
    }
    public static void Open(Node owner, string biome, bool completion, string? reason = null, bool start = true)
    {
        if (_active is not null && IsInstanceValid(_active)) return;
        // Local context never falls back to remote completion/restart.
        if (owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local is not null)
        {
            if(completion)
            {
                if(IsBlocking(owner))return;
                var localFlow=new AnimalSegmentFlow{_localMode=true,_localCompletion=true,_entryOwner=owner,_biome=biome,_resumePaused=false};
                _active=localFlow;localFlow.AddToGroup(BlockingGroup);
                owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")!.Local!.Telemetry.Loading();
                owner.GetTree().Paused=true;
                owner.GetTree().CurrentScene.CallDeferred(Node.MethodName.AddChild,localFlow);
                return;
            }
            ShowLocalFailure(owner,biome,-1,"LOCAL_OPERATION_UNSUPPORTED",owner.GetTree().Paused);
            return;
        }
        var app = owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Services;
        if (app is null) { owner.GetTree().Paused = true; return; }
        owner.GetTree().Paused = true;
        var flow = new AnimalSegmentFlow { _app = app, _biome = biome, _completion = completion, _reason = reason, _start = start };
        _active = flow;
        // Reservar el grupo antes de la insercion diferida evita dos avisos en el mismo frame.
        flow.AddToGroup(BlockingGroup);
        owner.GetTree().CurrentScene.CallDeferred(Node.MethodName.AddChild, flow);
    }
    public override void _Ready()
    {
        _tree = GetTree();
        ProcessMode = ProcessModeEnum.Always; Layer = 80;
        var root = new ColorRect { Color = new Color(0.05f, 0.08f, 0.06f, 0.97f), MouseFilter = Control.MouseFilterEnum.Stop };
        AddChild(root); root.SetAnchorsAndOffsetsPreset(Control.LayoutPreset.FullRect);
        var center = new CenterContainer(); root.AddChild(center); center.SetAnchorsAndOffsetsPreset(Control.LayoutPreset.FullRect);
        var box = new VBoxContainer { CustomMinimumSize = new Vector2(450, 0) }; center.AddChild(box);
        _message = new Label { Text = "Confirmación pendiente. El juego permanece detenido.", CustomMinimumSize = new Vector2(450, 80), AutowrapMode = TextServer.AutowrapMode.WordSmart };
        box.AddChild(_message);
        _retry = new Button { Text = "Reintentar la misma operación" }; box.AddChild(_retry); _retry.Pressed += Retry;
        var recovery = new Button { Text = _localCompletion ? "Recuperar selección local" : _localMode ? "Volver al menú" : "Ir a recuperación / iniciar sesión" }; box.AddChild(recovery); recovery.Pressed += Recovery; _recovery = recovery;
        if (_localMode)
        {
            if(_localCompletion){CallDeferred(nameof(ConfirmLocalCompletion));return;}
            _message.Text=LocalAnimalEntryReader.MessageFor(_localCode);
            _retry.Visible=_localEntryRetry;
            _retry.Disabled=_localCode=="ENVIRONMENT_NOT_PREPARED";
        }
        else if (_start) CallDeferred(nameof(Start));
    }
    private async void Start()
    {
        if (_busy || _leaving) return;
        _busy = true; _retry.Disabled = true; _message.Text = "Confirmando con el servidor. No cierres la operación…";
        var service = _app.Animals;
        var result = service.Pending is not null ? await service.RetryAsync()
            : _completion ? await service.CompleteAsync(_biome) : await service.RestartAsync(_biome, _reason ?? "");
        if (!IsInstanceValid(this) || !IsInsideTree() || _leaving) return;
        _busy = false; _retry.Disabled = false;
        if (!result.IsSuccess || !service.CanApply())
        {
            _message.Text = result.Failure switch {
                ApiFailure.Unauthorized => "Inicia sesión de nuevo. No se puede continuar.",
                ApiFailure.RateLimited => "Demasiadas solicitudes. Espera Retry-After antes de reintentar.",
                ApiFailure.Conflict => "El estado cambió. Recupera el progreso antes de continuar.",
                _ => "No se pudo confirmar. El juego sigue detenido. Reintenta explícitamente o ve a recuperación."
            };
            return;
        }
        bool restart = service.Pending?.Operation == "animal_restart";
        string? environment = result.Data?.Biome.EnvironmentState;
        string destination = restart ? BiomeCardController.SceneFor(_biome, true)! : _app.Endings.ConfirmedEnding is not null
            ? "res://scenes/levels/Final.tscn" : "res://scenes/auth/recuperacion_partida.tscn";
        if (!ResourceLoader.Exists(destination, "PackedScene")) { _message.Text = "No se pudo cargar la escena. La confirmación se conserva."; return; }
        var transition = GetNodeOrNull<Transicion>("/root/Transicion");
        bool Prepare()
        {
            if (_leaving || !IsInstanceValid(this) || !IsInsideTree() || !service.CanApply()) return false;
            if (restart) VariablesGlobales.BiomaSaludable = environment == "healthy";
            return true;
        }
        _busy = true; _retry.Disabled = true;
        bool ChangeDirect()
        {
            if (!Prepare() || GetTree().ChangeSceneToFile(destination) != Error.Ok) return false;
            service.Acknowledge(); return true;
        }
        bool changed = transition is not null
            ? await transition.CambiarEscenaValidadaAsync(destination, Prepare, () => service.Acknowledge()) : ChangeDirect();
        if (!IsInstanceValid(this) || !IsInsideTree()) return;
        _busy = false; _retry.Disabled = false;
        if (!changed) _message.Text = "No se pudo cambiar de escena. La confirmación se conserva para reintentar.";
    }
    private async void Retry()
    {
        if (_busy) return;
        if (_localCompletion){ConfirmLocalCompletion();return;}
        if (_localMode)
        {
            if (!_localEntryRetry || _entryOwner is null || !IsInstanceValid(_entryOwner)) return;
            _busy=true;_retry.Disabled=true;
            await ValidateLocalEntryAsync(_entryOwner,_entryLevel);
            if (IsInstanceValid(this) && IsInsideTree()) { _busy=false;_retry.Disabled=_localCode=="ENVIRONMENT_NOT_PREPARED"; }
            return;
        }
        Start();
    }
    private void Recovery()
    {
        if (_leaving || !IsInsideTree() || GetNodeOrNull<Transicion>("/root/Transicion")?.Ocupado == true) return;
        if (_localMode)
        {
            if (_busy) return;
            if (_localCompletion){ConfirmLocalCompletion();return;}
            _leaving=true;_resumePaused=false;_localValidated=false;++_localEpoch;
            if (_tree.ChangeSceneToFile("res://assets/sprites/ui/menu_principal.tscn")==Error.Ok) _tree.Paused=false;
            else { _leaving=false;_message.Text="No se pudo abrir el menú. Los datos se conservan."; }
            return;
        }
        string path = _app.Session.IsAuthenticated ? "res://scenes/auth/recuperacion_partida.tscn" : "res://scenes/auth/login.tscn";
        var tree = _tree;
        if (!IsInstanceValid(tree)) return;
        _leaving = true;
        if (tree.ChangeSceneToFile(path) == Error.Ok) tree.Paused = false;
        else { _leaving = false; _message.Text = "No se pudo abrir la recuperación. La operación pendiente se conserva."; }
    }
    private async void ConfirmLocalCompletion()
    {
        if(_busy || _leaving || _entryOwner is null || !IsInstanceValid(_entryOwner))return;
        _busy=true;_retry.Disabled=true;
        try
        {
            var context=GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local;
            if(context is null){_message.Text="SQLite local no está disponible. No se confirmó la finalización.";return;}
            if(!_localBiomeConfirmed)
            {
                var result=await context.State.CompleteAnimalAsync(_biome);
                if(!IsInstanceValid(this) || !IsInsideTree())return;
                if(!result.Success || result.Data is null)
                {_message.Text="No se pudo verificar la finalización local ("+result.Code+"). Reintenta la misma operación; el progreso guardado se conserva.";return;}
                _localBiomeConfirmed=true;_allCompleted=result.Data.AllCompleted;
                try{context.Telemetry.CompletionConfirmed(result.Data.Receipt.OperationId,result.Data.Receipt.GameId!,_biome);}
                catch{GD.PushWarning("[Local telemetry] TELEMETRY_COMPLETION_MISSING");}
            }
            if(_allCompleted)
            {
                bool opened=await context.State.NavigateFinalAsync(()=>Task.FromResult(IsInstanceValid(this) && IsInsideTree() &&
                    !GetTransitionBusy(this) && _tree.ChangeSceneToFile(LocalGameState.FinalDestination)==Error.Ok));
                if(!IsInstanceValid(this) || !IsInsideTree())return;
                if(!opened)
                {_message.Text="Los cinco biomas se conservan. No se pudo preparar o abrir el final local ("+context.State.Code+"). Reintenta o utiliza Continuar al reiniciar; no volverás a jugar el quinto bioma.";return;}
                _tree.Paused=false;_leaving=true;return;
            }
            // Visual only: the completion is already saved and its telemetry recorded above. The player confirms before returning to the selection
            // (the tree stays paused and the telemetry state stays Loading, so the time spent here is not effective gameplay time).
            if(!_levelFinishedShown){ShowLevelFinished(context);return;}
            var navigation=await ReturnToLevelsCoreAsync(this,confirmedCompletion:true);
            if(IsInstanceValid(this) && IsInsideTree() && !navigation.Success)
                _message.Text="Finalización guardada. No se pudo abrir la selección ("+navigation.Code+"). Reintenta; no se volverá a completar el bioma.";
        }
        catch{if(IsInstanceValid(this) && IsInsideTree())_message.Text="Error local de recuperación. Reintenta; los datos confirmados se conservan.";}
        finally{if(IsInstanceValid(this) && IsInsideTree()){_busy=false;_retry.Disabled=false;}}
    }
    private void ShowLevelFinished(GamePersistenceContext context)
    {
        _levelFinishedShown=true;
        string name=_biome switch{"ocean"=>"Océano","jungle"=>"Selva","desert"=>"Desierto","forest"=>"Bosque","tundra"=>"Tundra",_=>"Bioma"};
        string state=context.State.ActiveGame?.Environments.FirstOrDefault(e=>e.BiomeId==_biome)?.StateKind switch{"healthy"=>"saludable","degraded"=>"degradado",_=>""};
        _message.HorizontalAlignment=HorizontalAlignment.Center;
        _message.Text="Nivel terminado"+System.Environment.NewLine+name+(state.Length>0?System.Environment.NewLine+"Estado del ecosistema: "+state:"");
        _retry.Text="Continuar";
        _recovery.Visible=false;
    }
    public override void _ExitTree()
    {
        _leaving = true;
        if (ReferenceEquals(_active, this)) _active = null;
        if (IsInstanceValid(_tree) && (!_localMode || !_resumePaused)) _tree.Paused = false;
    }
}
