#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Progress;
using TwoSides.Network.Session;

namespace TwoSides.Network.Services;

public sealed class GameService : ICurrentGameService
{
    private readonly IApiClient _client;
    private readonly SessionManager _session;
    private readonly GameStateStore _store;
    private readonly SemaphoreSlim _requests = new(1, 1);
    public GameService(IApiClient client, SessionManager session, GameStateStore store)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _session = session ?? throw new ArgumentNullException(nameof(session));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        if (!store.BelongsTo(session)) throw new ArgumentException("Sesion y progreso deben corresponder.");
    }
    public Task<ApiResult<GameResponseDto>> CurrentAsync() => Recover(false);
    public Task<ApiResult<GameResponseDto>> CreateOrGetAsync() => Recover(true);

    private async Task<ApiResult<GameResponseDto>> Recover(bool allowCreate)
    {
        await _requests.WaitAsync();
        try
        {
            if (!_session.TryGetToken(out var token))
                return ApiResult<GameResponseDto>.Failed(ApiFailure.Unauthorized);
            long generation = _session.Generation;
            _store.MarkUnverified();
            bool SameSession() => _session.Generation == generation && _session.IsAuthenticated;
            var response = await _client.GetAsync<GameResponseDto>("/api/v1/me/games/current", token);
            if (!SameSession()) return ApiResult<GameResponseDto>.Failed(ApiFailure.Cancelled);
            bool missing = response.Failure == ApiFailure.NotFound && response.HttpStatus == 404 &&
                response.Error?.Code == "CURRENT_GAME_NOT_FOUND";
            if (missing)
            {
                _store.MarkMissing(generation);
                if (allowCreate)
                {
                    // El servidor garantiza unicidad incluso si otro cliente crea entre GET/POST.
                    response = await _client.PostAsync<CreateGameRequestDto, GameResponseDto>("/api/v1/me/games", new(), token);
                    if (!SameSession()) return ApiResult<GameResponseDto>.Failed(ApiFailure.Cancelled);
                }
            }
            if (response.Failure == ApiFailure.Unauthorized || response.HttpStatus == 401)
                _session.ObserveUnauthorized(token!);
            if (!response.IsSuccess) return response;
            var applied = _store.ApplyConfirmed(response.Data?.Game, generation, authoritativeCurrent: true);
            if (applied == ProgressApplyResult.Applied)
                return ApiResult<GameResponseDto>.Success(response.HttpStatus!.Value, new() { Game = _store.Snapshot! });
            return ApiResult<GameResponseDto>.Failed(applied == ProgressApplyResult.InvalidSnapshot ? ApiFailure.InvalidResponse :
                applied == ProgressApplyResult.SessionChanged ? ApiFailure.Cancelled : ApiFailure.Conflict);
        }
        finally { _requests.Release(); }
    }
}
