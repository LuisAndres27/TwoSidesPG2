#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using TwoSides.Network.Services;

namespace TwoSides.Network;

public sealed class StoredOperation
{
    public string UserId { get; }
    public string GameId { get; }
    public string Operation { get; }
    public JsonElement Command { get; }
    public Guid EventId => Command.GetProperty("eventId").GetGuid();
    public long ExpectedRevision => Command.GetProperty("expectedRevision").GetInt64();
    internal StoredOperation(string user, string game, string operation, JsonElement command)
        => (UserId, GameId, Operation, Command) = (user, game, operation, command.Clone());
}

// Solo comandos: ni JWT, ni credenciales, ni recibos/snapshots como autoridad local.
public sealed class PendingOperationStore
{
    private readonly string _root;
    public PendingOperationStore(string root) => _root = Path.GetFullPath(root);
    private static bool Id(string value) => Regex.IsMatch(value, "\\A[a-f0-9]{24}\\z");
    private static void Fields(JsonElement obj, params string[] fields)
    {
        if (obj.ValueKind != JsonValueKind.Object) throw new FormatException();
        var names = obj.EnumerateObject().Select(p => p.Name).ToArray();
        if (names.Length != fields.Length || names.Distinct().Count() != names.Length || names.Except(fields).Any()) throw new FormatException();
    }
    public static StoredOperation Decode(string json)
    {
        if (Encoding.UTF8.GetByteCount(json) > 8192) throw new FormatException();
        using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 8 });
        var root = doc.RootElement; Fields(root,"version","userId","gameId","operation","command");
        if (root.GetProperty("version").GetInt32() != 1) throw new FormatException();
        string user = root.GetProperty("userId").GetString()!, game = root.GetProperty("gameId").GetString()!, op = root.GetProperty("operation").GetString()!;
        if (user is null || game is null || !Id(user) || !Id(game)) throw new FormatException();
        var command = root.GetProperty("command");
        switch (op)
        {
            case "decisions": Fields(command,"eventId","expectedRevision","biomeId","decisionId","optionId"); break;
            case "animal-completions": Fields(command,"eventId","expectedRevision","biomeId"); break;
            case "animal-restarts": Fields(command,"eventId","expectedRevision","biomeId","reason"); break;
            case "final-exit": Fields(command,"eventId","expectedRevision"); break;
            default: throw new FormatException();
        }
        if (!Guid.TryParseExact(command.GetProperty("eventId").GetString(),"D",out var eventId) || eventId == Guid.Empty ||
            !command.GetProperty("expectedRevision").TryGetInt64(out long revision) || revision < 0 || revision > 9007199254740991L) throw new FormatException();
        if (op != "final-exit")
        {
            string biome = command.GetProperty("biomeId").GetString()!;
            _ = DecisionCatalog.ForBiome(biome);
            if (op == "decisions" && (!DecisionCatalog.Matches(biome,command.GetProperty("decisionId").GetString()!) ||
                command.GetProperty("optionId").GetString() is not ("reject" or "approve"))) throw new FormatException();
            if (op == "animal-restarts" && command.GetProperty("reason").GetString() is not ("death" or "voluntary")) throw new FormatException();
        }
        return new(user,game,op,command);
    }
    public static string Encode(string user, string game, string operation, JsonElement command)
        => JsonSerializer.Serialize(new { version = 1, userId = user, gameId = game, operation, command });
    private string FileName(StoredOperation op) => Path.Combine(_root,op.UserId,op.GameId,op.EventId.ToString("D") + ".json");
    private bool SafeDirectory(string dir) => !Directory.Exists(dir) || (File.GetAttributes(dir) & FileAttributes.ReparsePoint) == 0;
    public bool Save(string user, string game, string operation, JsonElement command)
    {
        try
        {
            string json = Encode(user,game,operation,command); var op = Decode(json); string file = FileName(op);
            if (!SafeDirectory(_root) || !SafeDirectory(Path.Combine(_root,user)) || !SafeDirectory(Path.GetDirectoryName(file)!)) return false;
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            if (File.Exists(file)) return (File.GetAttributes(file) & FileAttributes.ReparsePoint) == 0 && new FileInfo(file).Length <= 8192 && EncodeOp(Decode(File.ReadAllText(file))) == EncodeOp(op);
            string temporary = file + ".tmp-" + Guid.NewGuid().ToString("N");
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            using (var stream = new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough))
            { stream.Write(bytes,0,bytes.Length); stream.Flush(true); }
            File.Move(temporary,file); // Mismo directorio; nunca sobrescribir otro evento.
            return true;
        }
        catch { return false; }
    }
    private static string EncodeOp(StoredOperation op) => Encode(op.UserId,op.GameId,op.Operation,op.Command);
    public StoredOperation[] ReadUser(string user, out bool blocked)
    {
        blocked = false; var result = new List<StoredOperation>();
        if (!Id(user)) { blocked = true; return result.ToArray(); }
        try
        {
            string dir = Path.Combine(_root,user);
            if (!SafeDirectory(_root) || !SafeDirectory(dir)) { blocked = true; return result.ToArray(); }
            if (!Directory.Exists(dir)) return result.ToArray();
            if (Directory.EnumerateFiles(dir).Any()) blocked = true;
            // Solo un nivel de partidas y archivos propios de esta cuenta.
            int visited = 0;
            foreach (var gameDir in Directory.EnumerateDirectories(dir))
            {
                if (++visited > 1000) { blocked = true; break; }
                if ((File.GetAttributes(gameDir) & FileAttributes.ReparsePoint) != 0 || !Id(Path.GetFileName(gameDir))) { blocked = true; continue; }
                foreach (var file in Directory.EnumerateFiles(gameDir))
                {
                    if (++visited > 1000) { blocked = true; return result.ToArray(); }
                    if (!file.EndsWith(".json",StringComparison.Ordinal)) { blocked = true; continue; }
                    try
                    {
                        if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0 || new FileInfo(file).Length > 8192) throw new FormatException();
                        var op = Decode(File.ReadAllText(file));
                        if (op.UserId != user || FileName(op) != file) throw new FormatException();
                        result.Add(op);
                    }
                    catch
                    {
                        blocked = true;
                        try { File.Move(file,file + ".invalid-" + Guid.NewGuid().ToString("N")); } catch { }
                    }
                }
            }
        }
        catch { blocked = true; }
        return result.OrderBy(p=>p.ExpectedRevision).ThenBy(p=>p.EventId).ToArray();
    }
    public bool Remove(string user, string game, Guid eventId)
    {
        if (!Id(user) || !Id(game) || eventId == Guid.Empty) return false;
        try
        {
            if (!SafeDirectory(_root) || !SafeDirectory(Path.Combine(_root,user)) || !SafeDirectory(Path.Combine(_root,user,game))) return false;
            File.Delete(Path.Combine(_root,user,game,eventId.ToString("D") + ".json")); return true;
        }
        catch { return false; }
    }
}
