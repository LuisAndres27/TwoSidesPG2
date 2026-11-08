#nullable enable
using System;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Progress;
using TwoSides.Network.Session;

namespace TwoSides.Network.Services;

public sealed class PendingOceanDecision
{
    public string UserId { get; }
    public string GameId { get; }
    public DecisionRequestDto Command { get; }
    internal PendingOceanDecision(string userId, string gameId, DecisionRequestDto command)
        => (UserId, GameId, Command) = (userId, gameId, command);
}

// Unico comando pendiente, solo memoria. Ningun metodo repite POST automaticamente.
public class EnvironmentalDecisionService : IDisposable
{
    private readonly IApiClient _client;
    private readonly SessionManager _session;
    private readonly GameStateStore _store;
    private readonly ICurrentGameService _games;
    private readonly string _biomeId, _decisionId;
    private readonly PendingOperationStore? _journal;
    private PendingOceanDecision? _pending;
    private DecisionConfirmationDto? _receipt;
    private bool _busy, _disposed;
    public bool NeedsRecovery { get; private set; }
    public bool CanPresentConfirmed => !_disposed && !_busy && _session.IsAuthenticated &&
        _pending is not null && _session.User?.Id == _pending.UserId && _receipt is not null && ValidateSnapshot().IsSuccess;
    public PendingOceanDecision? Pending => _session.User?.Id == _pending?.UserId ? _pending : null;
    public static string OptionFor(bool choseNo) => choseNo ? "reject" : "approve";
    public EnvironmentalDecisionService(IApiClient client, SessionManager session, GameStateStore store, ICurrentGameService games, string biomeId, string decisionId, PendingOperationStore? journal = null)
    {
        _journal = journal;
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _session = session ?? throw new ArgumentNullException(nameof(session));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _games = games ?? throw new ArgumentNullException(nameof(games));
        if (!store.BelongsTo(session)) throw new ArgumentException("Sesion y progreso incompatibles.");
        if (!DecisionCatalog.Matches(biomeId, decisionId)) throw new ArgumentException("Decision incompatible con el bioma.");
        _biomeId = biomeId; _decisionId = decisionId;
        _session.SessionChanged += OnSession;
    }
    private void OnSession(SessionState state)
    {
        // Un 401 conserva el comando para la misma cuenta tras autenticarse.
        // Una cuenta diferente nunca puede enviarlo ni verlo.
        if (state == SessionState.Authenticated && _pending is not null && _session.User?.Id != _pending.UserId)
        { _pending = null; _receipt = null; NeedsRecovery = false; }
        else if (state != SessionState.Authenticated && _pending is not null) NeedsRecovery = true;
    }
    private static ApiResult<DecisionConfirmationDto> Fail(ApiFailure failure) => ApiResult<DecisionConfirmationDto>.Failed(failure);

    public async Task<ApiResult<DecisionConfirmationDto>> ConfirmAsync(bool choseNo)
    {
        if (_disposed) return Fail(ApiFailure.Configuration);
        if (_busy) return Fail(ApiFailure.Conflict);
        if (_pending is not null) return Fail(ApiFailure.Conflict); // Solo RetryAsync puede reutilizarlo.
        if (!_session.TryGetToken(out _)) return Fail(ApiFailure.Unauthorized);
        var owner = _session.User;
        if (owner is null) return Fail(ApiFailure.Unauthorized);
        var game = _store.Snapshot;
        if (!_store.IsVerified || game is null || game.Status != "in_progress" ||
            _store.Select(_biomeId).Destination != BiomeDestination.Human) return Fail(ApiFailure.Conflict);
        _pending = new(owner.Id, game.Id, new() { EventId = Guid.NewGuid(), ExpectedRevision = game.Revision,
            BiomeId = _biomeId, DecisionId = _decisionId, OptionId = OptionFor(choseNo) });
        return await SendPending();
    }

    public async Task<ApiResult<DecisionConfirmationDto>> RecoverAsync()
    {
        if (_disposed) return Fail(ApiFailure.Configuration);
        if (_busy || _pending is null) return Fail(ApiFailure.Conflict);
        if (!_session.IsAuthenticated || _session.User?.Id != _pending.UserId) return Fail(ApiFailure.Unauthorized);
        _busy = true;
        var pending = _pending; long generation = _session.Generation;
        try
        {
            var result = await _games.CurrentAsync();
            if (_disposed || generation != _session.Generation || !ReferenceEquals(pending, _pending)) return Fail(ApiFailure.Cancelled);
            if (!result.IsSuccess) return Fail(result.Failure);
            if (_store.GameId != pending.GameId) return Fail(ApiFailure.Conflict);
            NeedsRecovery = false;
            // Recuperar progreso no demuestra que ESTE eventId haya sido confirmado.
            // Un reintento explicito recuperara su recibo, salvo que ya lo tengamos.
            var validated = _receipt is not null ? ValidateSnapshot() : Fail(ApiFailure.Conflict);
            if (validated.IsSuccess && _journal is not null && !_journal.Remove(pending.UserId,pending.GameId,pending.Command.EventId)) return Fail(ApiFailure.Configuration);
            return validated;
        }
        catch
        {
            if (_disposed || generation != _session.Generation || !ReferenceEquals(pending, _pending)) return Fail(ApiFailure.Cancelled);
            NeedsRecovery = true; return Fail(ApiFailure.Transport);
        }
        finally { _busy = false; }
    }
    public Task<ApiResult<DecisionConfirmationDto>> RetryAsync()
    {
        if (_disposed) return Task.FromResult(Fail(ApiFailure.Configuration));
        if (_busy || _pending is null || NeedsRecovery) return Task.FromResult(Fail(ApiFailure.Conflict));
        return SendPending();
    }

    private async Task<ApiResult<DecisionConfirmationDto>> SendPending()
    {
        if (!_session.TryGetToken(out var token) || _session.User?.Id != _pending?.UserId) return Fail(ApiFailure.Unauthorized);
        _busy = true;
        var pending = _pending!; long generation = _session.Generation;
        try
        {
            _store.MarkUnverified();
            if (_receipt is null)
            {
                var result = await _client.PostAsync<DecisionRequestDto, DecisionConfirmationDto>(
                    $"/api/v1/me/games/{pending.GameId}/decisions", pending.Command, token);
                if (_disposed || generation != _session.Generation || !ReferenceEquals(pending, _pending)) return Fail(ApiFailure.Cancelled);
                if (!result.IsSuccess)
                {
                    if (result.Failure == ApiFailure.Unauthorized || result.HttpStatus == 401) _session.ObserveUnauthorized(token!);
                    if (result.Failure == ApiFailure.Conflict || result.HttpStatus == 409) NeedsRecovery = true;
                    return result;
                }
                var receipt = result.Data;
                if (receipt is null || receipt.EventId != pending.Command.EventId || receipt.GameId != pending.GameId ||
                    receipt.Revision != pending.Command.ExpectedRevision + 1 || receipt.Decision is null ||
                    receipt.Decision.BiomeId != _biomeId || receipt.Decision.DecisionId != _decisionId ||
                    receipt.Decision.OptionId != pending.Command.OptionId ||
                    (receipt.Decision.EnvironmentState != "healthy" && receipt.Decision.EnvironmentState != "degraded"))
                { NeedsRecovery = true; return Fail(ApiFailure.InvalidResponse); }
                _receipt = receipt;
            }
            // El recibo es parcial y puede ser antiguo: recuperar snapshot completo,
            // nunca inventarlo ni bajar revision para aplicar una confirmacion.
            NeedsRecovery = true;
            var recovery = await _games.CurrentAsync();
            if (_disposed || generation != _session.Generation || !ReferenceEquals(pending, _pending)) return Fail(ApiFailure.Cancelled);
            if (!recovery.IsSuccess) return Fail(recovery.Failure);
            var validated = ValidateSnapshot();
            if (validated.IsSuccess)
            {
                if (_journal is not null && !_journal.Remove(pending.UserId,pending.GameId,pending.Command.EventId)) return Fail(ApiFailure.Configuration);
                NeedsRecovery = false;
            }
            return validated;
        }
        catch
        {
            if (_disposed || generation != _session.Generation || !ReferenceEquals(pending, _pending)) return Fail(ApiFailure.Cancelled);
            NeedsRecovery = true; return Fail(ApiFailure.Transport);
        }
        finally { _busy = false; }
    }
    private ApiResult<DecisionConfirmationDto> ValidateSnapshot()
    {
        var game = _store.Snapshot;
        var biome = game?.Biomes.SingleOrDefault(b => b.BiomeId == _biomeId);
        if (_receipt is null || _pending is null || !_store.IsVerified || game?.Id != _pending.GameId ||
            game.Status != "in_progress" || game.Revision < _receipt.Revision || biome?.Status != "animal_pending" ||
            biome.EnvironmentState != _receipt.Decision.EnvironmentState || biome.HumanCompletedAt != _receipt.Decision.ConfirmedAt ||
            game.RulesVersion != _receipt.Decision.RulesVersion)
        { NeedsRecovery = true; return Fail(ApiFailure.Conflict); }
        return ApiResult<DecisionConfirmationDto>.Success(200, _receipt);
    }
    internal void ClearPending()
    {
        _pending = null; _receipt = null; NeedsRecovery = false;
    }
    public void Dispose()
    {
        _disposed = true; _session.SessionChanged -= OnSession;
        _pending = null; _receipt = null; NeedsRecovery = false;
    }
}
