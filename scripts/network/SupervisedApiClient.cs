#nullable enable
using System.Threading.Tasks;

namespace TwoSides.Network;

// Decorador de produccion: contabiliza solicitudes existentes y nunca las cancela ni repite.
public sealed class SupervisedApiClient : IApiClient
{
    private readonly IApiClient _inner;
    private ConnectivitySupervisor? _supervisor;
    public int ActiveRequests { get; private set; }
    public SupervisedApiClient(IApiClient inner) => _inner = inner;
    public void Attach(ConnectivitySupervisor supervisor)
    { _supervisor = supervisor; supervisor.HasActiveRequests = () => ActiveRequests != 0; }
    public async Task<ApiResult<T>> GetAsync<T>(string endpoint, string? jwt = null) where T : class
    {
        bool health = endpoint == "/api/health";
        long? generation = _supervisor?.Generation;
        if (!health) ActiveRequests++;
        try
        {
            var result = await _inner.GetAsync<T>(endpoint, jwt);
            if (!health) _supervisor?.ReportFailure(result.Failure, generation);
            return result;
        }
        catch { if (!health) _supervisor?.ReportFailure(ApiFailure.Transport, generation); return ApiResult<T>.Failed(ApiFailure.Transport); }
        finally { if (!health) ActiveRequests--; }
    }
    public async Task<ApiResult<TResponse>> PostAsync<TRequest,TResponse>(string endpoint, TRequest body, string? jwt = null) where TResponse : class
    {
        if (endpoint.StartsWith("/api/v1/me/games") && _supervisor?.BlocksOperations == true &&
            !(endpoint == "/api/v1/me/games" && _supervisor.Recovering)) return ApiResult<TResponse>.Failed(ApiFailure.Transport);
        ActiveRequests++;
        long? generation = _supervisor?.Generation;
        try
        {
            var result = await _inner.PostAsync<TRequest,TResponse>(endpoint, body, jwt);
            _supervisor?.ReportFailure(result.Failure, generation); return result;
        }
        catch { _supervisor?.ReportFailure(ApiFailure.Transport, generation); return ApiResult<TResponse>.Failed(ApiFailure.Transport); }
        finally { ActiveRequests--; }
    }
}
