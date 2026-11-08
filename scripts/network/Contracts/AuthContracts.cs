#nullable enable
using System;

namespace TwoSides.Network.Contracts;

// Clases sin ToString generado: no volcar secretos mediante records/logs.
public sealed class RegisterRequestDto
{
    public required string Username { get; init; }
    public required string Email { get; init; }
    public required string Password { get; init; }
}
public sealed class LoginRequestDto
{
    public required string Email { get; init; }
    public required string Password { get; init; }
}
public sealed class PublicUserDto
{
    public required string Id { get; init; }
    public required string Username { get; init; }
    public required string Email { get; init; }
    public required string Role { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; init; }
}
public sealed class UserResponseDto { public required PublicUserDto User { get; init; } }
public sealed class LoginResponseDto
{
    public required string Token { get; init; }
    public required string TokenType { get; init; }
    public required long ExpiresIn { get; init; }
    public required PublicUserDto User { get; init; }
}
public sealed class ApiErrorDto
{
    public required string Code { get; init; }
    public required string Message { get; init; }
}
public sealed class ErrorResponseDto { public required ApiErrorDto Error { get; init; } }
public sealed class HealthResponseDto
{
    public required string Status { get; init; }
    public required string Service { get; init; }
}
