#nullable enable
using System.Threading.Tasks;
using TwoSides.Network.Contracts;

namespace TwoSides.Network.Services;

// Contratos reutilizables; autenticacion implementada aparte, sin timers ni reintentos.
public interface IAuthService
{
    Task<ApiResult<UserResponseDto>> RegisterAsync(RegisterRequestDto input);
    Task<ApiResult<LoginResponseDto>> LoginAsync(LoginRequestDto input);
    Task<ApiResult<UserResponseDto>> MeAsync(string jwt);
}
public interface IProgressService
{
    Task<ApiResult<GameResponseDto>> CurrentAsync(string jwt);
    Task<ApiResult<GameResponseDto>> CreateOrGetAsync(string jwt);
    Task<ApiResult<GameResponseDto>> GetAsync(string gameId, string jwt);
    Task<ApiResult<DecisionConfirmationDto>> DecideAsync(string gameId, DecisionRequestDto input, string jwt);
    Task<ApiResult<AnimalConfirmationDto>> CompleteAnimalAsync(string gameId, AnimalCompletionRequestDto input, string jwt);
    Task<ApiResult<AnimalConfirmationDto>> RestartAnimalAsync(string gameId, AnimalRestartRequestDto input, string jwt);
    Task<ApiResult<FinalExitConfirmationDto>> ExitFinalAsync(string gameId, FinalExitRequestDto input, string jwt);
    Task<ApiResult<GamesPageDto>> HistoryAsync(int page, int limit, string jwt);
    Task<ApiResult<DecisionsPageDto>> DecisionsAsync(string gameId, HistoryQuery query, string jwt);
}
// Superficie de etapa 3: identidad exclusivamente desde SessionManager.
// IProgressService se conserva como contrato preliminar de operaciones futuras.
public interface ICurrentGameService
{
    Task<ApiResult<GameResponseDto>> CurrentAsync();
    Task<ApiResult<GameResponseDto>> CreateOrGetAsync();
}
public interface IConnectionProbe
{
    // La futura implementacion decide la periodicidad; health solo comprueba HTTP.
    Task<ApiResult<HealthResponseDto>> CheckAsync();
}
