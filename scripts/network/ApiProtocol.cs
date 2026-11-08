#nullable enable
using System;
using System.Text;
using System.Text.Json;
using TwoSides.Network.Contracts;

namespace TwoSides.Network;

public static class ApiProtocol
{
    public static string[] Headers(string? jwt)
    {
        if (jwt is null) return new[] { "Accept: application/json", "Content-Type: application/json" };
        if (string.IsNullOrWhiteSpace(jwt) || jwt.Length > 8192)
            throw new ArgumentException("Token de cabecera invalido.");
        foreach (var character in jwt)
            if (char.IsControl(character) || char.IsWhiteSpace(character)) throw new ArgumentException("Token de cabecera invalido.");
        return new[] { "Accept: application/json", "Content-Type: application/json", $"Authorization: Bearer {jwt}" };
    }
    public static ApiFailure ClassifyStatus(long status) => status switch
    {
        400 => ApiFailure.BadRequest, 401 => ApiFailure.Unauthorized, 403 => ApiFailure.Forbidden,
        404 => ApiFailure.NotFound, 409 => ApiFailure.Conflict, 429 => ApiFailure.RateLimited,
        >= 500 and <= 599 => ApiFailure.Server, _ => ApiFailure.OtherHttp
    };
    public static ApiResult<T> Decode<T>(long status, byte[] body, string[] headers) where T : class
    {
        string? retryAfter = null;
        bool jsonContent = false;
        foreach (var header in headers)
        {
            var colon = header.IndexOf(':');
            if (colon < 0) continue;
            var key = header[..colon].Trim(); var value = header[(colon + 1)..].Trim();
            if (key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                jsonContent = value.Split(';')[0].Trim().Equals("application/json", StringComparison.OrdinalIgnoreCase);
            if (key.Equals("Retry-After", StringComparison.OrdinalIgnoreCase)) retryAfter = value;
        }
        bool success = status >= 200 && status <= 299;
        try
        {
            if (!jsonContent) return ApiResult<T>.Failed(success ? ApiFailure.InvalidResponse : ClassifyStatus(status), status, retryAfter: retryAfter);
            var json = new UTF8Encoding(false, true).GetString(body);
            if (success)
            {
                var data = ApiJson.Deserialize<T>(json);
                return data is null ? ApiResult<T>.Failed(ApiFailure.InvalidResponse, status) : ApiResult<T>.Success(status, data);
            }
            var envelope = ApiJson.Deserialize<ErrorResponseDto>(json);
            return ApiResult<T>.Failed(ClassifyStatus(status), status, envelope?.Error, retryAfter);
        }
        catch (Exception error) when (error is JsonException || error is DecoderFallbackException || error is NotSupportedException)
        {
            return ApiResult<T>.Failed(success ? ApiFailure.InvalidResponse : ClassifyStatus(status), status, retryAfter: retryAfter);
        }
    }
}
