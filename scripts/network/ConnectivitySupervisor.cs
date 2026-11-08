#nullable enable
using System;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Session;

namespace TwoSides.Network;

public enum ConnectivityState { Inactive, Checking, Available, Unavailable, SessionInvalid }

public sealed class ConnectivitySupervisor : IDisposable
{
    private readonly GameApplicationServices _app;
    private readonly Func<DateTimeOffset> _now;
    private DateTimeOffset _next;
    private bool _blocked, _acknowledgement, _disposed;
    private Task? _active;
    public Func<bool> HasActiveRequests { private get; set; } = () => false;
    public ConnectivityState State { get; private set; } = ConnectivityState.Inactive;
    public bool Busy => _active is { IsCompleted: false };
    public bool Recovering { get; private set; }
    public bool BlocksOperations => !_disposed && (_blocked || _acknowledgement);
    public double IntervalSeconds { get; }
    public long Generation => _app.Session.Generation;
    public ConnectivitySupervisor(GameApplicationServices app, double intervalSeconds = ApiConfiguration.ConnectionCheckIntervalSeconds, Func<DateTimeOffset>? now = null)
    {
        if (!double.IsFinite(intervalSeconds) || intervalSeconds <= 0) throw new ArgumentOutOfRangeException(nameof(intervalSeconds));
        _app = app; IntervalSeconds = intervalSeconds; _now = now ?? (() => DateTimeOffset.UtcNow);
        _app.Session.SessionChanged += OnSession;
    }
    private void OnSession(SessionState state)
    {
        if (state == SessionState.Authenticated)
        {
            if (State == ConnectivityState.Inactive || State == ConnectivityState.SessionInvalid)
            { State = ConnectivityState.Checking; _blocked = false; _acknowledgement = false; _next = _now().AddSeconds(IntervalSeconds); }
        }
        else
        {
            State = state == SessionState.SignedOut ? ConnectivityState.Inactive : ConnectivityState.SessionInvalid;
            _blocked = state != SessionState.SignedOut; _acknowledgement = false;
        }
    }
    public void ReportFailure(ApiFailure failure, long? generation = null)
    {
        if (_disposed || !_app.Session.IsAuthenticated || (generation is not null && generation != Generation)) return;
        if (failure == ApiFailure.Transport || failure == ApiFailure.Timeout || failure == ApiFailure.Server)
        { State = ConnectivityState.Unavailable; _blocked = true; }
    }
    public Task TickAsync()
    {
        _app.Session.CheckExpiration();
        if (_now() < _next) return Task.CompletedTask;
        return CheckAsync();
    }
    public Task CheckAsync()
    {
        if (Busy) return _active!;
        if (_disposed || !_app.Session.IsAuthenticated || HasActiveRequests()) return Task.CompletedTask;
        _active = Probe(); return _active;
    }
    private async Task Probe()
    {
        long generation = _app.Session.Generation;
        bool Same() => !_disposed && _app.Session.IsAuthenticated && generation == _app.Session.Generation;
        bool recoveringOutage = _blocked;
        State = ConnectivityState.Checking;
        try
        {
            var health = await _app.Api.GetAsync<HealthResponseDto>("/api/health");
            if (!Same()) return;
            if (!health.IsSuccess || health.HttpStatus != 200 || health.Data?.Status != "ok" || health.Data.Service != "two-sides-backend")
            { State = ConnectivityState.Unavailable; _blocked = true; return; }
            // Health no verifica JWT. Una recuperacion exige /auth/me y progreso.
            if (recoveringOutage || _blocked)
            {
                if (HasActiveRequests()) { State = ConnectivityState.Unavailable; _blocked = true; return; }
                Recovering = true;
                var recovered = await _app.Entry.RecoverAsync(force: true);
                if (!Same()) return;
                if (recovered.Destination != Entry.EntryDestination.BiomeMenu && recovered.Destination != Entry.EntryDestination.PendingEnding)
                { State = ConnectivityState.Unavailable; _blocked = true; return; }
                _acknowledgement = true;
            }
            State = ConnectivityState.Available; _blocked = false;
        }
        catch { if (Same()) { State = ConnectivityState.Unavailable; _blocked = true; } }
        finally { Recovering = false; if (generation == _app.Session.Generation) _next = _now().AddSeconds(IntervalSeconds); }
    }
    public bool AcknowledgeRecovery()
    {
        if (_disposed || Busy || State != ConnectivityState.Available || !_app.Session.IsAuthenticated || !_app.Progress.IsVerified) return false;
        _acknowledgement = false; return true;
    }
    public void DismissForAuthentication()
    {
        if (!_app.Session.IsAuthenticated) { _blocked = false; _acknowledgement = false; }
    }
    public void Dispose() { _disposed = true; _blocked = false; _acknowledgement = false; State = ConnectivityState.Inactive; _app.Session.SessionChanged -= OnSession; }
}
