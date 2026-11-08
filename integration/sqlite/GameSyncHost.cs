#nullable enable
using Godot;
using System;
using System.Threading.Tasks;
using TwoSides.Integration.SyncHttp;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

// The single owner of synchronization. It is a child of the existing GameApplicationContext autoload (not a second autoload, not part of any
// biome scene), so changing scenes cannot create, duplicate or stop it. Normal sync uses the configured HTTPS main API;
// explicit test flags mean HTTP loopback or HTTPS localhost with mandatory disposable storage. Work runs off the main thread.
public partial class GameSyncHost : Node
{
    private const double TickSeconds=2.0;
    private GamePersistenceContext _local=null!;
    private SyncWorkerLifecycle _lifecycle=null!;
    private readonly SyncSessionGate _gate=new();
    private Task _tick=Task.CompletedTask;
    private double _elapsed;
    private string _lastReport="";
    private volatile string? _pendingReport;
    private bool _testStorage;
    private StatisticsTransport? _statisticsTransport;
    public bool Enabled=>_statisticsTransport is not null||_lifecycle?.Enabled==true;
    public SyncWorkerLifecycle Lifecycle=>_lifecycle;
    // B79: an explicitly authorized composition must supply consent, endpoint and installation credential provider.
    // No URL, token, environment file or automatic enrollment is inferred by the distributed game.
    public void ConfigureStatisticsForAuthorizedRun(bool consent,Func<IStatisticsDeliveryStore,StatisticsTransport> factory)
    {
        if(!consent||_local is null||_lifecycle is null||_lifecycle.Enabled||_statisticsTransport is not null||!_tick.IsCompleted)
            throw new InvalidOperationException("Statistics activation rejected");
        _statisticsTransport=factory(_local.StatisticalDelivery);
        _local.BeforeStorageClose=StopForShutdownAsync;SetProcess(true);
    }

    public void Bind(GamePersistenceContext local)
    {
        _local=local;
        var args=OS.GetCmdlineUserArgs();
        var testStorage=SyncTestStorageMode.FromArguments(args);
        if(testStorage==SyncTestStorageRequest.Invalid)throw new InvalidOperationException("Invalid test storage request.");
        _testStorage=testStorage==SyncTestStorageRequest.Sandbox;
        var localOptions=SyncLocalMode.FromArguments(args);
        var mainOptions=_testStorage?SyncMainMode.FromConfiguration(ProjectSettings.GetSetting("two_sides/sync/main_api_url","").AsString(),args):null;
        var options=localOptions??mainOptions;
        // B77: legacy Sync v2 remains available only for explicit synthetic compatibility checks.
        // No full-save transport is authorized for the statistics-only production architecture.
        if(!_testStorage){options=null;mainOptions=null;}
        // Sandbox runs keep credentials in memory only (nothing persistent is created next to disposable data). Otherwise credentials are
        // protected with DPAPI (CurrentUser) under the game's user data folder.
        ISyncSecretStore? store=null;
        string secretDirectory=mainOptions is null?"user://sync-credentials":"user://sync-credentials-main-v2/"+SyncMainMode.CredentialNamespace(mainOptions);
        Func<ISyncSecretStore>? secrets=_testStorage?null:()=>store??=new DpapiSyncSecretStore(ProjectSettings.GlobalizePath(secretDirectory));
        _lifecycle=new SyncWorkerLifecycle(options,()=>_local.SyncStorage,secrets,requireUnconfirmedDestination:mainOptions is not null);
        if(options is null)SetProcess(false);
        else
        {
            if(mainOptions is null)GD.PushWarning("[Sync] Local test synchronization enabled: "+localOptions!.BaseUri.AbsoluteUri);
            else GD.Print("[Sync] Main synchronization configured (HTTPS).");
            // The Outbox must stop before the local database closes, and nothing may resume afterwards.
            _local.BeforeStorageClose=StopForShutdownAsync;
        }
    }

    public override void _Process(double delta)
    {
        var report=_pendingReport;
        if(report is not null){_pendingReport=null;GD.Print(report);}
        if(!_tick.IsCompleted)return;
        _elapsed+=delta;if(_elapsed<TickSeconds)return;_elapsed=0;
        if(_statisticsTransport is not null){
            if(!_gate.Evaluate(_local.State.Ready&&_local.State.Profile is not null,true))return;
            var statistics=_statisticsTransport;
            _tick=Task.Run(async()=>{try{await statistics.TickAsync();}catch{/* never blocks the scene loop */}});return;
        }
        // Evaluated on the main thread, where the Godot state lives; the work itself runs off it.
        bool session=_gate.Evaluate(_local.State.Ready&&_local.State.Profile is not null,_local.SyncStorage is not null);
        var lifecycle=_lifecycle;var storage=_testStorage?_local.SyncStorage:null;
        _tick=Task.Run(async()=>
        {
            try
            {
                string code=await lifecycle.TickAsync(session);
                if(storage is null)return;
                // Sanitized validation line: fixed codes and counts only, never ids, payloads, tokens or paths.
                string line="[Sync-Test] code="+code+";workers="+lifecycle.WorkersCreated+"/"+lifecycle.WorkersStopped+";passes="+(lifecycle.WorkerDiagnostic?.Passes??0)
                    +";worker="+(lifecycle.WorkerDiagnostic?.Code??"none")+";"+SyncOutboxCounts.Read(storage);
                if(line!=_lastReport){_lastReport=line;_pendingReport=line;}
            }
            catch(Exception){/* never reaches the frame loop */}
        });
    }

    // Logout: the worker stops now; local data and pending operations are untouched. Nothing restarts until BeginSession.
    public void EndSession(){_gate.End();_=Task.Run(async()=>{try{await _tick;}catch{}await _lifecycle.StopAsync(TimeSpan.FromSeconds(2));});}

    // Explicit sign-out of this device: stops sync and deletes the protected credential (see SyncWorkerLifecycle.ForgetCredentialAsync).
    // Plain Logout() does NOT call this: forgetting the credential would make the existing server account unreachable.
    public Task ForgetCredentialAsync(){_gate.End();return Task.Run(async()=>{try{await _tick;}catch{}await _lifecycle.ForgetCredentialAsync();});}

    // Login / entering the local menu. Ignored once the game is closing; the next tick still requires an open database and a loaded profile.
    public void BeginSession()=>_gate.Begin();

    private Task StopForShutdownAsync()
    {
        _gate.Close();
        return Task.Run(async()=>{if(_statisticsTransport is not null)await _statisticsTransport.DisposeAsync();try{await _tick;}catch{}await _lifecycle.StopAsync(TimeSpan.FromSeconds(2));});
    }

    public override void _ExitTree(){_gate.Close();if(_statisticsTransport is not null)_=_statisticsTransport.DisposeAsync().AsTask();if(_lifecycle is not null)_=_lifecycle.DisposeAsync().AsTask();}
}
