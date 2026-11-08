#nullable enable
using System;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Session;

namespace TwoSides.Network.Services;

public sealed class PendingAnimalOperation
{
    public string UserId { get; }
    public string GameId { get; }
    public string Operation { get; }
    public AnimalCompletionRequestDto Command { get; }
    internal string Environment { get; }
    internal string Rules { get; }
    internal DateTimeOffset? HumanCompletedAt { get; }
    internal PendingAnimalOperation(string user, GameDto game, BiomeDto biome, string operation, AnimalCompletionRequestDto command)
        => (UserId, GameId, Environment, Rules, HumanCompletedAt, Operation, Command) =
           (user, game.Id, biome.EnvironmentState!, game.RulesVersion, biome.HumanCompletedAt, operation, command);
}

// Un solo comando compartido en memoria. No inicia HTTP en el constructor.
public sealed class AnimalProgressService : IDisposable
{
    private readonly GameApplicationServices _app;
    private PendingAnimalOperation? _pending;
    private AnimalConfirmationDto? _receipt;
    private bool _disposed;
    private DateTimeOffset _retryAt;
    public bool Busy { get; private set; }
    public bool NeedsRecovery { get; private set; }
    public PendingAnimalOperation? Pending => _app.Session.User?.Id == _pending?.UserId ? _pending : null;
    public bool BlocksGameplay => _pending is not null;
    public AnimalProgressService(GameApplicationServices app) { _app = app; _app.Session.SessionChanged += OnSession; }
    private void OnSession(SessionState state)
    {
        if (state == SessionState.Authenticated && _pending is not null && _app.Session.User?.Id != _pending.UserId) Clear();
    }
    private static ApiResult<AnimalConfirmationDto> Fail(ApiFailure failure) => ApiResult<AnimalConfirmationDto>.Failed(failure);
    public Task<ApiResult<AnimalConfirmationDto>> CompleteAsync(string biome) => Begin(biome, null);
    public Task<ApiResult<AnimalConfirmationDto>> RestartAsync(string biome, string reason)
        => reason == "death" || reason == "voluntary" ? Begin(biome, reason) : Task.FromResult(Fail(ApiFailure.BadRequest));
    private Task<ApiResult<AnimalConfirmationDto>> Begin(string biomeId, string? reason)
    {
        if (_disposed) return Task.FromResult(Fail(ApiFailure.Configuration));
        if (Busy || _pending is not null) return Task.FromResult(Fail(ApiFailure.Conflict));
        if (!_app.Session.IsAuthenticated) return Task.FromResult(Fail(ApiFailure.Unauthorized));
        var game = _app.Progress.Snapshot;
        var biome = game?.Biomes.SingleOrDefault(b => b.BiomeId == biomeId);
        if (!_app.Progress.IsVerified || game?.Status != "in_progress" || biome?.Status != "animal_pending") return Task.FromResult(Fail(ApiFailure.Conflict));
        var id = Guid.NewGuid();
        AnimalCompletionRequestDto command = reason is null
            ? new AnimalCompletionRequestDto { EventId = id, ExpectedRevision = game.Revision, BiomeId = biomeId }
            : new AnimalRestartRequestDto { EventId = id, ExpectedRevision = game.Revision, BiomeId = biomeId, Reason = reason };
        _pending = new(_app.Session.User!.Id, game, biome, reason is null ? "animal_completion" : "animal_restart", command);
        return Send();
    }
    public async Task<ApiResult<AnimalConfirmationDto>> RetryAsync()
    {
        if (_disposed) return Fail(ApiFailure.Configuration);
        if (Busy || Pending is null) return Fail(_app.Session.IsAuthenticated ? ApiFailure.Conflict : ApiFailure.Unauthorized);
        if (DateTimeOffset.UtcNow < _retryAt) return Fail(ApiFailure.RateLimited);
        if (NeedsRecovery)
        {
            Busy = true; var pending = _pending; long generation = _app.Session.Generation;
            try
            {
                var recovery = await _app.Games.CurrentAsync();
                if (!Same(pending, generation)) return Fail(ApiFailure.Cancelled);
                if (!recovery.IsSuccess) return Fail(recovery.Failure);
                NeedsRecovery = false;
            }
            catch { return Same(pending, generation) ? Fail(ApiFailure.Transport) : Fail(ApiFailure.Cancelled); }
            finally { Busy = false; }
        }
        return await Send();
    }
    private bool Same(PendingAnimalOperation? pending, long generation) => !_disposed &&
        ReferenceEquals(pending, _pending) && _app.Session.Generation == generation && _app.Session.IsAuthenticated;
    private async Task<ApiResult<AnimalConfirmationDto>> Send()
    {
        if (!_app.Session.TryGetToken(out var token) || Pending is null) return Fail(ApiFailure.Unauthorized);
        Busy = true; var pending = _pending!; long generation = _app.Session.Generation;
        try
        {
            _app.Progress.MarkUnverified();
            if (_receipt is null)
            {
                var result = pending.Command is AnimalRestartRequestDto restart
                    ? await _app.Api.PostAsync<AnimalRestartRequestDto, AnimalConfirmationDto>($"/api/v1/me/games/{pending.GameId}/animal-restarts", restart, token)
                    : await _app.Api.PostAsync<AnimalCompletionRequestDto, AnimalConfirmationDto>($"/api/v1/me/games/{pending.GameId}/animal-completions", pending.Command, token);
                if (!Same(pending, generation)) return Fail(ApiFailure.Cancelled);
                if (!result.IsSuccess)
                {
                    if (result.Failure == ApiFailure.Unauthorized || result.HttpStatus == 401) _app.Session.ObserveUnauthorized(token!);
                    if (result.Failure == ApiFailure.Conflict || result.HttpStatus == 409) NeedsRecovery = true;
                    if (result.Failure == ApiFailure.RateLimited || result.HttpStatus == 429)
                    {
                        double seconds = 60;
                        if (int.TryParse(result.RetryAfter, out var delay) && delay >= 0) seconds = delay;
                        else if (DateTimeOffset.TryParse(result.RetryAfter, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) seconds = Math.Max(0, (date - DateTimeOffset.UtcNow).TotalSeconds);
                        _retryAt = DateTimeOffset.UtcNow.AddSeconds(seconds);
                    }
                    return result;
                }
                if (!ValidReceipt(result.Data, pending)) { NeedsRecovery = true; return Fail(ApiFailure.InvalidResponse); }
                _receipt = result.Data;
            }
            var recovery = await _app.Games.CurrentAsync();
            if (!Same(pending, generation)) return Fail(ApiFailure.Cancelled);
            if (!recovery.IsSuccess) return Fail(recovery.Failure);
            if (!CanApply()) { NeedsRecovery = true; return Fail(ApiFailure.Conflict); }
            if (_app.Journal is not null && !_app.Journal.Remove(pending.UserId,pending.GameId,pending.Command.EventId)) return Fail(ApiFailure.Configuration);
            NeedsRecovery = false;
            return ApiResult<AnimalConfirmationDto>.Success(200, _receipt!);
        }
        catch { return Same(pending, generation) ? Fail(ApiFailure.Transport) : Fail(ApiFailure.Cancelled); }
        finally { Busy = false; }
    }
    private static bool ValidReceipt(AnimalConfirmationDto? receipt, PendingAnimalOperation pending)
    {
        bool restart = pending.Operation == "animal_restart";
        return receipt is not null && receipt.EventId == pending.Command.EventId && receipt.GameId == pending.GameId &&
            receipt.Revision == pending.Command.ExpectedRevision + 1 && receipt.Operation == pending.Operation && !receipt.FinalizationPending &&
            receipt.LocalAction == (restart ? "restart_animal_from_start" : "none") &&
            receipt.Biome?.BiomeId == pending.Command.BiomeId && receipt.Biome.EnvironmentState == pending.Environment &&
            receipt.Biome.Status == (restart ? "animal_pending" : "completed") && receipt.Biome.Available == restart &&
            (restart ? receipt.Biome.Result is null && receipt.Biome.AnimalCompletedAt is null && receipt.GameStatus == "in_progress"
                : (receipt.Biome.Result == "good" || receipt.Biome.Result == "bad") && receipt.Biome.AnimalCompletedAt is not null &&
                    (receipt.GameStatus == "in_progress" || receipt.GameStatus == "final_pending"));
    }
    public bool CanApply()
    {
        var pending = Pending; var game = _app.Progress.Snapshot;
        var biome = game?.Biomes.SingleOrDefault(b => b.BiomeId == pending?.Command.BiomeId);
        if (_disposed || pending is null || _receipt is null || !_app.Progress.IsVerified || game?.Id != pending.GameId || game.Revision < _receipt.Revision ||
            game.RulesVersion != pending.Rules || biome?.EnvironmentState != pending.Environment || biome.HumanCompletedAt != pending.HumanCompletedAt ||
            biome.Status != _receipt.Biome.Status || biome.Result != _receipt.Biome.Result || biome.AnimalCompletedAt != _receipt.Biome.AnimalCompletedAt) return false;
        if (pending.Operation == "animal_restart" && game.Status != "in_progress") return false;
        return game.Revision != _receipt.Revision || (game.Status == _receipt.GameStatus && game.Ending == _receipt.Ending &&
            game.GoodBiomeCount == _receipt.GoodBiomeCount && game.EndingRulesVersion == _receipt.EndingRulesVersion);
    }
    // Solo despues de que Godot acepte la recarga o salida confirmada.
    public void Acknowledge() { if (!Busy && CanApply()) Clear(); }
    internal void Clear() { _pending = null; _receipt = null; NeedsRecovery = false; _retryAt = default; }
    public void Dispose() { _disposed = true; Clear(); _app.Session.SessionChanged -= OnSession; }
}
