#nullable enable
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

public interface IGameplayTelemetryStore
{
    Task<LocalSaveResult<IReadOnlyList<GameplaySession>>> ReadSessionsAsync(string owner);
    Task<LocalSaveResult<GameplayWriteReceipt>> WriteEventAsync(GameplayEvent value);
    Task<LocalSaveResult<GameplayWriteReceipt>> WriteIntervalAsync(GameplayInterval value);
    Task<LocalSaveResult<GameplayWriteReceipt>> InterruptAsync(string owner,string session,string eventId,DateTimeOffset discovered);
}
public interface IStatisticalSessionSource { string? StatisticalSessionId {get;} }

// Main-thread notifications, one serial async FIFO. Never awaited by gameplay.
public sealed class LocalGameplayObserver
{
    // F3.1 (B48): the heartbeat that closes a sub-interval of an UNCHANGED state is 30 s (was 5 s), which cuts the synchronized volume about six-fold.
    // Every state change, pause, focus loss, death, completion and close still confirms the interval at that exact moment, so only the loss window after
    // an unexpected process death grows (up to 30 s of the current state, already reported as incomplete coverage). Retry after a failed write stays 5 s.
    public const long HeartbeatMs=30_000;
    public const long RetryDelayMs=5_000;
    private readonly IGameplayTelemetryStore _store;
    private readonly Func<long> _now;
    private readonly Func<DateTimeOffset> _utc;
    private readonly Action<string> _diagnostic;
    private readonly ConcurrentQueue<Func<Task<string?>>> _pending=new();
    private readonly object _pumpGate=new();
    private Task _pump=Task.CompletedTask;
    private bool _initializing,_ready,_closing,_closed,_disabled,_dead,_terminal,_focused=true;
    private string? _owner,_session,_game,_biome,_run,_sceneToken;
    private readonly HashSet<GameplayEventKind> _sent=new();
    private long _origin,_boundary,_retryAt;
    private GameplayTimeState _state=GameplayTimeState.Menu;
    private bool _preReadyReported,_human;
    private long _lastObserved;
    private bool _paused,_blocked;
    public string Code {get;private set;}="WAITING_FOR_PROFILE";
    public string? SessionId=>_session;
    public bool Ready=>_ready && !_disabled && !_closed;
    public int Pending=>_pending.Count;
    public bool Incomplete {get;private set;}
    public LocalGameplayObserver(IGameplayTelemetryStore store,Func<long>? now=null,Func<DateTimeOffset>? utc=null,Action<string>? diagnostic=null)
    {
        _store=store;var clock=new GameplayMonotonicClock();_now=now??(()=>clock.ElapsedMilliseconds);
        _utc=utc??(()=>DateTimeOffset.UtcNow);_diagnostic=diagnostic??(_=>{});
    }
    private static string Id()=>Guid.NewGuid().ToString("D");
    private long Offset=>Math.Max(0,_now()-_origin);
    private void Failure(string code)
    {Code=code;Incomplete=true;try{_diagnostic(code);}catch{} }
    public async Task InitializeAsync(string owner)
    {
        if(_initializing || _ready || _disabled || _closed || _closing)return;
        _initializing=true;
        try
        {
            SaveValidation.Id(owner);
            var previous=await _store.ReadSessionsAsync(owner);
            if(!previous.Success || previous.Data is null){Failure(previous.Code);_disabled=true;return;}
            _owner=owner;_session=(_store as IStatisticalSessionSource)?.StatisticalSessionId??Id();_origin=_now();_boundary=0;_lastObserved=0;
            foreach(var old in previous.Data.Where(s=>s.Status=="open"))
            {
                string eventId=Id();var discovered=_utc();
                Enqueue(async()=>{var r=await _store.InterruptAsync(owner,old.SessionId,eventId,discovered);return r.Success?null:r.Code;});
            }
            var start=new GameplayEvent(Id(),owner,_session,GameplayEventKind.SESSION_STARTED,_utc(),0);
            Event(start);_ready=true;Code="CAPTURING";Pump();
        }
        catch{Failure("TELEMETRY_INITIALIZATION_FAILED");_disabled=true;}
        finally{_initializing=false;}
    }
    private void Enqueue(Func<Task<string?>> write)
    {
        if(_disabled || _closed)return;
        if(_pending.Count>=2048){Failure("TELEMETRY_QUEUE_FULL");_disabled=true;return;}
        _pending.Enqueue(write);
    }
    private void Event(GameplayEvent value)=>Enqueue(async()=>{var r=await _store.WriteEventAsync(value);return r.Success?null:r.Code;});
    private void AnimalEvent(GameplayEventKind kind,long offset)
    {
        if(_run is null || !_sent.Add(kind))return;
        Event(new(Id(),_owner!,_session!,kind,_utc(),offset,_game,_biome,_run,
            DeathCause:kind==GameplayEventKind.ANIMAL_DIED?GameplayDeathCause.Unknown:null));
    }
    private void Flush(long end)
    {
        if(!Ready || end<=_boundary)return;
        var state=end-_boundary>StatisticsTelemetry.MaxIntervalMs?GameplayTimeState.Loading:_state;
        var interval=new GameplayInterval(Id(),_owner!,_session!,_boundary,end,state,
            _run is null&&!_human?null:_game,_run is null&&!_human?null:_biome,_run);
        Enqueue(async()=>{var r=await _store.WriteIntervalAsync(interval);return r.Success?null:r.Code;});_boundary=end;
    }
    private void Change(GameplayTimeState next)
    {if(!Ready || next==_state)return;long now=Offset;Flush(now);_state=next;Pump();}
    public void AnimalStarted(string game,string biome,string sceneToken)
    {
        if(!Ready){if(!_preReadyReported){_preReadyReported=true;Failure("TELEMETRY_NOT_READY_COVERAGE");}return;}
        if(_closing || _sceneToken==sceneToken)return;
        SaveValidation.Id(game);if(LocalBiomeSelection.AnimalSceneFor(biome) is null)return;
        long now=Offset;Flush(now);
        if(_run is not null && !_terminal)AnimalEvent(GameplayEventKind.ANIMAL_SEGMENT_EXITED,now);
        _human=false;_game=game;_biome=biome;_run=Id();_sceneToken=sceneToken;_sent.Clear();_dead=false;_terminal=false;_blocked=false;
        Event(new(_run,_owner!,_session!,GameplayEventKind.ANIMAL_SEGMENT_STARTED,_utc(),now,game,biome,_run));
        _state=GameplayTimeState.Loading;Pump();
    }
    public void HumanStarted(string game,string biome,string sceneToken)
    {
        if(!Ready||_closing||_sceneToken==sceneToken)return;
        SaveValidation.Id(game);if(LocalBiomeSelection.HumanSceneFor(biome) is null)return;
        long now=Offset;Flush(now);if(_run is not null&&!_terminal)AnimalEvent(GameplayEventKind.ANIMAL_SEGMENT_EXITED,now);
        _human=true;_game=game;_biome=biome;_run=null;_sceneToken=sceneToken;_dead=false;_terminal=false;_blocked=false;_state=GameplayTimeState.Loading;Pump();
    }
    public void Observe(bool sameScene,bool paused,bool blocked,bool focused)
    {
        if(!Ready || _closing)return;
        _paused=paused;_blocked=blocked;_focused=focused;
        long observed=Offset;
        if(observed-_lastObserved>StatisticsTelemetry.MaxIntervalMs){Flush(_lastObserved);_state=GameplayTimeState.Loading;Flush(observed);Failure("TELEMETRY_SUSPENSION_EXCLUDED");}
        _lastObserved=observed;
        if((_run is not null||_human) && !sameScene){Leave();return;}
        var next=!focused?GameplayTimeState.Background:_run is null&&!_human?GameplayTimeState.Menu:
            _dead?GameplayTimeState.GameOver:_terminal||blocked?GameplayTimeState.Loading:paused?GameplayTimeState.Paused:GameplayTimeState.ActiveAnimal;
        if(_human&&next==GameplayTimeState.ActiveAnimal)next=GameplayTimeState.ActiveHuman;
        Change(next);
        long now=Offset;if(now-_boundary>=HeartbeatMs){Flush(now);Pump();}
        if(_pending.Count>0 && _now()>=_retryAt)Pump();
    }
    public void Paused(bool paused)
    {if(!Ready||_closing)return;_paused=paused;Observe(true,paused,_blocked,_focused);}
    public void Died()
    {
        if(!Ready || _closing || _run is null || _dead || _terminal)return;
        long now=Offset;Flush(now);AnimalEvent(GameplayEventKind.ANIMAL_DIED,now);_dead=true;_terminal=true;_state=GameplayTimeState.GameOver;Pump();
    }
    public void RequestRestart(bool retry)
    {
        if(!Ready || _closing || _run is null || (retry?!_dead:_terminal))return;
        long now=Offset;Flush(now);AnimalEvent(retry?GameplayEventKind.ANIMAL_RETRY_REQUESTED:GameplayEventKind.ANIMAL_RESTART_REQUESTED,now);
        _terminal=true;_blocked=true;_state=GameplayTimeState.Loading;Pump();
    }
    public void Loading(){if(!Ready||_closing)return;_blocked=true;Change(GameplayTimeState.Loading);}
    public void CompletionConfirmed(string operationId,string game,string biome)
    {
        if(!Ready || _closing || _run is null || _game!=game || _biome!=biome || _dead || _terminal)
        { if(!_sent.Contains(GameplayEventKind.ANIMAL_SEGMENT_COMPLETED))Failure("TELEMETRY_COMPLETION_MISSING");return; }
        if(!_sent.Add(GameplayEventKind.ANIMAL_SEGMENT_COMPLETED))return;
        SaveValidation.Id(operationId);
        long now=Offset;Flush(now);
        Event(new(operationId,_owner!,_session!,GameplayEventKind.ANIMAL_SEGMENT_COMPLETED,_utc(),now,game,biome,_run));
        _terminal=true;_blocked=true;_state=GameplayTimeState.Loading;Pump();
    }
    public void NavigationFailed()
    {if(Ready && _terminal && !_dead)Failure("TELEMETRY_FAILED_RESTART_COVERAGE");}
    public void Leave()
    {
        if(!Ready || _closing || (_run is null&&!_human))return;
        long now=Offset;Flush(now);AnimalEvent(GameplayEventKind.ANIMAL_SEGMENT_EXITED,now);
        _human=false;_run=null;_game=null;_biome=null;_sceneToken=null;_state=GameplayTimeState.Menu;Pump();
    }
    private void Pump()
    {
        lock(_pumpGate)
        {
            if(!_pump.IsCompleted || _disabled || _closed)return;
            _pump=DrainCore();
        }
    }
    private async Task DrainCore()
    {
        // Yield before draining so reentrant notifications cannot start another FIFO consumer.
        await Task.Yield();
        while(_pending.Count>0 && !_disabled && !_closed)
        {
            string? error;
            try{if(!_pending.TryPeek(out var write))return;error=await write();}catch{error="TELEMETRY_WRITE_FAILED";}
            if(error is not null)
            {
                Failure(error);_retryAt=_now()+RetryDelayMs;
                if(error is not ("IO_ERROR" or "STORAGE_BUSY" or "DISK_FULL" or "ACCESS_DENIED" or "TELEMETRY_WRITE_FAILED"))_disabled=true;
                return;
            }
            _pending.TryDequeue(out _);Code="CAPTURING";
        }
    }
    public async Task DrainAsync(){Pump();await _pump;}
    public async Task CloseAsync()
    {
        if(_closed)return;
        if(!_closing)
        {
            if(Ready){long now=Offset;Flush(now);Event(new(Id(),_owner!,_session!,GameplayEventKind.SESSION_ENDED,_utc(),now,SessionEnd:GameplaySessionEnd.Normal));}
            _closing=true;
        }
        await DrainAsync();if(_pending.Count>0)Failure("TELEMETRY_CLOSE_INCOMPLETE");_closed=true;
    }
}
