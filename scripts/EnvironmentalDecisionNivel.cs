#nullable enable
using Godot;

public partial class EnvironmentalDecisionNivel : DecisionNivel
{
    [Export] public string BiomeId = "";
    protected virtual string DecisionBiomeId => BiomeId;
    private DecisionSceneFlow? _flow;
    public override void _Ready()
    {
        base._Ready();
        _flow = new(this, () => DecisionBiomeId, () => PuedeDecidir, MostrarEsperaBackend,
            () => EscenaInfoBuena, () => EscenaInfoMala);
    }
    protected override async void Decidir(bool saludable, string escena)
    { if (_flow is not null) await _flow.ChooseAsync(saludable); }
    public override async void _UnhandledInput(InputEvent input)
    { if (_flow is not null) await _flow.RetryInputAsync(input); }
}
