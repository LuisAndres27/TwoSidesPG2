#nullable enable
using System;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Session;

namespace TwoSides.Network.Services;

public sealed class EndingService : IDisposable
{
    private readonly GameApplicationServices _app;
    private string? _owner, _game;
    private FinalExitRequestDto? _command;
    private FinalExitConfirmationDto? _receipt;
    private bool _disposed;
    public bool Busy { get; private set; }
    public bool HasPending => _command is not null && _owner == _app.Session.User?.Id;
    public FinalExitRequestDto? Pending => HasPending ? _command : null;
    public string? ConfirmedEnding => !_disposed && _app.Session.IsAuthenticated && _app.Progress.IsVerified &&
        _app.Progress.Snapshot is { Status: "final_pending", Ending: "good" or "medium" or "bad" } game ? game.Ending : null;
    public EndingService(GameApplicationServices app) { _app = app; app.Session.SessionChanged += Changed; }
    private void Changed(SessionState state) { if (state == SessionState.Authenticated && _owner is not null && _owner != _app.Session.User?.Id) Clear(); }
    public Task<ApiResult<FinalExitConfirmationDto>> ExitAsync()
    {
        if (Busy) return Task.FromResult(ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Conflict));
        if (HasPending) return RetryAsync();
        if (ConfirmedEnding is null) return Task.FromResult(ApiResult<FinalExitConfirmationDto>.Failed(_app.Session.IsAuthenticated ? ApiFailure.Conflict : ApiFailure.Unauthorized));
        _owner = _app.Session.User!.Id; _game = _app.Progress.GameId;
        _command = new() { EventId = Guid.NewGuid(), ExpectedRevision = _app.Progress.Revision!.Value };
        return RetryAsync();
    }
    public async Task<ApiResult<FinalExitConfirmationDto>> RetryAsync()
    {
        if (_disposed || Busy) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Conflict);
        if (!HasPending || !_app.Session.TryGetToken(out var token)) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Unauthorized);
        Busy = true; var command = _command; long generation = _app.Session.Generation;
        bool Same() => !_disposed && ReferenceEquals(command, _command) && generation == _app.Session.Generation && _app.Session.IsAuthenticated;
        try
        {
            if (_receipt is null)
            {
                var result = await _app.Api.PostAsync<FinalExitRequestDto, FinalExitConfirmationDto>($"/api/v1/me/games/{_game}/final-exit", command!, token);
                if (!Same()) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Cancelled);
                if (!result.IsSuccess)
                {
                    if (result.Failure == ApiFailure.Unauthorized || result.HttpStatus == 401) _app.Session.ObserveUnauthorized(token!);
                    return result;
                }
                var receipt = result.Data;
                if (receipt is null || receipt.EventId != command!.EventId || receipt.GameId != _game || receipt.Operation != "final_exit" ||
                    receipt.Revision != command.ExpectedRevision + 1 || string.IsNullOrEmpty(receipt.SuccessorGameId) || receipt.SuccessorGameId == _game)
                    return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.InvalidResponse);
                _receipt = receipt;
            }
            var current = await _app.Games.CurrentAsync();
            if (!Same()) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Cancelled);
            if (!current.IsSuccess) return ApiResult<FinalExitConfirmationDto>.Failed(current.Failure, current.HttpStatus);
            if (!SuccessorConfirmed) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Conflict);
            if (_app.Journal is not null && !_app.Journal.Remove(_owner!,_game!,command!.EventId)) return ApiResult<FinalExitConfirmationDto>.Failed(ApiFailure.Configuration);
            return ApiResult<FinalExitConfirmationDto>.Success(200, _receipt!);
        }
        catch { return ApiResult<FinalExitConfirmationDto>.Failed(Same() ? ApiFailure.Transport : ApiFailure.Cancelled); }
        finally { Busy = false; }
    }
    public bool SuccessorConfirmed => HasPending && _receipt is not null && _app.Progress.IsVerified &&
        _app.Progress.Snapshot is { Status: "in_progress", Revision: 0, Ending: null } game && game.Id == _receipt.SuccessorGameId &&
        game.Biomes.All(b => b.Status == "human_pending" && b.Available && b.EnvironmentState is null && b.Result is null);
    public bool Acknowledge() { if (Busy || !SuccessorConfirmed) return false; Clear(); return true; }
    internal void Clear() { _owner = null; _game = null; _command = null; _receipt = null; }
    public void Dispose() { _disposed = true; Clear(); _app.Session.SessionChanged -= Changed; }
}
