#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

// Read-only return intent. UI supplies navigation/pausing; no HTTP or game mutations.
public sealed class LocalMenuReturn
{
    public const string Destination = "res://assets/sprites/ui/menu_principal.tscn";
    public const string SelectionDestination = "res://scenes/levels/menu_niveles.tscn";
    private int _busy;
    public bool Busy => Volatile.Read(ref _busy) != 0;
    public string Code { get; private set; } = "READY";
    public Task<bool> ReturnAsync(LocalGameState state, bool wasPaused,
        Action<bool> pause, Func<Task<bool>> navigate) => ReturnCore(state,wasPaused,pause,navigate,false);
    public Task<bool> ReturnToSelectionAsync(LocalGameState state, bool wasPaused,
        Action<bool> pause, Func<Task<bool>> navigate) => ReturnCore(state,wasPaused,pause,navigate,true);
    private async Task<bool> ReturnCore(LocalGameState state, bool wasPaused,
        Action<bool> pause, Func<Task<bool>> navigate, bool selection)
    {
        if (Interlocked.CompareExchange(ref _busy,1,0)!=0) return false;
        bool changed=false;
        try
        {
            if (state.Busy || state.HasPendingWrite) { Code="PENDING_OPERATION"; return false; }
            if (!state.Ready) { Code="STORAGE_CLOSED"; return false; }
            var owner=state.Profile?.LocalPlayerId;
            var game=state.ActiveGame?.Game.GameId;
            if (!await (selection ? state.PrepareSelectionAsync() : state.RefreshAsync())) { Code=state.Code; return false; }
            if (owner is null || state.Profile?.LocalPlayerId!=owner || !state.CanContinue ||
                (game is not null && state.ActiveGame?.Game.GameId!=game))
            { Code="GAME_NOT_ACTIVE"; return false; }
            if (selection)
            {
                if (!state.CanEnterSelection)
                { Code="GAME_NOT_ACTIVE";return false; }
            }
            else state.CancelSelection();
            pause(false);
            changed=await navigate();
            Code=changed ? "RETURNED" : "NAVIGATION_FAILED";
            return changed;
        }
        catch { Code="STORAGE_ERROR"; return false; }
        finally
        {
            if (!changed) { if(selection) state.CancelSelection(); pause(wasPaused); }
            Interlocked.Exchange(ref _busy,0);
        }
    }
    public string Message => Code=="NAVIGATION_FAILED"
        ? "No se pudo abrir el menú local. Tu progreso se conserva; puedes reintentar."
        : LocalGameState.MessageFor(Code);
}

public interface ILocalAnimalStore
{
    Task<LocalSaveResult<LocalProfile>> GetLocalProfileAsync();
    Task<LocalSaveResult<GameAggregate>> GetActiveGameAsync(string owner);
}

public interface ILocalCompletionStore : ILocalAnimalStore
{
    Task<LocalSaveResult<SaveReceipt>> CompleteBiomeAsync(CompleteBiomeCommand command);
}
public sealed record LocalCompletionResult(SaveReceipt Receipt, bool AllCompleted);

// One immutable physical-arrival intent. Navigation and telemetry cannot undo its receipt.
public sealed class LocalBiomeCompletion
{
    private readonly ILocalCompletionStore _store;
    private readonly string _owner, _game;
    public string Biome { get; }
    public string GameId => _game;
    public CompleteBiomeCommand? Command { get; private set; }
    public SaveReceipt? Receipt { get; private set; }
    private int _busy;
    public bool Pending => Command is not null && Receipt is null;
    public LocalBiomeCompletion(ILocalCompletionStore store, string owner, string game, string biome)
        => (_store,_owner,_game,Biome)=(store,owner,game,biome);
    public async Task<LocalSaveResult<LocalCompletionResult>> ConfirmAsync()
    {
        if(Interlocked.CompareExchange(ref _busy,1,0)!=0)return new(false,"PENDING_OPERATION");
        try
        {
            if(Command is null)
            {
                var entry=await LocalAnimalEntryReader.ReadAsync(_store,_owner,_game,Biome);
                if(!entry.Success || entry.Data is null)return new(false,entry.Code);
                Command=new(Guid.NewGuid().ToString("D"),_owner,_game,entry.Data.Revision,Biome,entry.Data.Healthy?"good":"bad");
            }
            if(Receipt is null)
            {
                var saved=await _store.CompleteBiomeAsync(Command);
                if(!saved.Success)return new(false,saved.Code);
                var receipt=saved.Receipt??saved.Data;
                if(receipt is null || receipt.OperationId!=Command.OperationId || receipt.LocalPlayerId!=_owner ||
                    receipt.GameId!=_game || receipt.OperationKind!="complete_biome" || receipt.ResultRevision!=Command.ExpectedRevision+1)
                    return new(false,"INVALID_RECEIPT");
                Receipt=receipt;
            }
            var profile=await _store.GetLocalProfileAsync();
            if(!profile.Success)return new(false,profile.Code);
            if(profile.Data?.LocalPlayerId!=_owner)return new(false,"PROFILE_REQUIRED");
            var read=await _store.GetActiveGameAsync(_owner);
            if(!read.Success)return new(false,read.Code);
            var game=read.Data;
            if(game is null || game.Game.GameId!=_game || !game.Game.IsCurrent || game.Game.Status!="in_progress")return new(false,"GAME_NOT_ACTIVE");
            var completed=game.Biomes.SingleOrDefault(b=>b.BiomeId==Biome);
            if(completed?.Status!="completed" || completed.Result!=Command.ConfirmedResult || game.Game.Revision<Receipt.ResultRevision)
                return new(false,"INVALID_RECEIPT");
            return new(true,"BIOME_COMPLETED",new(Receipt,game.Biomes.Count==5 && game.Biomes.All(b=>b.Status=="completed")));
        }
        catch(SaveException e){return new(false,e.Code);}
        catch{return new(false,"STORAGE_ERROR");}
        finally{Interlocked.Exchange(ref _busy,0);}
    }
}
// A restart re-instantiates original content, never writes a persistence boundary or receipt.
public sealed class LocalAnimalRestart
{
    private int _busy;
    public bool Busy => Volatile.Read(ref _busy)!=0;
    public string Code { get; private set; }="READY";
    public string? MissingScene { get; private set; }
    public async Task<bool> RestartAsync(LocalGameState state, string currentScene,
        Func<string,bool> destinationExists, Func<LocalAnimalContext,string,Task<bool>> navigate)
    {
        if (Interlocked.CompareExchange(ref _busy,1,0)!=0) return false;
        try
        {
            MissingScene=null;
            string? biome=null;
            for(int i=0;i<5;i++)
            {
                var candidate=LocalBiomeSelection.BiomeFor(i);
                if(candidate is not null && LocalBiomeSelection.AnimalSceneFor(candidate)==currentScene) biome=candidate;
            }
            if(biome is null) { Code="INVALID_BIOME_SCENE";return false; }
            var read=await state.ReadAnimalEntryAsync(biome);
            if(!read.Success || read.Data is null) { Code=read.Code;return false; }
            if(!destinationExists(currentScene)) { MissingScene=currentScene;Code="SCENE_UNAVAILABLE";return false; }
            // Loading the packed resource must not make an earlier SQLite read authoritative forever.
            var fresh=await state.ReadAnimalEntryAsync(biome);
            if(!fresh.Success || fresh.Data is null) { Code=fresh.Code;return false; }
            if(fresh.Data!=read.Data) { Code="REVISION_CONFLICT";return false; }
            bool changed=await navigate(fresh.Data,currentScene);
            Code=changed ? "RESTARTED" : "NAVIGATION_FAILED";
            return changed;
        }
        catch { Code="STORAGE_ERROR";return false; }
        finally { Interlocked.Exchange(ref _busy,0); }
    }
    public string Message => Code switch
    {
        "SCENE_UNAVAILABLE" => $"No se pudo cargar la escena animal: {MissingScene}. El nivel y la decisión se conservan.",
        "NAVIGATION_FAILED" => "No se pudo reiniciar la escena animal. El nivel y la decisión se conservan; puedes reintentar.",
        "REVISION_CONFLICT" => "El contexto guardado cambió. No se reinició el nivel; vuelve al menú local.",
        _ => LocalAnimalEntryReader.MessageFor(Code)
    };
}
public sealed record LocalAnimalContext(string LocalPlayerId, string GameId, long Revision, string BiomeId,
    EnvironmentalDecision Decision, EnvironmentalState Environment)
{
    public bool Healthy => Environment.StateKind == "healthy";
}
// Read-only capability: cannot enter, decide, restart, complete, change resources or create a game.
public static class LocalAnimalEntryReader
{
    public static async Task<LocalSaveResult<LocalAnimalContext>> ReadAsync(ILocalAnimalStore store,
        string owner, string gameId, string biome)
    {
        try
        {
            if (LocalBiomeSelection.AnimalSceneFor(biome) is null) return new(false,"UNKNOWN_BIOME");
            var profile=await store.GetLocalProfileAsync();
            if (!profile.Success) return new(false,profile.Code);
            if (profile.Data is null || profile.Data.LocalPlayerId!=owner) return new(false,"PROFILE_REQUIRED");
            var loaded=await store.GetActiveGameAsync(owner);
            if (!loaded.Success) return new(false,loaded.Code);
            var game=loaded.Data;
            if (game is null || game.Game.LocalPlayerId!=owner || game.Game.GameId!=gameId || !game.Game.IsCurrent || game.Game.Status!="in_progress") return new(false,"GAME_NOT_ACTIVE");
            var progress=game.Biomes.SingleOrDefault(x=>x.BiomeId==biome);
            if (progress is null || progress.GameId!=gameId) return new(false,"UNKNOWN_BIOME");
            if (progress.Status=="completed") return new(false,"BIOME_COMPLETED");
            if (progress.Status!="animal_pending") return new(false,"DECISION_REQUIRED");
            var decision=game.Decisions.SingleOrDefault(x=>x.BiomeId==biome);
            var environment=game.Environments.SingleOrDefault(x=>x.BiomeId==biome);
            if (decision is null || environment is null || decision.GameId!=gameId || environment.GameId!=gameId ||
                environment.LastDecisionId!=decision.DecisionId || environment.StateKind is not ("healthy" or "degraded") ||
                SaveValidation.DecisionState(decision.ConsequencesJson,decision.ConsequencesVersion)!=environment.StateKind)
                return new(false,"INVALID_ENVIRONMENT");
            // Validate existing option/result consistency, never rewrite or recalculate it.
            if (decision.OptionId is not ("reject" or "approve") || (decision.OptionId=="reject")!=(environment.StateKind=="healthy"))
                return new(false,"INVALID_ENVIRONMENT");
            SaveValidation.Id(decision.OperationId);
            if (game.Snapshot.PayloadVersion!=1 || game.Snapshot.CapturedRevision!=game.Game.Revision || game.Snapshot.SnapshotJson!=GameSaveService.BoundarySnapshot)
                return new(false,"RESUME_UNSUPPORTED");
            return new(true,"ANIMAL_CONTEXT",new(owner,gameId,game.Game.Revision,biome,decision,environment));
        }
        catch (SaveException e) { return new(false,e.Code); }
        catch { return new(false,"STORAGE_ERROR"); }
    }
    public static bool MatchesPreparedEnvironment(LocalAnimalContext context, bool currentHealthy) => context.Healthy==currentHealthy;
    public static string MessageFor(string code) => code switch
    {
        "DECISION_REQUIRED" => "Falta una decisión humana confirmada para entrar al segmento animal.",
        "BIOME_COMPLETED" => "Este bioma ya está completado y no puede repetirse.",
        "PROFILE_REQUIRED" => "No hay un perfil local válido para esta entrada.",
        "GAME_NOT_ACTIVE" => "No hay una partida activa válida para esta entrada.",
        "UNKNOWN_BIOME" or "INVALID_BIOME_SCENE" => "La escena no corresponde a un bioma animal válido.",
        "ENVIRONMENT_NOT_PREPARED" => "El ambiente confirmado debe prepararse antes de cargar esta escena. Vuelve al menú y utiliza su tarjeta.",
        "INVALID_ENVIRONMENT" => "No se pudo validar el ambiente guardado. Los datos se conservan.",
        "LOCAL_OPERATION_UNSUPPORTED" => "Esta operación local todavía no está implementada. La decisión y el progreso se conservan.",
        _ => "No se pudo validar la entrada animal mediante SQLite. Los datos se conservan."
    };
}

public interface ILocalDecisionStore
{
    Task<LocalSaveResult<GameAggregate>> GetActiveGameAsync(string owner);
    Task<LocalSaveResult<SaveReceipt>> RecordDecisionAsync(RecordDecisionCommand command);
}
public sealed record LocalDecisionConfirmation(EnvironmentalDecision Decision, EnvironmentalState Environment,
    long CurrentRevision, SaveReceipt? Receipt);

// Caller supplies the existing game's resolved consequence. No environmental rule/evaluator lives here.
public sealed class LocalDecisionSession
{
    private readonly ILocalDecisionStore _store;
    private readonly string _owner, _game, _biome, _key;
    private int _busy;
    private volatile bool _invalid;
    private RecordDecisionCommand? _pending;
    private LocalDecisionConfirmation? _confirmed;
    private string? _projectedOperation, _navigatedOperation;
    public bool Busy => Volatile.Read(ref _busy) != 0;
    public string Code { get; private set; } = "READY";
    public LocalDecisionConfirmation? Confirmed => _confirmed;
    public LocalDecisionSession(ILocalDecisionStore store, string owner, string game, string biome, string key)
    { SaveValidation.Id(owner); SaveValidation.Id(game); (_store,_owner,_game,_biome,_key)=(store,owner,game,biome,key); }
    private bool Fail(string code) { Code=code; return false; }
    public void Invalidate() { _invalid=true; _confirmed=null; }
    public bool IsCurrent(LocalDecisionConfirmation confirmation) => !_invalid && ReferenceEquals(_confirmed,confirmation);
    public async Task<bool> ConfirmAsync(string option, string resolvedEnvironment, Func<bool> destinationExists,
        Action<LocalDecisionConfirmation> project, Func<LocalDecisionConfirmation,Task<bool>> navigate)
    {
        if (_invalid || Interlocked.CompareExchange(ref _busy,1,0)!=0) return false;
        try
        {
            if (option is not ("reject" or "approve") || resolvedEnvironment is not ("healthy" or "degraded")) return Fail("INVALID_DATA");
            if (_pending is not null && (_pending.OptionId!=option || _pending.ResolvedEnvironment!=resolvedEnvironment)) return Fail("DECISION_CONFLICT");
            var read=await _store.GetActiveGameAsync(_owner);
            if (_invalid) return false;
            if (!read.Success) return Fail(read.Code);
            var game=read.Data;
            if (game is null || game.Game.LocalPlayerId!=_owner || game.Game.GameId!=_game || !game.Game.IsCurrent || game.Game.Status!="in_progress") return Fail("GAME_NOT_ACTIVE");
            var biome=game.Biomes.SingleOrDefault(x=>x.BiomeId==_biome);
            if (biome is null) return Fail("UNKNOWN_BIOME");
            if (biome.Status=="completed") return Fail("BIOME_COMPLETED");
            if (game.Game.CurrentBiomeId!=_biome || game.Game.ResumeKind is not ("human_decision" or "decision_info")) return Fail("INVALID_STAGE");
            if (!destinationExists()) return Fail("SCENE_UNAVAILABLE");
            var existing=game.Decisions.SingleOrDefault(x=>x.BiomeId==_biome && x.DecisionKey==_key);
            SaveReceipt? receipt=null;
            if (existing is not null)
            {
                if (existing.OptionId!=option || SaveValidation.DecisionState(existing.ConsequencesJson,existing.ConsequencesVersion)!=resolvedEnvironment) return Fail("DECISION_CONFLICT");

            }
            else
            {
                if (biome.Status!="human_pending" || game.Game.ResumeKind!="human_decision") return Fail("INVALID_STAGE");
                _pending ??= new(Guid.NewGuid().ToString("D"),Guid.NewGuid().ToString("D"),_owner,_game,game.Game.Revision,_biome,_key,option,resolvedEnvironment,
                    System.Text.Json.JsonSerializer.Serialize(new {stateKind=resolvedEnvironment}));
                var saved=await _store.RecordDecisionAsync(_pending);
                if (_invalid) return false;
                if (!saved.Success && saved.Code is not ("REVISION_CONFLICT" or "DECISION_CONFLICT")) return Fail(saved.Code);
                receipt=saved.Receipt ?? saved.Data;
                if (saved.Success && (receipt is null || receipt.OperationId!=_pending.OperationId || receipt.OperationKind!="decision" ||
                    receipt.LocalPlayerId!=_owner || receipt.GameId!=_game || receipt.ResultRevision!=_pending.ExpectedRevision+1)) return Fail("INVALID_DATA");
                var loaded=await _store.GetActiveGameAsync(_owner);
                if (_invalid) return false;
                if (!loaded.Success) return Fail(loaded.Code);
                game=loaded.Data;
                if (game is null || game.Game.GameId!=_game || game.Game.LocalPlayerId!=_owner || !game.Game.IsCurrent || game.Game.Status!="in_progress" || (saved.Success && game.Game.Revision!=receipt!.ResultRevision)) return Fail("REVISION_CONFLICT");
                existing=game.Decisions.SingleOrDefault(x=>x.DecisionKey==_key && x.BiomeId==_biome);
                if (saved.Success && (existing?.OperationId!=_pending.OperationId || existing.DecisionId!=_pending.DecisionId)) return Fail("INVALID_DATA");
            }
            if (existing is null) return Fail("INVALID_DATA");
            if (existing.OptionId!=option || SaveValidation.DecisionState(existing.ConsequencesJson,existing.ConsequencesVersion)!=resolvedEnvironment) return Fail("DECISION_CONFLICT");
            var environment=game.Environments.Single(x=>x.BiomeId==_biome);
            if (game.Biomes.Single(x=>x.BiomeId==_biome).Status!="animal_pending" || environment.LastDecisionId!=existing.DecisionId ||
                environment.StateKind!=resolvedEnvironment || game.Game.ResumeKind!="decision_info" || game.Game.CurrentBiomeId!=_biome) return Fail("INVALID_STAGE");
            _pending=null;
            if (receipt is null && _confirmed?.Decision.OperationId==existing.OperationId) receipt=_confirmed.Receipt;
            _confirmed=new(existing,environment,game.Game.Revision,receipt);
            if (_navigatedOperation==existing.OperationId) { Code="CONFIRMED"; return true; }
            if (_projectedOperation!=existing.OperationId)
            {
                // Absolute state projection after SQL commit; no damage, resources, spawns or counters.
                project(_confirmed); _projectedOperation=existing.OperationId;
            }
            if (_invalid) return false;
            try { if (!await navigate(_confirmed)) return Fail("NAVIGATION_FAILED"); }
            catch { return Fail("NAVIGATION_FAILED"); }
            _navigatedOperation=existing.OperationId; Code="CONFIRMED"; return true;
        }
        catch (SaveException e) { return Fail(e.Code); }
        catch { return Fail("STORAGE_ERROR"); }
        finally { Interlocked.Exchange(ref _busy,0); }
    }
    public static string MessageFor(string code) => code switch
    {
        "CONFIRMED" => "Decisión guardada.",
        "DECISION_CONFLICT" => "Esta decisión ya tiene otra opción. El progreso se conserva.",
        "BIOME_COMPLETED" => "El bioma ya está completado; no admite nuevas decisiones.",
        "NAVIGATION_FAILED" => "Decisión guardada. Presiona espacio para reintentar la transición.",
        "SCENE_UNAVAILABLE" => "No está disponible la escena informativa. No se confirmó una nueva elección.",
        _ => "No se pudo confirmar la decisión local. Presiona espacio para reintentar la misma opción."
    };
}

// Selection capability has no profile creation, decisions, completion, HTTP or resource operations.
public interface ILocalBiomeStore
{
    Task<LocalSaveResult<GameAggregate>> GetActiveGameAsync(string owner);
    Task<LocalSaveResult<IReadOnlyList<BiomeAccess>>> GetGameProgressAsync(string owner, string game);
    Task<LocalSaveResult<BiomeAccess>> GetBiomeAccessAsync(string owner, string game, string biome);
    Task<LocalSaveResult<SaveReceipt>> EnterBiomeAsync(EnterBiomeCommand command);
}

public sealed record LocalBiomeCard(string BiomeId, string Activity, string? Result,
    string? Environment, bool CanEnter, string Reason);
public sealed record LocalBiomeLaunch(string GameId, long Revision, string BiomeId, string Scene,
    string? Environment = null, string? DecisionOperationId = null);

// Pure C# coordinator. Godot callbacks execute on their caller context, never inside the storage worker.
public sealed class LocalBiomeSelection
{
    private readonly ILocalBiomeStore _store;
    private readonly string _owner, _game;
    private int _busy;
    private volatile bool _invalid;
    private IReadOnlyList<BiomeAccess> _progress = Array.Empty<BiomeAccess>();
    private GameAggregate? _last;
    private EnterBiomeCommand? _pending;
    private LocalBiomeLaunch? _plan;
    public bool Busy => Volatile.Read(ref _busy) != 0;
    public bool Ready { get; private set; }
    public string Code { get; private set; } = "LOADING";
    public LocalBiomeSelection(ILocalBiomeStore store, string owner, string game)
    { SaveValidation.Id(owner); SaveValidation.Id(game); (_store, _owner, _game) = (store, owner, game); }
    public static string? BiomeFor(int level) => level switch
    { 0 => "ocean", 1 => "jungle", 2 => "desert", 3 => "forest", 4 => "tundra", _ => null };
    public static string? HumanSceneFor(string biome) => biome switch
    {
        "ocean" => "res://scenes/levels/DesicionDelfin.tscn",
        "jungle" => "res://scenes/levels/DesicionMono.tscn",
        "desert" => "res://scenes/levels/DesicionRataCanguro.tscn",
        "forest" => "res://scenes/levels/DesicionZorro.tscn",
        "tundra" => "res://scenes/levels/DesicionNieve.tscn", _ => null
    };
    public static string? AnimalSceneFor(string biome) => biome switch
    {
        "ocean" => "res://scenes/levels/bioma_mar.tscn",
        "jungle" => "res://scenes/levels/bioma_selva.tscn",
        "desert" => "res://scenes/levels/bioma_desierto.tscn",
        "forest" => "res://scenes/levels/bioma_bosque.tscn",
        "tundra" => "res://scenes/levels/bioma_nieve.tscn", _ => null
    };
    private bool ValidGame(GameAggregate? state) => state is not null && state.Game.LocalPlayerId == _owner &&
        state.Game.GameId == _game && state.Game.IsCurrent && state.Game.Status == "in_progress";
    private static bool Boundary(GameAggregate state) => state.Snapshot.PayloadVersion == 1 &&
        state.Snapshot.CapturedRevision == state.Game.Revision && state.Snapshot.SnapshotJson == GameSaveService.BoundarySnapshot;
    private bool Fail(string code) { Code = code; return false; }
    private async Task<GameAggregate?> ReadActive()
    {
        var result = await _store.GetActiveGameAsync(_owner);
        if (_invalid) return null;
        if (!result.Success) { Code = result.Code; return null; }
        if (!ValidGame(result.Data)) { Code = "GAME_NOT_ACTIVE"; return null; }
        _last = result.Data;
        return result.Data;
    }
    public async Task<bool> RefreshAsync()
    {
        if (_invalid || Interlocked.CompareExchange(ref _busy, 1, 0) != 0) return false;
        Ready = false;
        try
        {
            if (await ReadActive() is null) return false;
            var progress = await _store.GetGameProgressAsync(_owner, _game);
            if (_invalid) return false;
            if (!progress.Success || progress.Data is null) return Fail(progress.Success ? "INVALID_DATA" : progress.Code);
            _progress = progress.Data;
            Ready = true; Code = "READY"; return true;
        }
        catch { return Fail("STORAGE_ERROR"); }
        finally { Interlocked.Exchange(ref _busy, 0); }
    }
    public LocalBiomeCard Describe(string biome)
    {
        var access = _progress.SingleOrDefault(x => x.Progress.BiomeId == biome);
        bool completed = access?.Progress.Status == "completed";
        string reason = HumanSceneFor(biome) is null ? "UNKNOWN_BIOME" : completed ? "BIOME_COMPLETED" :
            access?.Availability != "available" ? access?.Reason ?? "LOADING" :
            access.Progress.Status == "animal_pending" && access.CanEnterAnimal ? "ANIMAL_FROM_START" :
            access.Progress.Status != "human_pending" ? "RESUME_UNSUPPORTED" :
            !access.CanEnterHuman ? access.Reason : "AVAILABLE";
        bool can = Ready && !_invalid && !Busy && reason is ("AVAILABLE" or "ANIMAL_FROM_START") && (_pending is null || _pending.BiomeId == biome);
        return new(biome, access?.Activity ?? "pending", access?.Progress.Result,
            _last?.Environments.SingleOrDefault(x => x.BiomeId == biome)?.StateKind, can, reason);
    }
    public bool IsCurrent(LocalBiomeLaunch plan) => !_invalid && ReferenceEquals(_plan, plan);
    public void Invalidate() { _invalid = true; Ready = false; _plan = null; }

    public async Task<bool> EnterAsync(string biome, Func<string, bool> sceneExists,
        Func<LocalBiomeLaunch, Task<bool>> navigate)
    {
        if (_invalid || Interlocked.CompareExchange(ref _busy, 1, 0) != 0) return false;
        _plan = null;
        try
        {
            string? scene = HumanSceneFor(biome);
            if (scene is null) return Fail("UNKNOWN_BIOME");
            if (_pending is not null && _pending.BiomeId != biome) return Fail("PENDING_OPERATION");
            var active = await ReadActive();
            if (active is null) return false;
            var access = await _store.GetBiomeAccessAsync(_owner, _game, biome);
            if (_invalid) return false;
            if (!access.Success || access.Data is null) return Fail(access.Success ? "INVALID_DATA" : access.Code);
            if (access.Data.Progress.GameId != _game || access.Data.Progress.BiomeId != biome) return Fail("INVALID_DATA");
            if (access.Data.Progress.Status == "completed") return Fail("BIOME_COMPLETED");
            if (access.Data.Availability != "available") return Fail(access.Data.Reason);
            LocalAnimalContext? animal=null;
            if (access.Data.Progress.Status=="animal_pending" && access.Data.CanEnterAnimal)
            {
                if (_pending is not null) return Fail("PENDING_OPERATION");
                if (_store is not ILocalAnimalStore animalStore) return Fail("STORAGE_CLOSED");
                var recovered=await LocalAnimalEntryReader.ReadAsync(animalStore,_owner,_game,biome);
                if (_invalid) return false;
                if (!recovered.Success || recovered.Data is null) return Fail(recovered.Code);
                animal=recovered.Data;scene=AnimalSceneFor(biome)!;
                active=(await ReadActive())!;
                if (active is null || active.Game.Revision!=animal.Revision) return Fail("REVISION_CONFLICT");
            }
            else if (access.Data.Progress.Status!="human_pending" || !access.Data.CanEnterHuman) return Fail("RESUME_UNSUPPORTED");
            if (!Boundary(active)) return Fail("RESUME_UNSUPPORTED");
            // Existence callback runs before any mutation. Scene is always resolved from the closed catalogue.
            if (!sceneExists(scene)) return Fail("SCENE_UNAVAILABLE");
            bool confirmedBoundary = active.Game.CurrentBiomeId == biome && active.Game.ResumeKind == "human_decision";
            long revision = active.Game.Revision;
            if (animal is null && (_pending is not null || !confirmedBoundary))
            {
                _pending ??= new EnterBiomeCommand(Guid.NewGuid().ToString("D"), _owner, _game, revision, biome, "human");
                var result = await _store.EnterBiomeAsync(_pending);
                if (_invalid) return false;
                if (!result.Success)
                {
                    if (result.Code is "REVISION_CONFLICT" or "GAME_NOT_ACTIVE") _pending = null;
                    return Fail(result.Code);
                }
                var receipt = result.Receipt ?? result.Data;
                if (receipt is null || receipt.OperationId != _pending.OperationId || receipt.LocalPlayerId != _owner ||
                    receipt.GameId != _game || receipt.OperationKind != "enter_biome" || receipt.ResultRevision != _pending.ExpectedRevision + 1)
                    return Fail("INVALID_DATA");
                revision = receipt.ResultRevision.Value;
                _pending = null;
            }
            var confirmed = await ReadActive();
            if (confirmed is null) return false;
            if (confirmed.Game.Revision!=revision || !Boundary(confirmed)) return Fail("REVISION_CONFLICT");
            if (animal is null)
            {
                if (confirmed.Game.CurrentBiomeId!=biome || confirmed.Game.ResumeKind!="human_decision" ||
                    confirmed.Biomes.Single(x=>x.BiomeId==biome).Status!="human_pending") return Fail("REVISION_CONFLICT");
            }
            else if (confirmed.Biomes.Single(x=>x.BiomeId==biome).Status!="animal_pending" ||
                !confirmed.Decisions.Any(x=>x.BiomeId==biome&&x.OperationId==animal.Decision.OperationId)) return Fail("REVISION_CONFLICT");
            var updated = await _store.GetGameProgressAsync(_owner, _game);
            if (_invalid) return false;
            if (!updated.Success || updated.Data is null) return Fail(updated.Success ? "INVALID_DATA" : updated.Code);
            _progress = updated.Data; Ready = true;
            _plan = new(_game, revision, biome, scene, animal?.Environment.StateKind, animal?.Decision.OperationId);
            Code = "ENTER_CONFIRMED";
            try
            {
                if (!await navigate(_plan)) return Fail("NAVIGATION_FAILED");
            }
            catch { return Fail("NAVIGATION_FAILED"); }
            Code = "ENTERED"; return true;
        }
        catch (SaveException e) { return Fail(e.Code); }
        catch { return Fail("STORAGE_ERROR"); }
        finally { _plan = null; Interlocked.Exchange(ref _busy, 0); }
    }
    public static string MessageFor(string code) => code switch
    {
        "READY" or "AVAILABLE" => "Elige un bioma. Puedes jugar en cualquier orden.",
        "BIOME_COMPLETED" => "Bioma completado: no se puede repetir en esta partida.",
        "RESUME_UNSUPPORTED" => "Este bioma requiere una restauración todavía no disponible. Su progreso se conserva.",
        "SCENE_UNAVAILABLE" => "No se pudo encontrar la escena del bioma. No se modificó el progreso.",
        "NAVIGATION_FAILED" => "La entrada está guardada. Reintenta abrir el mismo bioma.",
        "GAME_NOT_ACTIVE" => "No hay una partida activa válida para esta selección.",
        "PENDING_OPERATION" => "Reintenta la entrada al mismo bioma para resolver el guardado pendiente.",
        "REVISION_CONFLICT" => "La partida cambió. Vuelve al menú y recupera el estado actual.",
        "ENTER_CONFIRMED" or "ENTERED" => "Entrada confirmada.",
        _ => "No se pudo confirmar la operación local. Se conserva el progreso guardado."
    };
}

// Narrow menu port: deliberately has no decisions, completion, resources, HTTP or scene API.
public interface ILocalMenuStore : IAsyncDisposable
{
    Task<LocalSaveResult<LocalProfile>> OpenAsync(string absolutePath);
    Task<LocalSaveResult<LocalProfile>> GetLocalProfileAsync();
    Task<LocalSaveResult<LocalProfile>> CreateLocalProfileAsync(ProfileCreationRequest request);
    Task<LocalSaveResult<bool>> HasUnfinishedGamesAsync(string owner);
    Task<LocalSaveResult<GameAggregate>> GetActiveGameAsync(string owner);
    Task<LocalSaveResult<GameAggregate>> LoadGameAsync(string owner, string game);
    Task<LocalSaveResult<GameAggregate>> CreateNewGameAsync(NewGameCommand command);
    Task<LocalSaveResult<IReadOnlyList<BiomeAccess>>> GetGameProgressAsync(string owner, string game);
}
public interface ILocalFinalStore
{
    Task<LocalSaveResult<SaveReceipt>> PrepareFinalAsync(PrepareFinalCommand command);
    Task<LocalSaveResult<SaveReceipt>> CloseGameAsync(CloseGameCommand command);
}

// Owned by the application context, never by a scene. Public async methods resume on caller context.
public sealed class LocalGameState : IAsyncDisposable
{
    private readonly ILocalMenuStore _store;
    private readonly string _path;
    private Task? _initialization;
    private ProfileCreationRequest? _pendingProfile;
    private NewGameCommand? _pendingGame;
    private LocalBiomeCompletion? _completion;
    private PrepareFinalCommand? _pendingFinal;
    private CloseGameCommand? _pendingClose;
    public const string FinalDestination="res://scenes/levels/Final.tscn";
    public bool HasPendingFinalPreparation => _pendingFinal is not null;
    public bool NeedsFinal => ActiveGame is not null && (ActiveGame.Game.Status=="final_pending" ||
        ActiveGame.Game.Status=="in_progress" && ActiveGame.Biomes.Count==5 && ActiveGame.Biomes.All(b=>b.Status=="completed"));
    public string? ConfirmedEnding => Ready && ActiveGame?.Game is {IsCurrent:true,Status:"final_pending",EndingRulesVersion:LocalFinalEvaluator.Version} g
        && g.Ending is "good" or "medium" or "bad" ? g.Ending : null;
    private bool _closed;
    private long _generation;
    private (string Game, long Revision, long Generation)? _selection;
    public bool Ready { get; private set; }
    public bool Busy { get; private set; }
    public string Code { get; private set; } = "NOT_INITIALIZED";
    public LocalProfile? Profile { get; private set; }
    public GameAggregate? ActiveGame { get; private set; }
    public IReadOnlyList<BiomeAccess> Progress { get; private set; } = Array.Empty<BiomeAccess>();
    public bool HasPendingWrite => _pendingProfile is not null || _pendingGame is not null || _completion?.Pending==true || _pendingFinal is not null || _pendingClose is not null;
    private bool _unfinished = true;
    public bool CanStartNewGame => Ready && !Busy && Profile is not null && !HasPendingWrite && !_unfinished;
    public bool CanContinue => Ready && !Busy && (_pendingProfile is null && _pendingGame is null && _completion?.Pending!=true) &&
        (IsMenuGame(ActiveGame) || NeedsFinal);
    public LocalGameState(ILocalMenuStore store, string path) => (_store, _path) = (store, path);

    public Task InitializeAsync() => _initialization ??= InitializeCore();
    private async Task InitializeCore()
    {
        Busy = true;
        try
        {
            var opened = await _store.OpenAsync(_path);
            if (_closed) return;
            if (!opened.Success) { Code = opened.Code; return; }
            Profile = opened.Data;
            Ready = true;
            await RefreshCore();
        }
        catch { if (!_closed) { Ready = false; Code = "STORAGE_ERROR"; } }
        finally { Busy = false; }
    }
    private bool IsMenuGame(GameAggregate? game) => Profile is not null && game is not null &&
        game.Game.LocalPlayerId == Profile.LocalPlayerId && game.Game.IsCurrent && game.Game.Status == "in_progress" &&
        game.Game.ResumeKind is ("menu" or "human_decision" or "decision_info" or "animal_start") && game.Snapshot.PayloadVersion == 1 &&
        game.Snapshot.CapturedRevision == game.Game.Revision && game.Snapshot.SnapshotJson == GameSaveService.BoundarySnapshot;

    private async Task<bool> RefreshCore()
    {
        _selection = null;
        ActiveGame = null;
        Progress = Array.Empty<BiomeAccess>();
        _unfinished = true;
        if (Profile is null) { Code = "PROFILE_REQUIRED"; return true; }
        var unfinished = await _store.HasUnfinishedGamesAsync(Profile.LocalPlayerId);
        if (_closed) return false;
        if (!unfinished.Success) { Code = unfinished.Code; return false; }
        _unfinished = unfinished.Data;
        var active = await _store.GetActiveGameAsync(Profile.LocalPlayerId);
        if (_closed) return false;
        if (!active.Success) { Code = active.Code; return false; }
        if (active.Data is null) { Code = _unfinished ? "GAME_IN_PROGRESS" : "NO_ACTIVE_GAME"; return true; }
        if (!active.Data.Game.IsCurrent || active.Data.Game.LocalPlayerId != Profile.LocalPlayerId || active.Data.Game.Status is not ("in_progress" or "final_pending"))
        { Code = "GAME_NOT_ACTIVE"; return false; }
        var progress = await _store.GetGameProgressAsync(Profile.LocalPlayerId, active.Data.Game.GameId);
        if (_closed) return false;
        if (!progress.Success || progress.Data is null) { Code = progress.Success ? "INVALID_DATA" : progress.Code; return false; }
        ActiveGame = active.Data;
        Progress = progress.Data;
        _generation++;
        Code = NeedsFinal ? "FINAL_PENDING" : IsMenuGame(ActiveGame) ? "READY" : "RESUME_UNSUPPORTED";
        return true;
    }

    public async Task<bool> RefreshAsync()
    {
        if (_closed || !Ready || Busy || HasPendingWrite) return false;
        Busy = true;
        try { return await RefreshCore(); }
        catch { Code = "STORAGE_ERROR"; return false; }
        finally { Busy = false; }
    }
    public async Task<bool> CreateProfileAsync(string name)
    {
        if (_closed || !Ready || Busy || Profile is not null || _pendingGame is not null) return false;
        Busy = true;
        try
        {
            _pendingProfile ??= GamePersistenceAdapter.PrepareProfileCreation(name);
            // A retry cannot silently substitute a different name for the same operation.
            if (_pendingProfile.DisplayName != SaveValidation.Name(name)) { Code = "PENDING_OPERATION"; return false; }
            var result = await _store.CreateLocalProfileAsync(_pendingProfile);
            if (_closed) return false;
            if (!result.Success) { Code = result.Code; return false; }
            var profile = await _store.GetLocalProfileAsync();
            if (_closed) return false;
            if (!profile.Success || profile.Data?.LocalPlayerId != _pendingProfile.LocalPlayerId)
            { Code = profile.Success ? "INVALID_DATA" : profile.Code; return false; }
            Profile = profile.Data;
            _pendingProfile = null;
            return await RefreshCore();
        }
        catch (SaveException e) { Code = e.Code; return false; }
        catch { Code = "STORAGE_ERROR"; return false; }
        finally { Busy = false; }
    }
    public async Task<bool> NewGameAsync()
    {
        if (_closed || !Ready || Busy || Profile is null || _pendingProfile is not null || _pendingFinal is not null || _pendingClose is not null) return false;
        Busy = true;
        try
        {
            if (_pendingGame is null)
            {
                if (!await RefreshCore()) return false;
                if (_unfinished) { Code = "GAME_IN_PROGRESS"; return false; }
                _pendingGame = GamePersistenceAdapter.PrepareNewGame(Profile.LocalPlayerId, ActiveGame?.Game);
            }
            var created = await _store.CreateNewGameAsync(_pendingGame);
            if (_closed) return false;
            if (!created.Success)
            {
                if (created.Code is "GAME_IN_PROGRESS" or "REVISION_CONFLICT")
                {
                    _pendingGame = null;
                    await RefreshCore();
                }
                Code = created.Code; return false;
            }
            if (created.Data?.Game.GameId != _pendingGame.GameId || created.Data.Game.LocalPlayerId != Profile.LocalPlayerId)
            { Code = "INVALID_DATA"; return false; }
            _pendingGame = null;
            return await RefreshCore();
        }
        catch (SaveException e) { Code = e.Code; return false; }
        catch { Code = "STORAGE_ERROR"; return false; }
        finally { Busy = false; }
    }

    // Ticket is created only after a fresh authoritative read; no entry into an animal scene.
    public async Task<bool> PrepareSelectionAsync()
    {
        if (!await RefreshAsync() || !CanContinue || ActiveGame?.Game.Status!="in_progress") return false;
        _selection = (ActiveGame!.Game.GameId, ActiveGame.Game.Revision, _generation);
        return true;
    }
    public bool CanEnterSelection => CanContinue && _selection is { } ticket &&
        ticket.Game == ActiveGame!.Game.GameId && ticket.Revision == ActiveGame.Game.Revision && ticket.Generation == _generation;
    public LocalBiomeSelection CreateBiomeSelection()
    {
        if (!CanEnterSelection || _store is not ILocalBiomeStore store) throw new SaveException("GAME_NOT_ACTIVE");
        return new LocalBiomeSelection(store, Profile!.LocalPlayerId, ActiveGame!.Game.GameId);
    }
    public LocalDecisionSession CreateDecisionSession(string biome, string key)
    {
        if (!Ready || Busy || HasPendingWrite || Profile is null || ActiveGame is null || _store is not ILocalDecisionStore store)
            throw new SaveException("STORAGE_CLOSED");
        return new LocalDecisionSession(store,Profile.LocalPlayerId,ActiveGame.Game.GameId,biome,key);
    }
    public Task<LocalSaveResult<LocalAnimalContext>> ReadAnimalEntryAsync(string biome)
    {
        if (_closed || !Ready || Busy || HasPendingWrite || Profile is null || ActiveGame is null || _store is not ILocalAnimalStore store)
            return Task.FromResult(new LocalSaveResult<LocalAnimalContext>(false,"STORAGE_CLOSED"));
        return LocalAnimalEntryReader.ReadAsync(store,Profile.LocalPlayerId,ActiveGame.Game.GameId,biome);
    }
    public void CancelSelection() => _selection = null;
    public async Task<bool> PrepareFinalAsync()
    {
        if(_closed || !Ready || Busy || Profile is null || _store is not ILocalFinalStore store ||
            _pendingClose is not null || _pendingProfile is not null || _pendingGame is not null || _completion?.Pending==true)return false;
        Busy=true;
        try
        {
            if(!await RefreshCore() || !NeedsFinal || ActiveGame is null)return false;
            if(ConfirmedEnding is not null && _pendingFinal is null)return true;
            _pendingFinal??=new(Guid.NewGuid().ToString("D"),Profile.LocalPlayerId,ActiveGame.Game.GameId,ActiveGame.Game.Revision);
            var result=await store.PrepareFinalAsync(_pendingFinal);
            if(!result.Success){Code=result.Code;return false;}
            if(!await RefreshCore() || ConfirmedEnding is null)return false;
            _pendingFinal=null;return true;
        }
        catch(SaveException e){Code=e.Code;return false;}
        catch{Code="STORAGE_ERROR";return false;}
        finally{Busy=false;}
    }
    public async Task<bool> NavigateFinalAsync(Func<Task<bool>> navigate)
    {
        if(!await PrepareFinalAsync())return false;
        try
        {
            if(ConfirmedEnding is null || !await navigate()){Code="NAVIGATION_FAILED";return false;}
            return true;
        }
        catch{Code="NAVIGATION_FAILED";return false;}
    }
    public async Task<bool> CloseFinalAsync(string gameId,string ending)
    {
        if(_closed || !Ready || Busy || Profile is null || _store is not ILocalFinalStore store || _pendingFinal is not null)return false;
        Busy=true;
        try
        {
            if(_pendingClose is null)
            {
                if(!await RefreshCore() || ActiveGame?.Game.GameId!=gameId || ConfirmedEnding!=ending)return false;
                _pendingClose=new(Guid.NewGuid().ToString("D"),Profile.LocalPlayerId,gameId,ActiveGame.Game.Revision,ending);
            }
            if(_pendingClose.GameId!=gameId || _pendingClose.ConfirmedEnding!=ending){Code="OPERATION_CONFLICT";return false;}
            var result=await store.CloseGameAsync(_pendingClose);
            if(!result.Success){Code=result.Code;return false;}
            if(!await RefreshCore())return false;
            _pendingClose=null;_completion=null;return true;
        }
        catch(SaveException e){Code=e.Code;return false;}
        catch{Code="STORAGE_ERROR";return false;}
        finally{Busy=false;}
    }
    public async Task<LocalSaveResult<LocalCompletionResult>> CompleteAnimalAsync(string biome)
    {
        if(_closed || !Ready || Busy || Profile is null || ActiveGame is null || _pendingGame is not null ||
            _pendingProfile is not null || _store is not ILocalCompletionStore store)return new(false,"STORAGE_CLOSED");
        if(_completion is not null && (_completion.Biome!=biome || _completion.GameId!=ActiveGame.Game.GameId))
        {
            if(_completion.Pending)return new(false,"PENDING_OPERATION");
            _completion=null;
        }
        _completion??=new(store,Profile.LocalPlayerId,ActiveGame.Game.GameId,biome);
        Busy=true;
        try
        {
            var result=await _completion.ConfirmAsync();
            if(_closed)return new(false,"STORAGE_CLOSED");
            if(!result.Success)return result;
            var previous=ActiveGame;
            try
            {
                if(!await RefreshCore()){ActiveGame=previous;return new(false,Code);}
            }
            catch{ActiveGame=previous;return new(false,"STORAGE_ERROR");}
            return result;
        }
        finally{Busy=false;}
    }
    public static string MessageFor(string code) => code switch
    {
        "FINAL_PENDING" => "Final local pendiente. Pulsa Continuar para mostrarlo o recuperarlo.",
        "PROFILE_REQUIRED" => "Escribe tu nombre para crear el perfil local.",
        "NO_ACTIVE_GAME" => "Puedes comenzar una nueva partida.",
        "READY" => "Continúa tu partida actual para terminarla.",
        "GAME_IN_PROGRESS" => "Hay una partida sin finalizar. No se puede crear otra.",
        "INVALID_NAME" => "Escribe un nombre válido.",
        "RESUME_UNSUPPORTED" => "Este punto requiere una restauración todavía no disponible. Tu progreso se conserva.",
        "GAME_NOT_ACTIVE" => "La partida no está activa. Su historial se conserva.",
        "PENDING_OPERATION" => "Reintenta la misma operación pendiente.",
        _ => "No se pudo confirmar el almacenamiento local. No se ha sustituido tu progreso."
    };
    public async ValueTask DisposeAsync()
    {
        _closed = true;
        Ready = false;
        _selection = null;
        await _store.DisposeAsync();
    }
}
