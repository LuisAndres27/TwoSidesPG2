#nullable enable
using Godot;
using System;
using System.Threading.Tasks;

namespace TwoSides.Network;

// Autoload: no pertenece a CurrentScene y no inicia solicitudes al construirse.
public partial class GameApplicationContext : Node
{
    public GameApplicationServices Services { get; private set; } = null!;
    public TwoSides.Integration.Sqlite.GamePersistenceContext Local { get; private set; } = null!;
    public TwoSides.Integration.Sqlite.GameSyncHost Sync { get; private set; } = null!;
    private OceanDecisionContext? _decisionContext;

    public override void _Ready()
    {
        if (GetParent() != GetTree().Root || GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext") != this ||
            GetNodeOrNull<Node>("/root/OceanDecisionContext") is not null)
            throw new InvalidOperationException("El contexto requiere un unico autoload de aplicacion.");
        Local = new TwoSides.Integration.Sqlite.GamePersistenceContext { Name = "LocalPersistence" };
        AddChild(Local);
        Sync = new TwoSides.Integration.Sqlite.GameSyncHost { Name = "SyncHost" };
        AddChild(Sync);
        Sync.Bind(Local);
    }

    // Retained for a separately authorized synchronization phase; never required by local startup.
    private void InitializeRemoteServices()
    {
        var api = new ApiClient { Name = "ApiClient" };
        AddChild(api);
        var supervised = new SupervisedApiClient(api);
        var journal = new PendingOperationStore(ProjectSettings.GlobalizePath("user://pending-operations"));
        var persistent = new PersistentApiClient(supervised, journal);
        Services = new GameApplicationServices(persistent, connectivityIntervalSeconds: api.Configuration.CheckIntervalSeconds, journal: journal);
        persistent.Attach(Services);
        supervised.Attach(Services.Connectivity);
        var supervisorUi = new ConnectivityOverlay { Name = "ConnectivityOverlay" };
        supervisorUi.Configure(Services);
        AddChild(supervisorUi);
        _decisionContext = new OceanDecisionContext { Name = "OceanDecisionContext" };
        _decisionContext.Bind(Services);
        // Fachada persistente para las rutas que ya utilizan las escenas.
        GetTree().Root.CallDeferred(Node.MethodName.AddChild, _decisionContext);
    }

    // Local session boundaries for synchronization. Logout ends it (the worker stops; local data and pending operations stay);
    // BeginLocalSession is called when a player enters the local menu or logs in, and only resumes with an open profile.
    public void Logout() { Services?.Logout(); Sync?.EndSession(); }
    public void BeginLocalSession() => Sync?.BeginSession();
    public Task SignOutAndForgetSyncCredential() => Sync?.ForgetCredentialAsync() ?? Task.CompletedTask;

    public override void _ExitTree()
    {
        if (_decisionContext is not null && GodotObject.IsInstanceValid(_decisionContext))
        {
            _decisionContext.Detach();
            _decisionContext.QueueFree();
        }
        _decisionContext = null;
        Services?.Dispose();
    }
}
