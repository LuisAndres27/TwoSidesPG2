#nullable enable
using System;
using System.Linq;
using System.Threading.Tasks;
using TwoSides.Network.Contracts;
using TwoSides.Network.Entry;

namespace TwoSides.Network;

public sealed class PendingReconciliation
{
    private readonly GameApplicationServices _app;
    private StoredOperation[] _operations = Array.Empty<StoredOperation>();
    private long _generation = -1;
    public bool Busy { get; private set; }
    public bool InvalidFiles { get; private set; }
    public int Count => _generation == _app.Session.Generation ? _operations.Length : 0;
    public bool HasBlocking => _generation == _app.Session.Generation && (InvalidFiles || _operations.Any(p => p.GameId == _app.Progress.GameId || p.Operation == "final-exit"));
    public PendingReconciliation(GameApplicationServices app) => _app = app;
    internal void ClearMemory() { _operations = Array.Empty<StoredOperation>(); InvalidFiles = false; _generation = -1; }
    public void Refresh()
    {
        _operations = Array.Empty<StoredOperation>(); InvalidFiles = false; _generation = _app.Session.Generation;
        if (_app.Journal is null || !_app.Session.IsAuthenticated || !_app.Progress.IsVerified ||
            _app.Entry.Current.Destination is not (EntryDestination.BiomeMenu or EntryDestination.PendingEnding)) return;
        _operations = _app.Journal.ReadUser(_app.Session.User!.Id,out bool invalid); InvalidFiles = invalid;
    }
    public async Task<ApiFailure> ReconcileAsync()
    {
        if (Busy || InvalidFiles || _generation != _app.Session.Generation || !_app.Progress.IsVerified || !_app.Session.TryGetToken(out var token)) return ApiFailure.Conflict;
        var pending = _operations.FirstOrDefault(p => p.GameId == _app.Progress.GameId || p.Operation == "final-exit");
        if (pending is null) return ApiFailure.Conflict;
        Busy = true; long generation = _generation;
        bool Same() => generation == _app.Session.Generation && _app.Session.IsAuthenticated;
        try
        {
            var game = _app.Progress.Snapshot!;
            bool oldFinal = pending.GameId != game.Id && pending.Operation == "final-exit";
            if (pending.GameId != game.Id && !oldFinal) return ApiFailure.Conflict;
            if (oldFinal)
            {
                var old = await _app.Api.GetAsync<GameResponseDto>($"/api/v1/me/games/{pending.GameId}",token);
                if (!Same()) return ApiFailure.Cancelled;
                if (!old.IsSuccess || old.Data?.Game.Id != pending.GameId || old.Data.Game.Status != "archived" || old.Data.Game.IsCurrent ||
                    old.Data.Game.ArchivedAt is null || old.Data.Game.Ending is not ("good" or "medium" or "bad") ||
                    old.Data.Game.Revision < pending.ExpectedRevision + 1) return ApiFailure.Conflict;
            }
            else if (game.Revision < pending.ExpectedRevision) return ApiFailure.Conflict;
            // Revision antigua: solo un replay candidato; el servidor debe confirmar el MISMO evento.
            if (!oldFinal && game.Revision == pending.ExpectedRevision)
            {
                if (pending.Operation == "final-exit" && game.Status != "final_pending") return ApiFailure.Conflict;
                if (pending.Operation != "final-exit")
                {
                    var biome = game.Biomes.Single(b=>b.BiomeId == pending.Command.GetProperty("biomeId").GetString());
                    if (game.Status != "in_progress" || biome.Status != (pending.Operation == "decisions" ? "human_pending" : "animal_pending")) return ApiFailure.Conflict;
                }
            }
            string endpoint = $"/api/v1/me/games/{pending.GameId}/{pending.Operation}";
            // El comando JsonElement ya paso validacion estricta; no se agregan campos ni UUID.
            var response = await _app.Api.PostAsync<System.Text.Json.JsonElement,System.Text.Json.Nodes.JsonObject>(endpoint,pending.Command,token);
            if (!Same()) return ApiFailure.Cancelled;
            if (!response.IsSuccess)
            {
                if (response.HttpStatus == 401) _app.Session.ObserveUnauthorized(token!);
                return response.Failure;
            }
            string receiptJson = response.Data!.ToJsonString();
            var receipt = ApiJson.Deserialize<ConfirmationDto>(receiptJson);
            if (receipt is null || receipt.GameId != pending.GameId || receipt.EventId != pending.EventId || receipt.Revision != pending.ExpectedRevision + 1) return ApiFailure.InvalidResponse;
            if ((oldFinal || game.Revision > pending.ExpectedRevision) && !receipt.Replayed) return ApiFailure.Conflict;
            var recovered = await _app.Games.CurrentAsync();
            if (!Same()) return ApiFailure.Cancelled;
            if (!recovered.IsSuccess) return recovered.Failure;
            game = _app.Progress.Snapshot!;
            bool valid;
            if (pending.Operation == "final-exit")
            {
                var exit = ApiJson.Deserialize<FinalExitConfirmationDto>(receiptJson);
                valid = exit?.Operation == "final_exit" && game.Id == exit.SuccessorGameId && game.Id != pending.GameId;
            }
            else
            {
                var biome = game.Biomes.SingleOrDefault(b=>b.BiomeId == pending.Command.GetProperty("biomeId").GetString());
                valid = game.Id == pending.GameId && game.Revision >= receipt.Revision && biome is not null;
                if (pending.Operation == "decisions")
                {
                    var decision = ApiJson.Deserialize<DecisionConfirmationDto>(receiptJson)?.Decision;
                    valid &= decision is not null && decision.BiomeId == biome?.BiomeId && decision.DecisionId == pending.Command.GetProperty("decisionId").GetString() &&
                        decision.OptionId == pending.Command.GetProperty("optionId").GetString() && decision.EnvironmentState == biome?.EnvironmentState &&
                        decision.ConfirmedAt == biome?.HumanCompletedAt && decision.RulesVersion == game.RulesVersion;
                }
                else
                {
                    var animal = ApiJson.Deserialize<AnimalConfirmationDto>(receiptJson);
                    valid &= animal is not null && animal.Operation == (pending.Operation == "animal-restarts" ? "animal_restart" : "animal_completion") &&
                        animal.Biome.BiomeId == biome?.BiomeId && animal.Biome.EnvironmentState == biome?.EnvironmentState &&
                        !animal.FinalizationPending && animal.LocalAction == (pending.Operation == "animal-restarts" ? "restart_animal_from_start" : "none") &&
                        (pending.Operation == "animal-restarts" ? game.Revision >= animal.Revision : animal.Biome.Result == biome?.Result && animal.Biome.AnimalCompletedAt == biome?.AnimalCompletedAt);
                }
            }
            if (!valid) return ApiFailure.Conflict;
            if (!_app.Journal!.Remove(pending.UserId,pending.GameId,pending.EventId)) return ApiFailure.Configuration;
            if (pending.Operation == "decisions")
            {
                var service = _app.ForBiome(pending.Command.GetProperty("biomeId").GetString()!);
                if (service?.Pending?.Command.EventId == pending.EventId) service.ClearPending();
            }
            if (_app.Animals.Pending?.Command.EventId == pending.EventId) _app.Animals.Clear();
            if (_app.Endings.Pending?.EventId == pending.EventId) _app.Endings.Clear();
            Refresh(); return ApiFailure.None;
        }
        catch { return Same() ? ApiFailure.InvalidResponse : ApiFailure.Cancelled; }
        finally { Busy = false; }
    }
}
