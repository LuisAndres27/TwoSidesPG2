#nullable enable
using System;
using System.Threading.Tasks;

namespace TwoSides.Network.Entry;

// Presentacion del acceso actual: ninguna escena de juego esta habilitada todavia.
public sealed class EntryAccessController : IDisposable
{
    private readonly GameApplicationServices _app;
    private Task<EntryFlowResult>? _active;
    private bool _disposed;
    public EntryFlowResult? Result { get; private set; }
    public bool Busy => _active is { IsCompleted: false };
    public EntryAccessController(GameApplicationServices app) => _app = app;
    public bool HasSession => !_disposed && _app.Session.IsAuthenticated;
    public bool RestoreResult()
    {
        if (_disposed || Busy) return false;
        Result = _app.Entry.LatestResult;
        return Result is not null;
    }
    public string Message
    {
        get
        {
            if (_disposed) return "";
            if (Busy) return "Validando cuenta y recuperando partida…";
            if (!HasSession) return "Inicia sesión para continuar.";
            if (Result is null) return "Pulsa para recuperar tu partida.";
            if (Result.Generation != _app.Session.Generation) return "Es necesario recuperar la partida de esta sesión.";
            return Result.Destination switch {
                EntryDestination.BiomeMenu => "Partida recuperada. La navegación a biomas estará disponible en una próxima etapa.",
                EntryDestination.PendingEnding => "Hay un final confirmado pendiente. Su presentación estará disponible en una próxima etapa.",
                EntryDestination.Blocked => Result.Failure switch {
                    ApiFailure.Timeout => "La recuperación tardó demasiado. No puedes avanzar; vuelve a intentarlo.",
                    ApiFailure.Transport => "No se pudo conectar. No puedes avanzar; comprueba tu conexión.",
                    ApiFailure.Conflict => "El progreso cambió. No puedes avanzar; vuelve a recuperar la partida.",
                    ApiFailure.RateLimited => "Demasiadas solicitudes. Espera antes de volver a intentarlo.",
                    _ => "No se pudo recuperar la partida. El acceso permanece bloqueado."
                },
                _ => "Es necesario recuperar la partida antes de continuar."
            };
        }
    }
    public Task<EntryFlowResult> RequestAsync()
    {
        if (Busy) return _active!;
        if (_disposed) return Task.FromResult(new EntryFlowResult(EntryDestination.Blocked, _app.Session.Generation, ApiFailure.Cancelled));
        _active = Run();
        return _active;
    }
    private async Task<EntryFlowResult> Run()
    {
        // La accion explicita siempre valida cuenta y recupera; el constructor no hace HTTP.
        var result = await _app.Entry.RecoverAsync(force: true);
        if (!_disposed) Result = result;
        return result;
    }
    // La autorizacion queda en EntryFlowCoordinator; solo la futura navegacion real la consumira.
    public void Dispose() { _disposed = true; Result = null; }
}
