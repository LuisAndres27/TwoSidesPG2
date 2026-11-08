#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

public sealed record InfrastructureResult(bool Success, string Code, LocalProfile? Profile = null);

// Plain C# adapter usable by Godot, intentionally not a Node or Autoload.
// No scenes, HTTP, environment credentials, gameplay or main-thread Godot objects.
public sealed class GodotSqliteInfrastructureAdapter : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DurableTestDatabase? _database;
    private GameSaveService? _service;
    private bool _closed;
    public static string StoragePath => DurableTestDatabase.AuthorizedPath;

    public Task<InfrastructureResult> OpenAsync(string absolutePath) => Execute(() =>
    {
        if (_closed) return new(false, "STORAGE_CLOSED");
        if (_database is not null) return new(false, "ALREADY_OPEN");
        var database = DurableTestDatabase.OpenOrCreate(absolutePath);
        try
        {
            // Synthetic catalog only. No gameplay rules are configured or exposed.
            var service = new GameSaveService(database, new SaveCatalog("infra-test-1", "infra-test-1",
                new Dictionary<string, string> { ["synthetic"] = "synthetic-decision" }));
            _database = database; _service = service;
            return new(true, "OPEN", service.GetLocalProfile());
        }
        catch { database.Dispose(); _database = null; _service = null; throw; }
    });

    public Task<InfrastructureResult> GetSyntheticProfileAsync() => Execute(() =>
        _service is null ? new(false, "STORAGE_CLOSED") : new(true, "PROFILE", _service.GetLocalProfile()));

    public Task<InfrastructureResult> EnsureSyntheticProfileAsync() => Execute(() =>
    {
        if (_service is null) return new(false, "STORAGE_CLOSED");
        var profile = _service.GetLocalProfile();
        if (profile is null)
        {
            _service.CreateLocalProfile(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), "Perfil sintético B04.2B.2A");
            profile = _service.GetLocalProfile();
        }
        return new(true, "PROFILE", profile);
    });

    public async Task CloseAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try { _service = null; _database?.Dispose(); _database = null; }
        finally { _gate.Release(); }
    }

    private async Task<InfrastructureResult> Execute(Func<InfrastructureResult> operation)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            return await Task.Run(() =>
            {
                try { return operation(); }
                catch (SaveException e) { return new InfrastructureResult(false, e.Code); }
                catch (UnauthorizedAccessException) { return new InfrastructureResult(false, "ACCESS_DENIED"); }
                catch (IOException) { return new InfrastructureResult(false, "IO_ERROR"); }
                catch { return new InfrastructureResult(false, "STORAGE_ERROR"); }
            }).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try { _closed = true; _service = null; _database?.Dispose(); _database = null; }
        finally { _gate.Release(); }
    }
}
