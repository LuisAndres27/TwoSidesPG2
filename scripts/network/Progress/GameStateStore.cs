#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using TwoSides.Network.Contracts;
using TwoSides.Network.Session;

namespace TwoSides.Network.Progress;

public enum ProgressApplyResult { Applied, StaleRevision, ConflictingSnapshot, InvalidSnapshot, SessionChanged }
public enum BiomeDestination { RecoveryRequired, Human, AnimalFromStart, Completed, FinalPending, UnknownBiome }
public sealed class BiomeSelection
{
    public BiomeDestination Destination { get; }
    public string? EnvironmentState { get; }
    public bool CanSelect => Destination == BiomeDestination.Human || Destination == BiomeDestination.AnimalFromStart;
    internal BiomeSelection(BiomeDestination destination, string? environment = null)
        => (Destination, EnvironmentState) = (destination, environment);
}

// Solo proyeccion de snapshots completos confirmados. No simula transiciones.
public sealed class GameStateStore : IDisposable
{
    private static readonly string[] BiomeIds = { "ocean", "jungle", "desert", "forest", "tundra" };
    private readonly SessionManager _session;
    private long _generation;
    private string? _owner;
    private GameDto? _game;
    private bool _verified;
    private bool _disposed;
    public GameStateStore(SessionManager session)
    {
        _session = session ?? throw new ArgumentNullException(nameof(session));
        _session.SessionChanged += OnSessionChanged;
        SynchronizeSession();
    }
    internal bool BelongsTo(SessionManager session) => ReferenceEquals(session, _session);
    private void OnSessionChanged(SessionState _) => SynchronizeSession();
    private void SynchronizeSession()
    {
        long generation = _session.Generation;
        var owner = _session.User?.Id;
        if (_disposed || generation != _generation || owner != _owner)
        {
            _game = null; _verified = false;
            _generation = generation; _owner = owner;
        }
    }
    public GameDto? Snapshot { get { SynchronizeSession(); return _game is null ? null : Copy(_game); } }
    public string? GameId { get { SynchronizeSession(); return _game?.Id; } }
    public long? Revision { get { SynchronizeSession(); return _game?.Revision; } }
    public bool IsVerified { get { SynchronizeSession(); return !_disposed && _owner is not null && _game is not null && _verified; } }
    public string? PendingEnding => IsVerified && _game!.Status == "final_pending" ? _game.Ending : null;

    internal void MarkUnverified() { SynchronizeSession(); _verified = false; }
    internal void MarkMissing(long generation)
    {
        SynchronizeSession();
        if (_generation == generation) { _game = null; _verified = false; }
    }
    internal ProgressApplyResult ApplyConfirmed(GameDto? game, long generation, bool authoritativeCurrent = false)
    {
        SynchronizeSession();
        if (_disposed || _owner is null || generation != _generation) return ProgressApplyResult.SessionChanged;
        if (!Valid(game)) { _verified = false; return ProgressApplyResult.InvalidSnapshot; }
        var incoming = Copy(game!);
        if (_game is not null)
        {
            if (_game.Id != incoming.Id && !authoritativeCurrent) return ProgressApplyResult.ConflictingSnapshot;
            if (_game.Id == incoming.Id)
            {
                if (incoming.Revision < _game.Revision) return ProgressApplyResult.StaleRevision;
                if (incoming.Revision == _game.Revision && ApiJson.Serialize(_game) != ApiJson.Serialize(incoming))
                    return ProgressApplyResult.ConflictingSnapshot;
            }
        }
        _game = incoming; _verified = true;
        return ProgressApplyResult.Applied;
    }

    public BiomeSelection Select(string biomeId)
    {
        if (!BiomeIds.Contains(biomeId)) return new(BiomeDestination.UnknownBiome);
        if (!IsVerified) return new(BiomeDestination.RecoveryRequired);
        if (_game!.Status == "final_pending") return new(BiomeDestination.FinalPending);
        var biome = _game.Biomes.Single(b => b.BiomeId == biomeId);
        if (biome.Status == "completed") return new(BiomeDestination.Completed, biome.EnvironmentState);
        if (!biome.Available) return new(BiomeDestination.RecoveryRequired);
        return biome.Status == "human_pending" ? new(BiomeDestination.Human) :
            new(BiomeDestination.AnimalFromStart, biome.EnvironmentState);
    }

    private static bool Valid(GameDto? game)
    {
        if (game is null || game.Id is null || !Regex.IsMatch(game.Id, "\\A[a-fA-F0-9]{24}\\z") ||
            !game.IsCurrent || game.SchemaVersion != 1 || game.RulesVersion != "1.0.0" ||
            game.Revision < 0 || game.Revision > 9007199254740991L || game.ArchivedAt is not null ||
            game.Biomes is null || game.Biomes.Length != 5 ||
            game.Biomes.Any(b => b is null || !BiomeIds.Contains(b.BiomeId)) ||
            game.Biomes.Select(b => b.BiomeId).Distinct().Count() != 5) return false;
        foreach (var biome in game.Biomes)
        {
            if (biome.Status == "human_pending")
            {
                if (!biome.Available || biome.EnvironmentState is not null || biome.Result is not null ||
                    biome.HumanCompletedAt is not null || biome.AnimalCompletedAt is not null) return false;
            }
            else
            {
                if ((biome.EnvironmentState != "healthy" && biome.EnvironmentState != "degraded") || biome.HumanCompletedAt is null) return false;
                if (biome.Status == "animal_pending")
                {
                    if (!biome.Available || biome.Result is not null || biome.AnimalCompletedAt is not null) return false;
                }
                else if (biome.Status == "completed")
                {
                    if (biome.Available || biome.AnimalCompletedAt is null ||
                        biome.Result != (biome.EnvironmentState == "healthy" ? "good" : "bad")) return false;
                }
                else return false;
            }
        }
        if (game.Status == "in_progress") return game.Biomes.Any(b => b.Status != "completed") &&
            game.Ending is null && game.CompletedAt is null && game.GoodBiomeCount is null && game.EndingRulesVersion is null;
        return game.Status == "final_pending" && game.Biomes.All(b => b.Status == "completed") &&
            (game.Ending == "good" || game.Ending == "medium" || game.Ending == "bad") && game.CompletedAt is not null &&
            game.GoodBiomeCount == game.Biomes.Count(b => b.Result == "good") && game.EndingRulesVersion == game.RulesVersion;
    }
    private static GameDto Copy(GameDto game) => new()
    {
        Id = game.Id, IsCurrent = game.IsCurrent, Status = game.Status, Revision = game.Revision,
        SchemaVersion = game.SchemaVersion, RulesVersion = game.RulesVersion,
        Biomes = BiomeIds.Select(id => game.Biomes.Single(b => b.BiomeId == id)).Select(b => new BiomeDto {
            BiomeId = b.BiomeId, Available = b.Available, Status = b.Status, EnvironmentState = b.EnvironmentState,
            Result = b.Result, HumanCompletedAt = b.HumanCompletedAt, AnimalCompletedAt = b.AnimalCompletedAt }).ToArray(),
        Ending = game.Ending, GoodBiomeCount = game.GoodBiomeCount, EndingRulesVersion = game.EndingRulesVersion,
        CompletedAt = game.CompletedAt, ArchivedAt = game.ArchivedAt, CreatedAt = game.CreatedAt, UpdatedAt = game.UpdatedAt
    };
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true; _session.SessionChanged -= OnSessionChanged;
        _game = null; _owner = null; _verified = false;
    }
}
