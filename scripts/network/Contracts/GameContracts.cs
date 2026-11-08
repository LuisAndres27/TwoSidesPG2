#nullable enable
using System;

namespace TwoSides.Network.Contracts;

public sealed class CreateGameRequestDto { }
public sealed class GameResponseDto { public required GameDto Game { get; init; } }
public sealed class BiomeDto
{
    public required string BiomeId { get; init; }
    public required bool Available { get; init; }
    public required string Status { get; init; }
    public required string? EnvironmentState { get; init; }
    public required string? Result { get; init; }
    public required DateTimeOffset? HumanCompletedAt { get; init; }
    public required DateTimeOffset? AnimalCompletedAt { get; init; }
}
public sealed class GameDto
{
    public required string Id { get; init; }
    public required bool IsCurrent { get; init; }
    public required string Status { get; init; }
    public required long Revision { get; init; }
    public required int SchemaVersion { get; init; }
    public required string RulesVersion { get; init; }
    public required BiomeDto[] Biomes { get; init; }
    public required string? Ending { get; init; }
    public required int? GoodBiomeCount { get; init; }
    public required string? EndingRulesVersion { get; init; }
    public required DateTimeOffset? CompletedAt { get; init; }
    public required DateTimeOffset? ArchivedAt { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; init; }
}
