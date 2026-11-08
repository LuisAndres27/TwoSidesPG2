#nullable enable
using TwoSides.Network.Progress;
using TwoSides.Network.Session;

namespace TwoSides.Network.Services;

// Adaptador compatible con etapa 4; toda la logica pertenece al servicio comun.
public sealed class OceanDecisionService : EnvironmentalDecisionService
{
    public OceanDecisionService(IApiClient client, SessionManager session, GameStateStore store, ICurrentGameService games, PendingOperationStore? journal = null)
        : base(client, session, store, games, "ocean", DecisionCatalog.ForBiome("ocean"), journal) { }
}
