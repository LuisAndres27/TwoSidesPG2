#nullable enable
using System;
using System.Linq;

namespace TwoSides.Network.Progress;

public sealed class BiomeCardState
{
    public BiomeDestination Destination { get; }
    public string? EnvironmentState { get; }
    public string? Result { get; }
    public bool CanSelect => Destination == BiomeDestination.Human || Destination == BiomeDestination.AnimalFromStart;
    internal BiomeCardState(BiomeDestination destination, string? environment = null, string? result = null)
        => (Destination, EnvironmentState, Result) = (destination, environment, result);
}
public sealed class BiomeLaunchPlan
{
    public string BiomeId { get; }
    public string Scene { get; }
    public string? EnvironmentState { get; }
    internal string GameId { get; }
    internal long Revision { get; }
    internal BiomeLaunchPlan(string biome, string scene, string? environment, string game, long revision)
        => (BiomeId, Scene, EnvironmentState, GameId, Revision) = (biome, scene, environment, game, revision);
}

// Una instancia por menu: serializa tambien clics en tarjetas diferentes.
public sealed class BiomeCardController
{
    private readonly GameApplicationServices _app;
    private readonly object _menu;
    private BiomeLaunchPlan? _pending;
    private bool _committed;
    public bool Busy => _pending is not null;
    public BiomeCardController(GameApplicationServices app, object menu) => (_app, _menu) = (app, menu);
    public static string? BiomeFor(int level) => level switch { 0 => "ocean", 1 => "jungle", 2 => "desert", 3 => "forest", 4 => "tundra", _ => null };
    public static string? SceneFor(string biome, bool animal) => (biome, animal) switch {
        ("ocean", false) => "res://scenes/levels/DesicionDelfin.tscn", ("ocean", true) => "res://scenes/levels/bioma_mar.tscn",
        ("jungle", false) => "res://scenes/levels/DesicionMono.tscn", ("jungle", true) => "res://scenes/levels/bioma_selva.tscn",
        ("desert", false) => "res://scenes/levels/DesicionRataCanguro.tscn", ("desert", true) => "res://scenes/levels/bioma_desierto.tscn",
        ("forest", false) => "res://scenes/levels/DesicionZorro.tscn", ("forest", true) => "res://scenes/levels/bioma_bosque.tscn",
        ("tundra", false) => "res://scenes/levels/DesicionNieve.tscn", ("tundra", true) => "res://scenes/levels/bioma_nieve.tscn", _ => null };
    public BiomeCardState Describe(string biome)
    {
        if (_app.Reconciliation.HasBlocking || _app.Animals.BlocksGameplay || !_app.BiomeMenu.IsAdmitted(_menu)) return new(BiomeDestination.RecoveryRequired);
        var selection = _app.Progress.Select(biome);
        var result = _app.Progress.Snapshot?.Biomes.SingleOrDefault(b => b.BiomeId == biome)?.Result;
        return new(selection.Destination, selection.EnvironmentState, result);
    }
    public BiomeLaunchPlan? Begin(string biome)
    {
        if (Busy) return null;
        var state = Describe(biome);
        if (!state.CanSelect) return null;
        string? scene = SceneFor(biome, state.Destination == BiomeDestination.AnimalFromStart);
        var game = _app.Progress.Snapshot;
        if (scene is null || game is null) return null;
        return _pending = new(biome, scene, state.EnvironmentState, game.Id, game.Revision);
    }
    public bool Commit(BiomeLaunchPlan plan, Action<bool> applyEnvironment, Func<bool> changeScene)
    {
        if (_committed || !ReferenceEquals(plan, _pending) || !_app.BiomeMenu.IsAdmitted(_menu)) return false;
        var game = _app.Progress.Snapshot;
        var state = Describe(plan.BiomeId);
        if (game?.Id != plan.GameId || game.Revision != plan.Revision || !state.CanSelect || state.EnvironmentState != plan.EnvironmentState) return false;
        if (state.Destination == BiomeDestination.AnimalFromStart)
        {
            if (state.EnvironmentState != "healthy" && state.EnvironmentState != "degraded") return false;
            applyEnvironment(state.EnvironmentState == "healthy");
        }
        _committed = true;
        return changeScene();
    }
    public void Finish() { _pending = null; _committed = false; }
}
