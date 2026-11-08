#nullable enable
using Godot;
using TwoSides.Network.Progress;
using TwoSides.Network.Services;
using TwoSides.Network.Session;

namespace TwoSides.Network;

// Fachada compatible; las dependencias pertenecen al autoload de aplicacion.
public partial class OceanDecisionContext : Node
{
    private GameApplicationServices? _application;
    public OceanDecisionService? Decisions => _application?.Ocean;
    public EnvironmentalDecisionService? ForBiome(string biomeId)
        => _application?.ForBiome(biomeId);
    internal void Bind(GameApplicationServices application)
    {
        if (_application is not null) throw new System.InvalidOperationException("Contexto ya configurado.");
        _application = application;
    }
    internal void Detach() => _application = null;
    public void Configure(IApiClient api, SessionManager session, GameStateStore store, ICurrentGameService games)
    {
        var application = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Services;
        if (application is null || !ReferenceEquals(api, application.Api) || !ReferenceEquals(session, application.Session) ||
            !ReferenceEquals(store, application.Progress) || !ReferenceEquals(games, application.Games))
            throw new System.InvalidOperationException("Se requieren los servicios compartidos de aplicacion.");
        Bind(application);
    }
    public override void _ExitTree()
    {
        Detach();
    }
}
