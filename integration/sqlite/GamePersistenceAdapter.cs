#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

public sealed record LocalSaveResult<T>(bool Success, string Code, T? Data = default, SaveReceipt? Receipt = null);
public sealed record ProfileCreationRequest(string OperationId, string LocalPlayerId, string DisplayName);
public sealed record LocalTelemetryScope(string GameId,string? BiomeId);

// Scene-free facade for the basic real-save subphase, compiled by the Godot C# project.
// Reuses ISaveDatabase/GameSaveService and the existing infrastructure adapter's serial-worker pattern.
// No scenes, synthetic-store access, HTTP or environmental game code are executed here.
public sealed class GamePersistenceAdapter : ILocalMenuStore, ILocalBiomeStore, ILocalDecisionStore, ILocalAnimalStore, ILocalCompletionStore, ILocalFinalStore, ILocalStatisticsReader, IGameplayTelemetryStore,IStatisticalSessionSource,IStatisticsDeliveryStore
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private ISaveDatabase? _database;
    private readonly SyntheticDatabase? _syntheticOutbox;
    private GameSaveService? _service;
    private StatisticsService? _statistics;
    private GameplayEventService? _events;
    private StatisticsTelemetry? _statistical;
    private string _statisticalCode="STATISTICS_INACTIVE";
    private readonly bool _statisticsSynthetic;
    private LocalTelemetryScope? _telemetryScope;
    public LocalTelemetryScope? CommittedTelemetryScope=>Volatile.Read(ref _telemetryScope);
    public string? StatisticalSessionId=>_statistical?.SessionId;
    public string StatisticalDiagnostic=>_statisticalCode is "STATISTICS_INITIALIZATION_FAILED" or "STATISTICS_RECONCILIATION_PENDING"?_statisticalCode:_statistical?.Diagnostic??_statisticalCode;
    public StatisticsTelemetry? StatisticalOutbox=>_statistical;
    private LocalOutboxPump? _outboxPump;
    private LocalOutboxScheduler? _outbox;
    private int _closing;
    // Read-only handle for the optional local-test synchronization worker; null once closing starts.
    public ISaveDatabase? SyncStorage=>Volatile.Read(ref _closing)==0&&!_production&&!_statisticsSynthetic?_database:null;
    public LocalOutboxDiagnostic OutboxDiagnostic=>_outbox?.Diagnostic??new(_production||_statisticsSynthetic?(_statistical is null?"STATISTICS_NOT_READY":"OUTBOX_LOCAL_READY"):"OUTBOX_INACTIVE",false,0,0,false);
    public void RequestOutboxReconciliation()=>_outbox?.Request();
    // Source close must finish before this barrier. In-flight writes finish under the same gate.
    public Task<LocalOutboxDrain> DrainOutboxAsync(TimeSpan budget)
    {
        Interlocked.Exchange(ref _closing,1);
        return _outbox?.DrainAsync(budget)??DrainStatisticsAsync(budget);
    }
    private async Task<LocalOutboxDrain> DrainStatisticsAsync(TimeSpan budget)
    {
        if(!_production&&!_statisticsSynthetic)return new("OUTBOX_INACTIVE",false,false,0);
        await _gate.WaitAsync().ConfigureAwait(false);
        try{
            if(_statistical is null)return new("STATISTICS_NOT_READY",false,false,0);
            return await Task.Run(()=>{
                var elapsed=System.Diagnostics.Stopwatch.StartNew();
                do{_statistical.ReconcileGameplay(512);if(elapsed.Elapsed>budget)return new LocalOutboxDrain("OUTBOX_CLOSE_DEFERRED",false,false,0);}while(_statistical.HasUnprojectedGameplay());
                return new LocalOutboxDrain("OUTBOX_DRAINED",true,false,0);
            }).ConfigureAwait(false);
        }
        catch{_statisticalCode="STATISTICS_RECONCILIATION_PENDING";return new("OUTBOX_CLOSE_DEFERRED",false,false,0);}
        finally{_gate.Release();}
    }
    private GameplayEventService Events=>_events??=new GameplayEventService(_database??throw new SaveException("STORAGE_CLOSED"));
    public Task<LocalSaveResult<IReadOnlyList<GameplaySession>>> ReadSessionsAsync(string owner)=>Execute(()=>new LocalSaveResult<IReadOnlyList<GameplaySession>>(true,"SESSIONS",Events.GetSessions(owner)));
    public Task<LocalSaveResult<GameplayWriteReceipt>> WriteEventAsync(GameplayEvent value)=>Execute(()=>new LocalSaveResult<GameplayWriteReceipt>(true,"EVENT",Events.RecordEvent(value)));
    public Task<LocalSaveResult<GameplayWriteReceipt>> WriteIntervalAsync(GameplayInterval value)=>Execute(()=>new LocalSaveResult<GameplayWriteReceipt>(true,"INTERVAL",Events.RecordInterval(value)));
    public Task<LocalSaveResult<GameplayWriteReceipt>> InterruptAsync(string owner,string session,string eventId,DateTimeOffset discovered)=>Execute(()=>new LocalSaveResult<GameplayWriteReceipt>(true,"INTERRUPTED",Events.InterruptSession(owner,session,eventId,discovered)));
    private bool _disposed;
    private readonly IBiomeAvailabilityPolicy? _availability;
    private readonly bool _runtime,_production;
    // runtime: the developer's historical store (kept for existing checks only; the game does not use it). production: the per-user player store.
    public GamePersistenceAdapter(IBiomeAvailabilityPolicy? availability = null, bool runtime = false, bool production = false)
    { if(runtime&&production)throw new ArgumentException("Choose one store.");_availability=availability; _runtime=runtime; _production=production; }
    private GamePersistenceAdapter(SyntheticDatabase syntheticOutbox){_syntheticOutbox=syntheticOutbox;}
    private GamePersistenceAdapter(SyntheticDatabase database,bool statistics){_syntheticOutbox=database;_statisticsSynthetic=statistics;}
    // Explicit fresh synthetic capability for integration tests. Never accepts an arbitrary fixture path.
    public static GamePersistenceAdapter CreateSyntheticOutboxAdapter(SyntheticDatabase database)=>new(database);
    public static GamePersistenceAdapter CreateSyntheticStatisticsAdapter(SyntheticDatabase database)=>new(database,true);
    public static string StoragePath => CopyGameDatabase.AuthorizedPath;
    public static string RuntimeStoragePath => CopyGameDatabase.RuntimePath;
    public static string ProductionStoragePath => CopyGameDatabase.ProductionPath;

    // Prepare once per explicit intent; retain these immutable requests for retries.
    public static ProfileCreationRequest PrepareProfileCreation(string displayName) =>
        new(Guid.NewGuid().ToString("D"), Guid.NewGuid().ToString("D"), SaveValidation.Name(displayName));
    public static NewGameCommand PrepareNewGame(string owner, SavedGame? expectedCurrent = null)
    {
        SaveValidation.Id(owner);
        if (expectedCurrent is not null) SaveValidation.Require(expectedCurrent.LocalPlayerId == owner);
        return new(Guid.NewGuid().ToString("D"), owner, Guid.NewGuid().ToString("D"),
            expectedCurrent?.GameId, expectedCurrent?.Revision);
    }

    public Task<LocalSaveResult<LocalProfile>> OpenAsync(string absolutePath) => Execute(() =>
    {
        if (_database is not null) throw new SaveException("ALREADY_OPEN");
        if(_syntheticOutbox is not null && absolutePath!="owned-outbox-fixture")throw new SaveException("UNSAFE_PATH");
        ISaveDatabase database = _syntheticOutbox is not null ? _syntheticOutbox : _production ? CopyGameDatabase.OpenProductionOrCreate(absolutePath) : _runtime ? CopyGameDatabase.OpenRuntimeOrCreate(absolutePath) : CopyGameDatabase.OpenOrCreate(absolutePath);
        try
        {
            if(_production||_statisticsSynthetic){
                try{StatisticsTelemetry.Initialize(database);_statistical=new StatisticsTelemetry(database);_statistical.ReconcileGameplay();}
                catch{_statisticalCode="STATISTICS_INITIALIZATION_FAILED";}
            }
            var service = new GameSaveService(database, RealGameCatalog.InitialState(), extension:_statistical,availability:_availability);
            var profile = service.GetLocalProfile();
            _database = database; _service = service;
            RefreshTelemetryScope();
            if(!_production&&!_statisticsSynthetic&&(_runtime || _syntheticOutbox is not null))
            {
                _outboxPump=new LocalOutboxPump(database);
                _outbox=_syntheticOutbox is null?new LocalOutboxScheduler(OutboxPageAsync):
                    new LocalOutboxScheduler(OutboxPageAsync,TimeSpan.FromMilliseconds(1),TimeSpan.FromMilliseconds(100),TimeSpan.FromMilliseconds(1));
                _outbox.Request();
            }
            return new LocalSaveResult<LocalProfile>(true, "OPEN", profile);
        }
        catch { (database as IDisposable)?.Dispose(); throw; }
    });

    private GameSaveService Service => _service ?? throw new SaveException("STORAGE_CLOSED");
    private void RefreshTelemetryScope()
    {
        if(!_production&&!_statisticsSynthetic)return;
        try{var p=Service.GetLocalProfile();var g=p is null?null:Service.GetActiveGame(p.LocalPlayerId);Volatile.Write(ref _telemetryScope,g is null?null:new(g.Game.GameId,g.Game.CurrentBiomeId));}
        catch{_statisticalCode="STATISTICS_RECONCILIATION_PENDING";}
    }
    public Task<LocalSaveResult<StatisticsResult<PlayerStatistics>>> GetLocalStatisticsAsync()=>Execute(()=>
    {
        if(_database is null) throw new SaveException("STORAGE_CLOSED");
        _statistics ??= new StatisticsService(_database,RealGameCatalog.InitialState());
        return new LocalSaveResult<StatisticsResult<PlayerStatistics>>(true,"STATISTICS",_statistics.GetLocalStatistics());
    });
    public Task<LocalSaveResult<LocalProfile>> GetLocalProfileAsync() => Execute(() =>
        new LocalSaveResult<LocalProfile>(true, "PROFILE", Service.GetLocalProfile()));
    public Task<LocalSaveResult<LocalProfile>> CreateLocalProfileAsync(ProfileCreationRequest request) => Execute(() =>
    {
        if (request is null) throw new SaveException("INVALID_DATA");
        var receipt = Service.CreateLocalProfile(request.OperationId, request.LocalPlayerId, request.DisplayName);
        return new LocalSaveResult<LocalProfile>(true, "PROFILE_CREATED", Service.GetLocalProfile(), receipt);
    });
    public Task<LocalSaveResult<LocalProfile>> UpdateDisplayNameAsync(string operationId, string owner,
        long expectedProfileRevision, string displayName) => Execute(() =>
    {
        var receipt = Service.UpdateDisplayName(operationId, owner, expectedProfileRevision, displayName);
        return new LocalSaveResult<LocalProfile>(true, "PROFILE_UPDATED", Service.GetLocalProfile(), receipt);
    });
    public Task<LocalSaveResult<GameAggregate>> CreateNewGameAsync(NewGameCommand command) => Execute(() =>
    {
        if (command is null) throw new SaveException("INVALID_DATA");
        var receipt = Service.CreateNewGame(command);
        return new LocalSaveResult<GameAggregate>(true, "GAME_CREATED",
            Service.LoadGame(command.LocalPlayerId, command.GameId), receipt);
    });
    public Task<LocalSaveResult<bool>> HasUnfinishedGamesAsync(string owner) => Execute(() =>
        new LocalSaveResult<bool>(true,"UNFINISHED_GAMES",Service.HasUnfinishedGames(owner)));
    public Task<LocalSaveResult<GameAggregate>> GetActiveGameAsync(string owner) => Execute(() =>
        new LocalSaveResult<GameAggregate>(true, "ACTIVE_GAME", Service.GetActiveGame(owner)));
    public Task<LocalSaveResult<GameAggregate>> LoadGameAsync(string owner, string game) => Execute(() =>
        new LocalSaveResult<GameAggregate>(true, "GAME", Service.LoadGame(owner, game)));
    public Task<LocalSaveResult<IReadOnlyList<SavedGame>>> GetGameHistoryAsync(string owner, int offset=0, int limit=50) => Execute(() =>
        new LocalSaveResult<IReadOnlyList<SavedGame>>(true, "HISTORY", Service.GetGameHistory(owner, offset, limit)));
    public Task<LocalSaveResult<IReadOnlyList<BiomeAccess>>> GetGameProgressAsync(string owner,string game)=>Execute(()=>
        new LocalSaveResult<IReadOnlyList<BiomeAccess>>(true,"PROGRESS",Service.GetGameProgress(owner,game)));
    public Task<LocalSaveResult<BiomeAccess>> GetBiomeAccessAsync(string owner,string game,string biome)=>Execute(()=>
        new LocalSaveResult<BiomeAccess>(true,"BIOME_ACCESS",Service.GetBiomeAccess(owner,game,biome)));
    public Task<LocalSaveResult<IReadOnlyList<BiomeProgress>>> GetCompletedBiomesAsync(string owner,string game)=>Execute(()=>
        new LocalSaveResult<IReadOnlyList<BiomeProgress>>(true,"COMPLETED_BIOMES",Service.GetCompletedBiomes(owner,game)));
    public Task<LocalSaveResult<bool>> AreAllCanonicalBiomesCompletedAsync(string owner,string game)=>Execute(()=>
        new LocalSaveResult<bool>(true,"CANONICAL_SET",Service.AreAllCanonicalBiomesCompleted(owner,game)));
    public Task<LocalSaveResult<SaveReceipt>> EnterBiomeAsync(EnterBiomeCommand command)=>Execute(()=>
    {
        if(command is null)throw new SaveException("INVALID_DATA");
        var receipt=Service.EnterBiome(command);return new LocalSaveResult<SaveReceipt>(true,"BIOME_ENTERED",receipt,receipt);
    });
    public Task<LocalSaveResult<SaveReceipt>> CompleteBiomeAsync(CompleteBiomeCommand command)=>Execute(()=>
    {
        if(command is null)throw new SaveException("INVALID_DATA");
        if(_statistical is not null)_statistical.BiomeIntent=command.BiomeId;
        try{var receipt=Service.CompleteBiome(command);return new LocalSaveResult<SaveReceipt>(true,"BIOME_COMPLETED",receipt,receipt);}
        finally{if(_statistical is not null)_statistical.BiomeIntent=null;}
    });
    public Task<LocalSaveResult<SaveReceipt>> PrepareFinalAsync(PrepareFinalCommand command)=>Execute(()=>
    {
        var receipt=Service.PrepareFinal(command);return new LocalSaveResult<SaveReceipt>(true,"FINAL_PREPARED",receipt,receipt);
    });
    public Task<LocalSaveResult<SaveReceipt>> CloseGameAsync(CloseGameCommand command)=>Execute(()=>
    {
        var receipt=Service.CloseGame(command);return new LocalSaveResult<SaveReceipt>(true,"GAME_CLOSED",receipt,receipt);
    });
    public Task<LocalSaveResult<SaveReceipt>> RecordDecisionAsync(RecordDecisionCommand command)=>Execute(()=>
    {
        if(command is null)throw new SaveException("INVALID_DATA");
        var receipt=Service.RecordDecision(command);return new LocalSaveResult<SaveReceipt>(true,"DECISION_RECORDED",receipt,receipt);
    });
    public Task<LocalSaveResult<IReadOnlyList<EnvironmentalDecision>>> GetDecisionsAsync(string owner,string game,string? biome=null,long after=0,int limit=100)=>Execute(()=>
        new LocalSaveResult<IReadOnlyList<EnvironmentalDecision>>(true,"DECISIONS",Service.GetDecisions(owner,game,biome,after,limit)));
    public Task<LocalSaveResult<EnvironmentalState>> GetEnvironmentAsync(string owner,string game,string biome)=>Execute(()=>
        new LocalSaveResult<EnvironmentalState>(true,"ENVIRONMENT",Service.GetEnvironment(owner,game,biome)));

    private async Task<T> DeliverStatistics<T>(Func<StatisticsTelemetry,T> action,CancellationToken cancel)
    {
        await _gate.WaitAsync(cancel).ConfigureAwait(false);
        try{
            if(_disposed||Volatile.Read(ref _closing)!=0||_database is null||_statistical is null)throw new SaveException("STATISTICS_NOT_READY");
            return await Task.Run(()=>action(_statistical),cancel).ConfigureAwait(false);
        }finally{_gate.Release();}
    }
    public Task<IReadOnlyList<StatisticalDelivery>> ReserveStatisticsAsync(long now,CancellationToken cancel)=>DeliverStatistics(s=>s.Reserve(now),cancel);
    public async Task ConfirmStatisticsAsync(StatisticalDelivery d,CancellationToken cancel)=>_=await DeliverStatistics(s=>{s.Confirm(d.Event.EventId,d.LeaseId,d.PayloadHash);return true;},cancel).ConfigureAwait(false);
    public async Task DeferStatisticsAsync(StatisticalDelivery d,long now,long retryAt,string code,CancellationToken cancel)=>_=await DeliverStatistics(s=>{s.Defer(d.Event.EventId,d.LeaseId,now,retryAt,code);return true;},cancel).ConfigureAwait(false);
    public async Task RejectStatisticsAsync(StatisticalDelivery d,long now,string code,CancellationToken cancel)=>_=await DeliverStatistics(s=>{s.Fail(d.Event.EventId,d.LeaseId,now,code);return true;},cancel).ConfigureAwait(false);
    public async Task ResumeStatisticsAsync(long now,CancellationToken cancel)=>_=await DeliverStatistics(s=>{s.ResumeTransport(now);return true;},cancel).ConfigureAwait(false);
    public async Task CloseAsync()
    {
        if(_outbox is not null)await _outbox.DisposeAsync().ConfigureAwait(false);
        await _gate.WaitAsync().ConfigureAwait(false);
        try { _outbox=null;_outboxPump=null;_events=null; _statistics=null; _service = null; (_database as IDisposable)?.Dispose(); _database = null; }
        finally { _gate.Release(); }
    }
    private async Task<LocalSaveResult<T>> Execute<T>(Func<LocalSaveResult<T>> work)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed || Volatile.Read(ref _closing)!=0) return new(false, "STORAGE_CLOSED");
            return await Task.Run(() =>
            {
                try
                {
                    var result=work();
                    if(result.Success&&result.Receipt is not null)RefreshTelemetryScope();
                    if(result.Success && (result.Receipt is not null || result.Data is GameplayWriteReceipt) && _statistical is not null){
                        try{_statistical.ReconcileGameplay();}catch{_statisticalCode="STATISTICS_RECONCILIATION_PENDING";}
                    }
                    if(result.Success && (result.Receipt is not null || result.Data is GameplayWriteReceipt))_outbox?.Request();
                    return result;
                }
                catch (SaveException e) { return new LocalSaveResult<T>(false, e.Code); }
                catch (UnauthorizedAccessException) { return new LocalSaveResult<T>(false, "ACCESS_DENIED"); }
                catch (IOException) { return new LocalSaveResult<T>(false, "IO_ERROR"); }
                catch { return new LocalSaveResult<T>(false, "STORAGE_ERROR"); }
            }).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        if(_outbox is not null)await _outbox.DisposeAsync().ConfigureAwait(false);
        await _gate.WaitAsync().ConfigureAwait(false);
        try { _disposed = true; _outbox=null;_outboxPump=null;_events=null; _statistics=null; _service = null; (_database as IDisposable)?.Dispose(); _database = null; }
        finally { _gate.Release(); }
    }
    private async Task<LocalOutboxPage> OutboxPageAsync(SyncReconciliationCursor? cursor,CancellationToken cancellation)
    {
        await _gate.WaitAsync(cancellation).ConfigureAwait(false);
        try
        {
            if(_disposed || _outboxPump is null)return new("OUTBOX_CLOSED",false);
            return await Task.Run(()=>_outboxPump.Step(cursor,25),cancellation).ConfigureAwait(false);
        }
        finally{_gate.Release();}
    }
}
