#nullable enable
using System;
using System.Collections.Generic;
using TwoSides.Network.Progress;
using TwoSides.Network.Services;
using TwoSides.Network.Session;
using TwoSides.Network.Entry;

namespace TwoSides.Network;

// Composicion independiente del motor: el autoload es su unico propietario.
public sealed class GameApplicationServices : IDisposable
{
    private readonly Dictionary<string, EnvironmentalDecisionService> _decisions = new();
    private bool _disposed;
    public IApiClient Api { get; }
    public AuthService Auth { get; }
    public SessionManager Session { get; }
    public GameStateStore Progress { get; }
    public GameService Games { get; }
    public OceanDecisionService Ocean { get; }
    public EntryFlowCoordinator Entry { get; }
    public BiomeMenuAccessGate BiomeMenu { get; }
    public AnimalProgressService Animals { get; }
    public EndingService Endings { get; }
    public ConnectivitySupervisor Connectivity { get; }
    public PendingOperationStore? Journal { get; }
    public PendingReconciliation Reconciliation { get; }

    public GameApplicationServices(IApiClient api, Func<DateTimeOffset>? utcNow = null, double connectivityIntervalSeconds = ApiConfiguration.ConnectionCheckIntervalSeconds, PendingOperationStore? journal = null)
    {
        Api = api ?? throw new ArgumentNullException(nameof(api));
        Journal = journal;
        Reconciliation = new PendingReconciliation(this);
        Auth = new AuthService(Api);
        Session = new SessionManager(Auth, utcNow);
        Progress = new GameStateStore(Session);
        Games = new GameService(Api, Session, Progress);
        Entry = new EntryFlowCoordinator(this);
        BiomeMenu = new BiomeMenuAccessGate(Entry, () => Reconciliation.HasBlocking);
        Animals = new AnimalProgressService(this);
        Endings = new EndingService(this);
        Connectivity = new ConnectivitySupervisor(this, connectivityIntervalSeconds, utcNow);
        Ocean = new OceanDecisionService(Api, Session, Progress, Games, journal);
        _decisions.Add("ocean", Ocean);
        foreach (var biome in new[] { "jungle", "desert", "forest", "tundra" })
            _decisions.Add(biome, new EnvironmentalDecisionService(Api, Session, Progress, Games, biome, DecisionCatalog.ForBiome(biome), journal));
    }

    public EnvironmentalDecisionService? ForBiome(string biomeId)
        => !_disposed && _decisions.TryGetValue(biomeId, out var service) ? service : null;

    public void Logout()
    {
        Reconciliation.ClearMemory();
        BiomeMenu.Clear();
        Animals.Clear();
        Endings.Clear();
        Session.Logout();
        foreach (var service in _decisions.Values) service.ClearPending();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Entry.Dispose();
        Connectivity.Dispose();
        Animals.Dispose();
        Endings.Dispose();
        Logout();
        foreach (var service in _decisions.Values) service.Dispose();
        Progress.Dispose();
    }
}
