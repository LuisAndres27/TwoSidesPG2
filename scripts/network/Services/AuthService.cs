#nullable enable
using System;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;

namespace TwoSides.Network.Services;

// Sin estado de sesion, almacenamiento, normalizacion de contrasenas ni reintentos.
public sealed class AuthService : IAuthService
{
    private readonly IApiClient _client;
    public AuthService(IApiClient client) => _client = client ?? throw new ArgumentNullException(nameof(client));
    public Task<ApiResult<UserResponseDto>> RegisterAsync(RegisterRequestDto input)
        => _client.PostAsync<RegisterRequestDto, UserResponseDto>("/api/v1/auth/register", input);
    public Task<ApiResult<LoginResponseDto>> LoginAsync(LoginRequestDto input)
        => _client.PostAsync<LoginRequestDto, LoginResponseDto>("/api/v1/auth/login", input);
    public Task<ApiResult<UserResponseDto>> MeAsync(string jwt)
        => _client.GetAsync<UserResponseDto>("/api/v1/auth/me", jwt);
}
