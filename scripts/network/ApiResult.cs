#nullable enable
using TwoSides.Network.Contracts;

namespace TwoSides.Network;

public enum ApiFailure
{
    None, Transport, Timeout, BadRequest, Unauthorized, Forbidden, NotFound,
    Conflict, RateLimited, Server, OtherHttp, InvalidResponse, Configuration, Cancelled
}

public sealed class ApiResult<T> where T : class
{
    public bool IsSuccess => Failure == ApiFailure.None;
    public ApiFailure Failure { get; }
    public long? HttpStatus { get; }
    public T? Data { get; }
    public ApiErrorDto? Error { get; }
    public string? RetryAfter { get; }
    private ApiResult(ApiFailure failure, long? httpStatus, T? data, ApiErrorDto? error, string? retryAfter)
        => (Failure, HttpStatus, Data, Error, RetryAfter) = (failure, httpStatus, data, error, retryAfter);
    public static ApiResult<T> Success(long status, T data) => new(ApiFailure.None, status, data, null, null);
    public static ApiResult<T> Failed(ApiFailure failure, long? status = null, ApiErrorDto? error = null, string? retryAfter = null)
        => new(failure, status, null, error, retryAfter);
}
