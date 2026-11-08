#nullable enable
using Godot;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace TwoSides.Network;

public interface IApiClient
{
    Task<ApiResult<T>> GetAsync<T>(string endpoint, string? jwt = null) where T : class;
    Task<ApiResult<TResponse>> PostAsync<TRequest, TResponse>(string endpoint, TRequest body, string? jwt = null) where TResponse : class;
}

// No se anade al arbol ni realiza solicitudes automaticamente.
public partial class ApiClient : Node, IApiClient
{
    public ApiConfiguration Configuration { get; set; } = new();
    private int _thread;
    private bool _ready;
    private readonly List<Action> _cancel = new();

    public override void _Ready()
    {
        _thread = System.Environment.CurrentManagedThreadId;
        ProcessMode = ProcessModeEnum.Always;
        _ready = true;
    }
    public Task<ApiResult<T>> GetAsync<T>(string endpoint, string? jwt = null) where T : class
        => SendAsync<T>(endpoint, HttpClient.Method.Get, "", jwt);

    public Task<ApiResult<TResponse>> PostAsync<TRequest, TResponse>(string endpoint, TRequest body, string? jwt = null) where TResponse : class
    {
        try { return SendAsync<TResponse>(endpoint, HttpClient.Method.Post, ApiJson.Serialize(body), jwt); }
        catch (Exception error) when (error is JsonException || error is NotSupportedException)
        { return Task.FromResult(ApiResult<TResponse>.Failed(ApiFailure.Configuration)); }
    }

    private Task<ApiResult<T>> SendAsync<T>(string endpoint, HttpClient.Method method, string body, string? jwt) where T : class
    {
        if (!_ready || System.Environment.CurrentManagedThreadId != _thread || !IsInsideTree())
            return Task.FromResult(ApiResult<T>.Failed(ApiFailure.Configuration));
        string url; string[] headers;
        try { url = Configuration.ResolveEndpoint(endpoint).AbsoluteUri; headers = ApiProtocol.Headers(jwt); }
        catch (ArgumentException) { return Task.FromResult(ApiResult<T>.Failed(ApiFailure.Configuration)); }

        // Cada solicitud tiene nodo, timeout y finalizacion propios.
        var request = new HttpRequest { Timeout = Configuration.TimeoutSeconds,
            MaxRedirects = 0, BodySizeLimit = 4 * 1024 * 1024, ProcessMode = ProcessModeEnum.Always };
        var completion = new TaskCompletionSource<ApiResult<T>>();
        bool finished = false;
        Action cancel = null!;
        HttpRequest.RequestCompletedEventHandler handler = null!;
        void Finish(ApiResult<T> result)
        {
            if (finished) return;
            finished = true;
            _cancel.Remove(cancel);
            if (GodotObject.IsInstanceValid(request))
            {
                request.RequestCompleted -= handler;
                request.QueueFree();
            }
            completion.TrySetResult(result);
        }
        handler = (result, status, responseHeaders, responseBody) =>
        {
            if (result == (long)HttpRequest.Result.Timeout) Finish(ApiResult<T>.Failed(ApiFailure.Timeout));
            else if (result != (long)HttpRequest.Result.Success) Finish(ApiResult<T>.Failed(ApiFailure.Transport));
            else Finish(ApiProtocol.Decode<T>(status, responseBody, responseHeaders));
        };
        cancel = () =>
        {
            if (GodotObject.IsInstanceValid(request)) request.CancelRequest();
            Finish(ApiResult<T>.Failed(ApiFailure.Cancelled));
        };
        _cancel.Add(cancel);
        request.RequestCompleted += handler;
        AddChild(request);
        var start = request.Request(url, headers, method, body);
        if (start != Error.Ok) Finish(ApiResult<T>.Failed(ApiFailure.Transport));
        return completion.Task;
    }
    public override void _ExitTree()
    {
        _ready = false;
        foreach (var cancel in _cancel.ToArray()) cancel();
    }
}
