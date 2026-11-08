#nullable enable
using Godot;
using System;
using System.Threading.Tasks;
using TwoSides.Integration.Sqlite;
using TwoSides.Integration.SyncHttp;
using TwoSides.Network;

namespace TwoSides.Stats;

// B87: OPTIONAL autoload that only exists when an override.cfg next to the executable registers it (the normal game has no such file, so this node is never created).
// Even then it does nothing unless ALL of these hold: the launch arguments contain --stats-demo, --stats-expected-user=<account> equals the Windows account running the game
// (and is not an account that owns real player data), --stats-kit-dir=<absolute folder> is given, and a current loopback kit.json for THIS installation exists.
// Then it announces the (non-secret) installation id in the kit folder and calls the single existing activation point GameSyncHost.ConfigureStatisticsForAuthorizedRun.
// It never sends anything itself, never reads the player's save, never logs ids, tokens or paths.
public partial class StatsDemoBootstrap : Node
{
    private StatisticsKitOptions? _options;
    private volatile string? _installationId;
    private volatile bool _busy;
    private StatisticsTransport? _transport;
    private bool _configured;
    private double _elapsed,_sinceResume;
    public string Diagnostic { get; private set; } = "STATS_KIT_OFF";

    public override void _Ready()
    {
        _options = StatisticsKitGate.Evaluate(OS.GetCmdlineUserArgs(), System.Environment.UserName, out var code);
        Diagnostic = code;
        if (_options is null)
        {
            if (code != "STATS_KIT_OFF") GD.PushWarning("[StatsDemo] not enabled: " + code);
            SetProcess(false);
            return;
        }
        GD.Print("[StatsDemo] enabled for the expected account; waiting for the local statistics storage.");
    }

    public override void _Process(double delta)
    {
        if (_options is null) return;
        _elapsed += delta;
        if (_elapsed < 1.0 || _busy) return;
        _elapsed = 0;
        var app = GetNodeOrNull<GameApplicationContext>("/root/GameApplicationContext");
        var local = app?.Local;
        var sync = app?.Sync;
        if (local is null || sync is null) return;
        string directory = _options.KitDirectory;

        // 1. Learn the installation id (only possible once the local database is open) and announce it. Off the main thread.
        string? known = _installationId;
        if (known is null)
        {
            if (local.StatisticalDelivery is not GamePersistenceAdapter adapter || adapter.StatisticalOutbox is not { } outbox) return;
            _busy = true;
            _ = Task.Run(() =>
            {
                try
                {
                    string id = outbox.GetInstallationId();
                    StatisticsKitFiles.WriteInstallation(directory, id);
                    _installationId = id;
                    Diagnostic = "STATS_KIT_WAITING_FOR_SERVER";
                }
                catch (Exception) { Diagnostic = "STATS_KIT_INSTALLATION_UNAVAILABLE"; }
                finally { _busy = false; }
            });
            return;
        }

        string installation = known;
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // 2. Activate once, as soon as the server has published a current kit for this installation.
        if (!_configured)
        {
            var kit = StatisticsKitFiles.TryRead(directory, now, installation);
            if (kit is null) return;
            try
            {
                sync.ConfigureStatisticsForAuthorizedRun(true, store =>
                {
                    _transport = new StatisticsTransport(store, new KitStatisticsCredentials(directory, installation), new Uri(kit.Audience + "/"), syntheticLoopback: true);
                    return _transport;
                });
                _configured = true;
                Diagnostic = "STATS_KIT_ACTIVE";
                GD.Print("[StatsDemo] statistics transport active (127.0.0.1 only).");
            }
            catch (Exception)
            {
                Diagnostic = "STATS_KIT_ACTIVATION_REJECTED";
                SetProcess(false);
            }
            return;
        }

        // 3. The transport pauses itself when the credential is missing or expired and stays paused until resumed: resume it when a current kit is back (at most every 10 s).
        _sinceResume += 1.0;
        if (_transport is not null && _sinceResume >= 10.0 && _transport.Diagnostic == "STATISTICS_AUTH_REQUIRED" && StatisticsKitFiles.TryRead(directory, now, installation) is not null)
        {
            _sinceResume = 0;
            _busy = true;
            var transport = _transport;
            _ = Task.Run(async () => { try { await transport.ResumeAuthenticationAsync(); } catch (Exception) { /* retried later */ } finally { _busy = false; } });
        }
    }
}
