#nullable enable
using System;
using System.Collections.Generic;
using TwoSides.Integration.SyncHttp;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

// Disposable storage for validating the game inside the engine. It exists only with the exact arguments
//   -- --two-sides-sync-local-test --two-sides-test-storage=sandbox
// and takes NO path: it creates a fresh SyntheticSandbox database (local-persistence/.work/databases/<guid>/<guid>.sqlite3), the same capability the
// automated checks use. That capability can only ever address files it created itself, so the runtime save (.work/runtime-game), the reconstruction
// copies and AppData stores cannot be named, opened, reached through links or deleted by this path. The game then opens it through the existing
// synthetic adapter, whose only accepted path token is "owned-outbox-fixture" (it rejects the runtime path outright).
public sealed class GameTestStorage : IDisposable
{
    public const string OpenPath="owned-outbox-fixture";
    private readonly SyntheticSandbox _sandbox;
    public SyntheticDatabase Database { get; }
    private bool _disposed;

    private GameTestStorage(SyntheticSandbox sandbox,SyntheticDatabase database){_sandbox=sandbox;Database=database;}

    // null = normal game (no test storage requested). Invalid test arguments fail closed instead of silently opening the real save.
    public static GameTestStorage? FromArguments(IEnumerable<string> userArguments)
    {
        switch(SyncTestStorageMode.FromArguments(userArguments))
        {
            case SyncTestStorageRequest.None:return null;
            case SyncTestStorageRequest.Sandbox:return Create();
            default:throw new InvalidOperationException("Invalid test storage request.");
        }
    }

    public static GameTestStorage Create()
    {
        var sandbox=new SyntheticSandbox(SyntheticSandbox.AuthorizedProjectRoot);
        try
        {
            var database=sandbox.CreateDatabase();
            SchemaManager.Initialize(database);GameplayEventSchema.MigrateSynthetic(database);SyncOutboxSchema.MigrateSynthetic(database);
            // A synthetic local player so the session is valid from the first frame; no game, no progress, no biome data.
            new GameSaveService(database,RealGameCatalog.InitialState()).CreateLocalProfile(Guid.NewGuid().ToString("D"),Guid.NewGuid().ToString("D"),"Synthetic Godot Validation");
            return new GameTestStorage(sandbox,database);
        }
        catch{sandbox.Dispose();throw;}
    }

    public GamePersistenceAdapter CreateAdapter()=>GamePersistenceAdapter.CreateSyntheticOutboxAdapter(Database);

    public void Dispose()
    {
        if(_disposed)return;_disposed=true;
        try{_sandbox.Dispose();}catch(SaveException){/* leftovers stay inside the disposable folder */}
    }
}
