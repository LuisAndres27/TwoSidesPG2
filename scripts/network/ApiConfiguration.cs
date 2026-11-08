#nullable enable
using System;

namespace TwoSides.Network;

public sealed class ApiConfiguration
{
    public const string DevelopmentUrl = "http://127.0.0.1:3000";
    public const double RequestTimeoutSeconds = 10;
    // Valores por defecto; el supervisor y transporte utilizan la misma configuracion.
    public const double ConnectionCheckIntervalSeconds = 10;
    public double TimeoutSeconds { get; }
    public double CheckIntervalSeconds { get; }
    public Uri BaseUri { get; }

    public ApiConfiguration(string baseUrl = DevelopmentUrl, bool development = true,
        double timeoutSeconds = RequestTimeoutSeconds, double checkIntervalSeconds = ConnectionCheckIntervalSeconds)
    {
        if (!double.IsFinite(timeoutSeconds) || timeoutSeconds <= 0 || !double.IsFinite(checkIntervalSeconds) || checkIntervalSeconds <= 0)
            throw new ArgumentOutOfRangeException(nameof(timeoutSeconds), "Intervalo y timeout deben ser positivos y finitos.");
        TimeoutSeconds = timeoutSeconds; CheckIntervalSeconds = checkIntervalSeconds;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/" ||
            !(uri.Scheme == "https" || (development && uri.Scheme == "http" && uri.IsLoopback)))
            throw new ArgumentException("La API requiere HTTPS, o HTTP loopback en desarrollo.", nameof(baseUrl));
        BaseUri = uri;
    }

    public Uri ResolveEndpoint(string endpoint)
    {
        if (string.IsNullOrEmpty(endpoint) || !endpoint.StartsWith("/api/", StringComparison.Ordinal) ||
            endpoint.Contains('\\') || endpoint.Contains('#') || endpoint.Contains('\r') || endpoint.Contains('\n'))
            throw new ArgumentException("Ruta API invalida.", nameof(endpoint));
        var uri = new Uri(BaseUri, endpoint);
        if (uri.Authority != BaseUri.Authority || uri.Scheme != BaseUri.Scheme ||
            !uri.AbsolutePath.StartsWith("/api/", StringComparison.Ordinal))
            throw new ArgumentException("La ruta debe pertenecer a la API configurada.", nameof(endpoint));
        return uri;
    }
}
