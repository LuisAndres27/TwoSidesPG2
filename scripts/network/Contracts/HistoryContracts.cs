#nullable enable
using System;

namespace TwoSides.Network.Contracts;

public sealed class PaginationDto
{
    public required int Page { get; init; }
    public required int Limit { get; init; }
    public required long Total { get; init; }
    public required long TotalPages { get; init; }
}
public sealed class GamesPageDto
{
    public required GameDto[] Games { get; init; }
    public required PaginationDto Pagination { get; init; }
}
public sealed class HistoricalDecisionDto
{
    public required string Id { get; init; }
    public required string GameId { get; init; }
    public required Guid EventId { get; init; }
    public required string BiomeId { get; init; }
    public required string DecisionId { get; init; }
    public required string OptionId { get; init; }
    public required string EnvironmentState { get; init; }
    public required string RulesVersion { get; init; }
    public required DateTimeOffset ConfirmedAt { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; init; }
}
public sealed class DecisionsPageDto
{
    public required HistoricalDecisionDto[] Decisions { get; init; }
    public required PaginationDto Pagination { get; init; }
}
public sealed class HistoryQuery
{
    public int Page { get; init; } = 1;
    public int Limit { get; init; } = 20;
    public string? BiomeId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}
