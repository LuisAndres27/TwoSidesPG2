#nullable enable
using System.Text.RegularExpressions;
using System.Linq;
using System.Threading.Tasks;

namespace TwoSides.Network;

public sealed class PersistentApiClient : IApiClient
{
    private readonly IApiClient _inner;
    private readonly PendingOperationStore _store;
    private GameApplicationServices? _app;
    public PersistentApiClient(IApiClient inner, PendingOperationStore store) => (_inner,_store) = (inner,store);
    public void Attach(GameApplicationServices app) => _app = app;
    public Task<ApiResult<T>> GetAsync<T>(string endpoint,string? jwt = null) where T:class => _inner.GetAsync<T>(endpoint,jwt);
    public Task<ApiResult<TResponse>> PostAsync<TRequest,TResponse>(string endpoint,TRequest body,string? jwt = null) where TResponse:class
    {
        var match = Regex.Match(endpoint,@"\A/api/v1/me/games/([a-f0-9]{24})/(decisions|animal-completions|animal-restarts|final-exit)\z");
        if (match.Success)
        {
            using var document = System.Text.Json.JsonDocument.Parse(ApiJson.Serialize(body));
            if (_app?.Session.User is { } owner)
            {
                var previous = _store.ReadUser(owner.Id,out bool blocked);
                bool existing = document.RootElement.TryGetProperty("eventId",out var id) && id.TryGetGuid(out var eventId) && previous.Any(p=>p.EventId == eventId && p.GameId == match.Groups[1].Value);
                if (blocked || (!existing && previous.Any(p=>p.GameId == match.Groups[1].Value || p.Operation == "final-exit")))
                    return Task.FromResult(ApiResult<TResponse>.Failed(ApiFailure.Conflict));
            }
            if (_app is null || !_app.Session.TryGetToken(out var current) || jwt != current ||
                !_store.Save(_app.Session.User!.Id,match.Groups[1].Value,match.Groups[2].Value,
                    document.RootElement))
                return Task.FromResult(ApiResult<TResponse>.Failed(ApiFailure.Configuration));
        }
        return _inner.PostAsync<TRequest,TResponse>(endpoint,body,jwt);
    }
}
