#nullable enable
using System;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Services;

namespace TwoSides.Network.Session;

public enum SessionState { SignedOut, Authenticated, Expired, Unauthorized }

// Clase .NET independiente de escenas. No escribe archivos ni crea timers.
// Usar desde el hilo principal de Godot, igual que IApiClient.
public sealed class SessionManager
{
    private readonly IAuthService _auth;
    private readonly Func<DateTimeOffset> _utcNow;
    private string? _token;
    private PublicUserDto? _user;
    private DateTimeOffset? _expiresAt;
    private SessionState _state = SessionState.SignedOut;
    private long _version;
    private bool _loggingIn;

    public event Action<SessionState>? SessionChanged;
    public event Action<SessionState>? LoginRequired;
    public SessionManager(IAuthService auth, Func<DateTimeOffset>? utcNow = null)
    {
        _auth = auth ?? throw new ArgumentNullException(nameof(auth));
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }
    public SessionState State { get { CheckExpiration(); return _state; } }
    public bool IsAuthenticated => State == SessionState.Authenticated;
    // Identidad de la sesion, sin exponer token; invalida respuestas en vuelo.
    public long Generation { get { CheckExpiration(); return _version; } }
    public PublicUserDto? User { get { CheckExpiration(); return _user; } }
    public DateTimeOffset? ExpiresAtUtc { get { CheckExpiration(); return _expiresAt; } }
    public bool TryGetToken(out string? token)
    {
        CheckExpiration(); token = _token;
        return _state == SessionState.Authenticated && token is not null;
    }
    public void Logout() => Clear(SessionState.SignedOut);

    public void CheckExpiration()
    {
        if (_state == SessionState.Authenticated && _expiresAt <= _utcNow()) Clear(SessionState.Expired);
    }
    private void Clear(SessionState state)
    {
        _version++;
        _token = null; _user = null; _expiresAt = null;
        bool changed = _state != state;
        _state = state;
        if (changed) SessionChanged?.Invoke(state);
        if (changed && (state == SessionState.Expired || state == SessionState.Unauthorized)) LoginRequired?.Invoke(state);
    }

    public Task<ApiResult<UserResponseDto>> RegisterAsync(RegisterRequestDto input) => _auth.RegisterAsync(input);

    public async Task<ApiResult<LoginResponseDto>> LoginAsync(LoginRequestDto input)
    {
        // No lanzar dos logins simultaneos ni consumir el limite por doble clic.
        if (_loggingIn) return ApiResult<LoginResponseDto>.Failed(ApiFailure.Conflict);
        _loggingIn = true;
        Clear(SessionState.SignedOut);
        long version = _version;
        DateTimeOffset started = _utcNow();
        try
        {
            var result = await _auth.LoginAsync(input);
            if (version != _version) return ApiResult<LoginResponseDto>.Failed(ApiFailure.Cancelled);
            if (!result.IsSuccess)
            {
                if (result.Failure == ApiFailure.Unauthorized || result.HttpStatus == 401) Clear(SessionState.Unauthorized);
                return result;
            }
            var data = result.Data;
            if (data is null || !TryExpiration(data, started, out var expires))
                return ApiResult<LoginResponseDto>.Failed(ApiFailure.InvalidResponse, result.HttpStatus);
            if (expires <= _utcNow())
            {
                Clear(SessionState.Expired);
                return ApiResult<LoginResponseDto>.Failed(ApiFailure.Unauthorized);
            }
            _token = data.Token; _user = data.User; _expiresAt = expires; _state = SessionState.Authenticated;
            SessionChanged?.Invoke(_state);
            return result;
        }
        finally { _loggingIn = false; }
    }

    public async Task<ApiResult<UserResponseDto>> MeAsync()
    {
        if (!TryGetToken(out var token)) return ApiResult<UserResponseDto>.Failed(ApiFailure.Unauthorized);
        long version = _version;
        var result = await _auth.MeAsync(token!);
        if (version != _version) return ApiResult<UserResponseDto>.Failed(ApiFailure.Cancelled);
        CheckExpiration();
        if (_state != SessionState.Authenticated) return ApiResult<UserResponseDto>.Failed(ApiFailure.Unauthorized);
        if (result.Failure == ApiFailure.Unauthorized || result.HttpStatus == 401) Clear(SessionState.Unauthorized);
        else if (result.IsSuccess)
        {
            if (!ValidUser(result.Data?.User) || result.Data!.User.Id != _user!.Id)
                return ApiResult<UserResponseDto>.Failed(ApiFailure.InvalidResponse, result.HttpStatus);
            _user = result.Data.User;
            SessionChanged?.Invoke(_state);
        }
        return result;
    }

    // Para futuros servicios protegidos: invalidar solo la sesion que envio la
    // solicitud, nunca otra sesion iniciada mientras la respuesta estaba en vuelo.
    public void ObserveUnauthorized(string requestToken)
    {
        CheckExpiration();
        if (_state == SessionState.Authenticated && requestToken == _token) Clear(SessionState.Unauthorized);
    }

    private static bool ValidUser(PublicUserDto? user) => user is not null &&
        user.Id is not null && System.Text.RegularExpressions.Regex.IsMatch(user.Id, "\\A[a-fA-F0-9]{24}\\z") &&
        !string.IsNullOrWhiteSpace(user.Username) && !string.IsNullOrWhiteSpace(user.Email) &&
        (user.Role == "player" || user.Role == "admin");

    private static bool TryExpiration(LoginResponseDto data, DateTimeOffset started, out DateTimeOffset expires)
    {
        expires = default;
        if (!ValidUser(data.User) || data.TokenType != "Bearer" || data.ExpiresIn < 1 || data.ExpiresIn > int.MaxValue ||
            string.IsNullOrWhiteSpace(data.Token) || data.Token.Length > 8192) return false;
        try
        {
            foreach (var character in data.Token) if (char.IsWhiteSpace(character) || char.IsControl(character)) return false;
            var parts = data.Token.Split('.');
            if (parts.Length != 3 || parts[0].Length == 0 || parts[2].Length == 0) return false;
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight((payload.Length + 3) / 4 * 4, '=');
            using var json = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
            if (!json.RootElement.TryGetProperty("sub", out var subject) || subject.GetString() != data.User.Id ||
                !json.RootElement.TryGetProperty("exp", out var expiration) || !expiration.TryGetInt64(out var seconds)) return false;
            var jwtExpiry = DateTimeOffset.FromUnixTimeSeconds(seconds);
            var ttlExpiry = started.AddSeconds(data.ExpiresIn);
            expires = jwtExpiry < ttlExpiry ? jwtExpiry : ttlExpiry;
            // exp es solo una pista local. Solo el backend verifica la firma JWT.
            return true;
        }
        catch (Exception error) when (error is FormatException || error is JsonException ||
            error is ArgumentException || error is InvalidOperationException) { return false; }
    }
}
