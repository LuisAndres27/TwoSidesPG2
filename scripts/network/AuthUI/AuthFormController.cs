#nullable enable
using System;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;

namespace TwoSides.Network.AuthUI;

// Estado efimero de un formulario. Nunca conserva campos de credenciales.
public sealed class AuthFormController : IDisposable
{
    private readonly GameApplicationServices _app;
    private readonly Func<DateTimeOffset> _now;
    private DateTimeOffset _retryAt;
    private bool _closed;
    private long? _loginGeneration;
    public bool Busy { get; private set; }
    public bool Succeeded { get; private set; }
    public string Message { get; private set; } = "";
    public bool CanSubmit => !_closed && !Busy && !Succeeded && _now() >= _retryAt;
    public long RetrySeconds => (long)Math.Max(0, Math.Ceiling((_retryAt - _now()).TotalSeconds));
    public AuthFormController(GameApplicationServices app, Func<DateTimeOffset>? now = null)
        => (_app, _now) = (app, now ?? (() => DateTimeOffset.UtcNow));

    private static string Identity(string value) => value.Trim().Normalize(NormalizationForm.FormKC).ToLowerInvariant();
    private static bool Email(string value) => value.Length <= 254 && Regex.IsMatch(value,
        @"\A(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\z");
    public static string? Validate(string email, string password, string? username = null, string? confirmation = null)
    {
        try
        {
            if (username is not null && !Regex.IsMatch(Identity(username), @"\A[a-z0-9_]{3,32}\z"))
                return "Usa un nombre de 3 a 32 caracteres: letras, números o guion bajo.";
            if (!Email(Identity(email))) return "Introduce un correo electrónico válido (máximo 254 caracteres).";
        }
        catch (ArgumentException) { return "Revisa el nombre y el correo electrónico."; }
        if (password.Length < (username is null ? 1 : 12) || password.Length > 128)
            return username is null ? "Introduce tu contraseña (máximo 128 caracteres)." : "La contraseña debe tener entre 12 y 128 caracteres.";
        if (username is not null && password != confirmation) return "Las contraseñas no coinciden.";
        return null;
    }

    public async Task<bool> SubmitAsync(string email, string password, string? username = null, string? confirmation = null)
    {
        if (!CanSubmit) return false;
        var validation = Validate(email, password, username, confirmation);
        if (validation is not null) { Message = validation; return false; }
        Busy = true; Message = "Enviando…";
        try
        {
            ApiFailure failure; long? status; string? retryAfter; bool success;
            if (username is null)
            {
                var task = _app.Session.LoginAsync(new LoginRequestDto { Email = Identity(email), Password = password });
                _loginGeneration = _app.Session.Generation;
                var result = await task;
                (success, failure, status, retryAfter) = (result.IsSuccess, result.Failure, result.HttpStatus, result.RetryAfter);
            }
            else
            {
                var result = await _app.Auth.RegisterAsync(new RegisterRequestDto { Username = Identity(username), Email = Identity(email), Password = password });
                (success, failure, status, retryAfter) = (result.IsSuccess, result.Failure, result.HttpStatus, result.RetryAfter);
                success = success && result.Data?.User is not null;
            }
            if (_closed) return false;
            if (success)
            {
                Succeeded = true;
                Message = username is null ? "Sesión iniciada. Falta recuperar la partida antes de jugar." : "Cuenta creada. Inicia sesión para continuar.";
                return true;
            }
            if (failure == ApiFailure.RateLimited || status == 429)
            {
                // Si falta un valor valido, pausa conservadora acorde al limite del endpoint.
                var seconds = username is null ? 900d : 3600d;
                if (long.TryParse(retryAfter, NumberStyles.None, CultureInfo.InvariantCulture, out var delay) && delay >= 0)
                    seconds = Math.Min(delay, (DateTimeOffset.MaxValue - _now()).TotalSeconds - 1);
                else if (DateTimeOffset.TryParse(retryAfter, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date))
                    seconds = Math.Max(0, (date - _now()).TotalSeconds);
                _retryAt = _now().AddSeconds(seconds);
                Message = "Demasiadas solicitudes. Espera antes de intentarlo de nuevo.";
            }
            else Message = failure switch {
                ApiFailure.Unauthorized => "No se pudo iniciar sesión con esos datos.",
                ApiFailure.Conflict => "No se pudo completar la operación con esos datos.",
                ApiFailure.BadRequest => "Revisa los datos del formulario.",
                ApiFailure.Timeout => "La solicitud tardó demasiado. Inténtalo de nuevo manualmente.",
                ApiFailure.Transport => "No se pudo conectar. Comprueba tu conexión.",
                ApiFailure.Cancelled => "La operación fue cancelada.",
                _ => "No se pudo completar la solicitud. Inténtalo más tarde."
            };
            return false;
        }
        catch { if (!_closed) Message = "No se pudo completar la solicitud. Inténtalo más tarde."; return false; }
        finally { Busy = false; _loginGeneration = null; }
    }
    public void Dispose()
    {
        _closed = true;
        // Una pantalla abandonada no puede autenticar posteriormente otra escena.
        if (_loginGeneration is not null && _app.Session.Generation == _loginGeneration) _app.Logout();
    }
}
