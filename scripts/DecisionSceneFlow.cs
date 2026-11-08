#nullable enable
using Godot;
using System;
using System.Threading.Tasks;
using TwoSides.Network;
using TwoSides.Network.Services;
using TwoSides.Integration.Sqlite;
using TwoSides.LocalPersistence;

// Shared confirmation point; dialogue scripts and scene callbacks remain unchanged.
public sealed class DecisionSceneFlow
{
    private readonly Node2D _owner;
    private readonly Func<string> _biome, _goodScene, _badScene;
    private readonly Func<bool> _canChoose;
    private readonly Action<string> _message;
    private bool _busy, _canRetry;
    private bool? _choice;
    private LocalDecisionSession? _session;
    public DecisionSceneFlow(Node2D owner, Func<string> biome, Func<bool> canChoose,
        Action<string> message, Func<string> goodScene, Func<string> badScene)
        => (_owner,_biome,_canChoose,_message,_goodScene,_badScene)=(owner,biome,canChoose,message,goodScene,badScene);
    private bool Alive => GodotObject.IsInstanceValid(_owner) && _owner.IsInsideTree();
    private bool CorrectScene => Alive && _owner.GetTree().CurrentScene == _owner &&
        _owner.SceneFilePath == LocalBiomeSelection.HumanSceneFor(_biome());
    public bool AcceptsRetry(InputEvent input) => !_busy && _canRetry && input.IsActionPressed("ui_accept") &&
        !(input is InputEventKey key && key.Echo);
    public async Task ChooseAsync(bool saludable)
    {
        if (_busy || !Alive || !_canChoose()) return;
        _choice=saludable;
        await ConfirmChoice();
    }
    public async Task RetryInputAsync(InputEvent input)
    {
        if (!AcceptsRetry(input) || _choice is null || !Alive) return;
        _owner.GetViewport().SetInputAsHandled();
        await ConfirmChoice();
    }
    private async Task ConfirmChoice()
    {
        if (_busy || _choice is null || !Alive) return;
        _busy=true;_canRetry=false;
        _message("Guardando decisión local…");
        try
        {
            if (!CorrectScene) { _message("La escena no corresponde al bioma. No se confirmó la elección."); return; }
            var state=_owner.GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext")?.Local?.State;
            if (state is null || !state.Ready) { _canRetry=true;_message("Almacenamiento local no disponible. Presiona espacio para reintentar.");return; }
            _session ??= state.CreateDecisionSession(_biome(),DecisionCatalog.ForBiome(_biome()));
            bool healthy=_choice.Value;
            // The dialogue's existing saludable result is preserved. No scoring/classification is inferred here.
            bool success=await _session.ConfirmAsync(EnvironmentalDecisionService.OptionFor(healthy),healthy?"healthy":"degraded",
                ()=>CorrectScene && ResourceLoader.Exists(healthy?_goodScene():_badScene(),"PackedScene"),
                confirmed=>
                {
                    if (!CorrectScene) throw new SaveException("SCENE_CLOSED");
                    VariablesGlobales.BiomaSaludable=confirmed.Environment.StateKind=="healthy";
                },
                async confirmed=>
                {
                    if (!CorrectScene) return false;
                    string destination=confirmed.Environment.StateKind=="healthy"?_goodScene():_badScene();
                    var transition=_owner.GetNodeOrNull<Transicion>("/root/Transicion");
                    ulong started=Time.GetTicksMsec();
                    while (transition is not null && transition.Ocupado && Time.GetTicksMsec()-started<6000)
                    {
                        await _owner.ToSignal(_owner.GetTree(),SceneTree.SignalName.ProcessFrame);
                        if (!CorrectScene) return false;
                    }
                    bool Valid()=>CorrectScene && _session.IsCurrent(confirmed);
                    if (transition?.Ocupado==true || !Valid()) return false;
                    if (transition is not null) return await transition.CambiarEscenaValidadaAsync(destination,Valid);
                    return Valid() && _owner.GetTree().ChangeSceneToFile(destination)==Error.Ok;
                });
            if (!Alive) return;
            _canRetry=!success && _session.Code is not ("DECISION_CONFLICT" or "BIOME_COMPLETED" or "GAME_NOT_ACTIVE");
            _message(LocalDecisionSession.MessageFor(_session.Code));
        }
        catch (SaveException) { if(Alive){_canRetry=true;_message("No se pudo confirmar la decisión local. Presiona espacio para reintentar.");} }
        catch { if(Alive){_canRetry=true;_message("No se pudo confirmar la operación local. El progreso guardado se conserva.");} }
        finally { _busy=false; }
    }
}