#nullable enable
using System;
using System.Threading.Tasks;

namespace TwoSides.Network.Entry;

public enum EntryDestination { LoginRequired, RecoveryRequired, BiomeMenu, PendingEnding, Blocked }

public sealed class EntryFlowResult
{
    public EntryDestination Destination { get; }
    public ApiFailure Failure { get; }
    public long? HttpStatus { get; }
    public string? GameId { get; }
    public long? Revision { get; }
    public string? Ending { get; }
    internal Guid Ticket { get; }
    internal long Generation { get; }
    internal EntryFlowResult(EntryDestination destination, long generation, ApiFailure failure = ApiFailure.None,
        long? httpStatus = null, string? gameId = null, long? revision = null, string? ending = null, Guid ticket = default)
        => (Destination, Generation, Failure, HttpStatus, GameId, Revision, Ending, Ticket) =
           (destination, generation, failure, httpStatus, gameId, revision, ending, ticket);
}

// Solo decisiones de entrada, en el hilo principal. No navega ni inicia solicitudes en el constructor.
public sealed class EntryFlowCoordinator : IDisposable
{
    private readonly GameApplicationServices _application;
    private Task<EntryFlowResult>? _active;
    private EntryFlowResult? _last;
    private Guid _consumed;
    private bool _disposed;
    internal EntryFlowCoordinator(GameApplicationServices application) => _application = application;
    public bool IsRecovering => _active is { IsCompleted: false };
    // Transferencia entre pantallas, sin solicitudes ni consumo de autorizacion.
    public EntryFlowResult? LatestResult => !_disposed && _application.Session.IsAuthenticated &&
        _last?.Generation == _application.Session.Generation &&
        (_last.Destination == EntryDestination.Blocked || MatchesCurrent(_last)) ? _last : null;

    public EntryFlowResult Current
    {
        get
        {
            var session = _application.Session;
            long generation = session.Generation;
            if (_disposed) return new(EntryDestination.Blocked, generation, ApiFailure.Cancelled);
            if (!session.IsAuthenticated) return new(EntryDestination.LoginRequired, generation, ApiFailure.Unauthorized);
            if (IsRecovering) return new(EntryDestination.RecoveryRequired, generation);
            if (_last?.Generation != generation) return new(EntryDestination.RecoveryRequired, generation);
            if (_last.Destination == EntryDestination.Blocked) return _last;
            var game = _application.Progress.Snapshot;
            if (!_application.Progress.IsVerified || game is null) return new(EntryDestination.RecoveryRequired, generation);
            return new(game.Status == "final_pending" && game.Ending is not null ? EntryDestination.PendingEnding :
                game.Status == "in_progress" ? EntryDestination.BiomeMenu : EntryDestination.Blocked,
                generation, gameId: game.Id, revision: game.Revision, ending: game.Ending);
        }
    }

    // Recuperaciones simultaneas comparten la misma tarea. force permite una recuperacion explicita posterior.
    public Task<EntryFlowResult> RecoverAsync(bool force = false)
    {
        if (IsRecovering) return _active!;
        var current = Current;
        if (_disposed || current.Destination == EntryDestination.LoginRequired) return Task.FromResult(current);
        if (!force && _last is not null && MatchesCurrent(_last)) return Task.FromResult(_last);
        _active = RecoverCore();
        return _active;
    }

    private bool MatchesCurrent(EntryFlowResult result)
    {
        var current = Current;
        return result.Ticket != Guid.Empty && result.Generation == current.Generation && result.Destination == current.Destination &&
            result.GameId == current.GameId && result.Revision == current.Revision && result.Ending == current.Ending;
    }

    // La futura UI debe consumir esta autorizacion inmediatamente antes de cambiar escena.
    public bool CanNavigate(EntryFlowResult result) => !_disposed && ReferenceEquals(result, _last) &&
        result.Ticket != _consumed && MatchesCurrent(result);
    public bool TryConsumeNavigation(EntryFlowResult result)
    {
        if (!CanNavigate(result)) return false;
        _consumed = result.Ticket;
        return true;
    }

    private async Task<EntryFlowResult> RecoverCore()
    {
        long generation = _application.Session.Generation;
        bool SameSession() => !_disposed && _application.Session.IsAuthenticated && _application.Session.Generation == generation;
        EntryFlowResult Cancelled() => new(_application.Session.IsAuthenticated ? EntryDestination.RecoveryRequired : EntryDestination.LoginRequired,
            _application.Session.Generation, ApiFailure.Cancelled);
        EntryFlowResult SessionEnded(ApiFailure failure, long? status) =>
            !_disposed && !_application.Session.IsAuthenticated && failure == ApiFailure.Unauthorized
                ? new(EntryDestination.LoginRequired, _application.Session.Generation, failure, status)
                : Cancelled();
        EntryFlowResult Failed(ApiFailure failure, long? status = null)
        {
            if (!SameSession()) return Cancelled();
            return _last = new(EntryDestination.Blocked, generation, failure, status);
        }
        _application.Progress.MarkUnverified();
        try
        {
            var me = await _application.Session.MeAsync();
            if (!SameSession()) return SessionEnded(me.Failure, me.HttpStatus);
            if (!me.IsSuccess) return Failed(me.Failure, me.HttpStatus);
            var game = await _application.Games.CreateOrGetAsync();
            if (!SameSession()) return SessionEnded(game.Failure, game.HttpStatus);
            if (!game.IsSuccess) return Failed(game.Failure, game.HttpStatus);
            var snapshot = _application.Progress.Snapshot;
            if (!_application.Progress.IsVerified || snapshot is null) return Failed(ApiFailure.InvalidResponse);
            var destination = snapshot.Status == "in_progress" ? EntryDestination.BiomeMenu :
                snapshot.Status == "final_pending" && snapshot.Ending is not null ? EntryDestination.PendingEnding : EntryDestination.Blocked;
            if (destination == EntryDestination.Blocked) return Failed(ApiFailure.InvalidResponse);
            return _last = new(destination, generation, gameId: snapshot.Id, revision: snapshot.Revision,
                ending: snapshot.Ending, ticket: Guid.NewGuid());
        }
        catch { return Failed(ApiFailure.Transport); }
    }

    public void Dispose() { _disposed = true; _last = null; }
}
