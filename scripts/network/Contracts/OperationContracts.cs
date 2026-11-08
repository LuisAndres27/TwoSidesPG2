#nullable enable
using System;

namespace TwoSides.Network.Contracts;

// Comandos estrictos: no incluyen userId, ambiente ni resultados calculados.
public class OperationRequestDto
{
    public required Guid EventId { get; init; }
    public required long ExpectedRevision { get; init; }
}
public sealed class DecisionRequestDto : OperationRequestDto
{
    public required string BiomeId { get; init; }
    public required string DecisionId { get; init; }
    public required string OptionId { get; init; }
}
public class AnimalCompletionRequestDto : OperationRequestDto { public required string BiomeId { get; init; } }
public sealed class AnimalRestartRequestDto : AnimalCompletionRequestDto { public required string Reason { get; init; } }
public sealed class FinalExitRequestDto : OperationRequestDto { }
public sealed class ConfirmedDecisionDto
{
    public required string Id { get; init; }
    public required string BiomeId { get; init; }
    public required string DecisionId { get; init; }
    public required string OptionId { get; init; }
    public required string EnvironmentState { get; init; }
    public required string RulesVersion { get; init; }
    public required DateTimeOffset ConfirmedAt { get; init; }
}
public class ConfirmationDto
{
    public required Guid EventId { get; init; }
    public required string GameId { get; init; }
    public required long Revision { get; init; }
    public required bool Replayed { get; init; }
}
public sealed class DecisionConfirmationDto : ConfirmationDto { public required ConfirmedDecisionDto Decision { get; init; } }
public sealed class AnimalBiomeDto
{
    public required string BiomeId { get; init; }
    public required string Status { get; init; }
    public required bool Available { get; init; }
    public required string EnvironmentState { get; init; }
    public required string? Result { get; init; }
    public required DateTimeOffset? AnimalCompletedAt { get; init; }
}
public sealed class AnimalConfirmationDto : ConfirmationDto
{
    public required string Operation { get; init; }
    public required string GameStatus { get; init; }
    public required bool FinalizationPending { get; init; }
    public required string? Ending { get; init; }
    public required int? GoodBiomeCount { get; init; }
    public required string? EndingRulesVersion { get; init; }
    public required string LocalAction { get; init; }
    public required DateTimeOffset ConfirmedAt { get; init; }
    public required AnimalBiomeDto Biome { get; init; }
}
public sealed class FinalExitConfirmationDto : ConfirmationDto
{
    public required string Operation { get; init; }
    public required string SuccessorGameId { get; init; }
    public required DateTimeOffset ArchivedAt { get; init; }
}
