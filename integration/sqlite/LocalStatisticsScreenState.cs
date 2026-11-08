#nullable enable
using System;
using System.Globalization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

public interface ILocalStatisticsReader
{
    Task<LocalSaveResult<StatisticsResult<PlayerStatistics>>> GetLocalStatisticsAsync();
}
// One load per opening/retry, no polling; discarded results cannot reopen a closed view.
public sealed class LocalStatisticsScreenState
{
    private readonly ILocalStatisticsReader _reader;
    private int _busy;
    private volatile bool _closed;
    private string _text="";
    public bool Busy=>Volatile.Read(ref _busy)!=0;
    public string Code { get; private set; }="READY";
    public StatisticsResult<PlayerStatistics>? Result { get; private set; }
    public LocalStatisticsScreenState(ILocalStatisticsReader reader)=>_reader=reader;
    public void Close(){_closed=true;Result=null;_text="";}
    public async Task<bool> LoadAsync()
    {
        if(_closed || Interlocked.CompareExchange(ref _busy,1,0)!=0) return false;
        Code="LOADING";Result=null;
        try
        {
            var read=await _reader.GetLocalStatisticsAsync();
            if(_closed) return false;
            if(!read.Success || read.Data is null){Code=read.Code;return false;}
            if(read.Data.State is not (StatisticsAvailability.Available or StatisticsAvailability.NoData) ||
                (read.Data.State==StatisticsAvailability.Available)!=(read.Data.Data is not null))
            {Code="INVALID_DATA";return false;}
            var text=await Task.Run(()=>LocalStatisticsText.Render(read.Data));
            if(_closed)return false;
            _text=text;Result=read.Data;Code="LOADED";return true;
        }
        catch {if(!_closed)Code="STORAGE_ERROR";return false;}
        finally {Interlocked.Exchange(ref _busy,0);}
    }
    public string Text=>Busy ? "Consultando estadísticas locales…" : Result is not null
        ? _text : "No se pudieron consultar las estadísticas locales. Tu progreso se conserva. Puedes reintentar o volver al menú.";
}

public static class LocalStatisticsText
{
    public static string Count(StatisticCount value)=>value.State switch
    {
        StatisticsAvailability.Available when value.Value is not null=>value.Value.Value.ToString(CultureInfo.InvariantCulture),
        StatisticsAvailability.Unknown=>"Desconocido",
        StatisticsAvailability.NoData=>"Sin datos",
        _=>"No disponible"
    };
    private static string Biome(string id)=>id switch
    {"ocean"=>"Océano","jungle"=>"Selva","desert"=>"Desierto","forest"=>"Bosque","tundra"=>"Tundra",_=>"Bioma desconocido"};
    private static string Status(string status)=>status switch
    {"human_pending"=>"Decisión humana pendiente","animal_pending"=>"Decisión confirmada; segmento animal pendiente",
     "completed"=>"Completado","in_progress"=>"En progreso","final_pending"=>"Final registrado pendiente","archived"=>"Archivado",_=>"Desconocido"};
    private static string Ending(EndingStatistics ending)=>ending.State==StatisticsAvailability.Available
        ? ending.Kind switch {"good"=>"Bueno","medium"=>"Medio","bad"=>"Malo",_=>"Desconocido"}
        : ending.State==StatisticsAvailability.Unknown?"Desconocido":"Sin final registrado";
    private static void Decisions(StringBuilder text,DecisionStatistics d)
    {text.AppendLine($"Decisiones confirmadas: {d.Total} | No (reject): {d.Reject} | Sí (approve): {d.Approve}");}
    private static void Game(StringBuilder text,GameStatistics game,string title)
    {
        text.AppendLine(title+" — "+Status(game.Status));
        text.AppendLine($"Inicio registrado: {game.CreatedAt}");
        text.AppendLine($"Biomas completados: {game.Progress.Completed} | Pendientes: {game.Progress.Pending}");
        Decisions(text,game.Decisions);
        foreach(var b in game.Biomes)
        {
            string environment=b.Consequence?.StateKind switch {"healthy"=>"Saludable","degraded"=>"Degradado",_=>"Sin decisión confirmada"};
            text.AppendLine($"• {Biome(b.BiomeId)}: {Status(b.Status)}. {environment}.");
        }
        text.AppendLine("Final histórico registrado: "+Ending(game.Ending));
        if(game.Activity is not null)Activity(text,game.Activity,"Actividad de esta partida");
        text.AppendLine();
    }
    // Plain text, never BBCode, SQL, a scene path or an HTTP payload.
    public static string Render(StatisticsResult<PlayerStatistics> result)
    {
        if(result.State==StatisticsAvailability.NoData || result.Data is null)
            return "Sin datos de perfil local. Vuelve al menú para guardar tu nombre. No se ha creado ninguna partida.";
        var p=result.Data;var text=new StringBuilder();
        text.AppendLine("Jugador: "+p.DisplayName);
        text.AppendLine($"Partidas registradas: {p.TotalGames}");
        text.AppendLine($"Partida actual: {(p.ActiveGame is null?"No":"Sí")}");
        text.AppendLine("Partidas terminadas confirmadas: "+Count(p.CompletedGames));
        text.AppendLine();text.AppendLine("TODAS LAS PARTIDAS");Decisions(text,p.AllDecisions);
        foreach(var b in p.AllDecisions.ByBiome)text.AppendLine($"• {Biome(b.BiomeId)}: {b.Total} decisiones | reject {b.Reject} | approve {b.Approve}");
        text.AppendLine();
        if(p.ActiveGame is not null)Game(text,p.ActiveGame,"PARTIDA ACTUAL");
        else text.AppendLine("Sin partida actual. El historial sigue disponible.\n");
        text.AppendLine("HISTORIAL — sin incluir la partida actual");
        if(p.HistoricalGames.Count==0)text.AppendLine("Sin partidas históricas.");
        else
        {
            Decisions(text,p.HistoricalDecisions);
            int index=0;foreach(var game in p.HistoricalGames)Game(text,game,"Partida histórica "+(++index));
        }
        if(p.Activity?.Sessions.State==StatisticsAvailability.Available)
        {
            Activity(text,p.Activity,"ACTIVIDAD LOCAL CONFIRMADA — todas las sesiones registradas");
            if(p.HistoricalGames.Count>0 && p.HistoricalActivity is not null)Activity(text,p.HistoricalActivity,"ACTIVIDAD HISTÓRICA — sin incluir partida actual");
            return text.ToString();
        }
        text.AppendLine();text.AppendLine("MÉTRICAS SIN CAPTURA");
        text.AppendLine("Tiempo jugado: "+Count(p.Uncollected.PlayedMilliseconds));
        text.AppendLine("Sesiones: "+Count(p.Uncollected.Sessions));
        text.AppendLine("Muertes: "+Count(p.Uncollected.Deaths));
        text.AppendLine("Reinicios: "+Count(p.Uncollected.Restarts));
        text.AppendLine("Reintentos: "+Count(p.Uncollected.Retries));
        return text.ToString();
    }
    private static string Duration(StatisticCount value)=>value.State==StatisticsAvailability.Available && value.Value is long ms
        ? (ms/1000m).ToString("0.000",CultureInfo.InvariantCulture)+" s confirmados" : Count(value);
    private static void Activity(StringBuilder text,ActivityStatistics a,string title)
    {
        text.AppendLine();text.AppendLine(title);
        text.AppendLine("Sesiones registradas: "+Count(a.Sessions));
        text.AppendLine("Tiempo efectivo: "+Duration(a.EffectiveMs));
        foreach(var b in a.ByBiome)text.AppendLine("• "+Biome(b.BiomeId)+": "+Duration(b.EffectiveMs));
        text.AppendLine("Muertes confirmadas: "+Count(a.Deaths));
        text.AppendLine("Solicitudes confirmadas de reinicio voluntario: "+Count(a.RestartRequests));
        text.AppendLine("Solicitudes confirmadas de reintento: "+Count(a.RetryRequests));
        if(a.Incomplete)text.AppendLine("Cobertura incompleta: se muestra únicamente el tiempo confirmado.");
        if(a.HistoricalCoverageUnknown)text.AppendLine("Solo cobertura registrada. La actividad anterior a la instrumentación es desconocida.");
        text.AppendLine("Las solicitudes no demuestran que una transición haya terminado correctamente.");
    }
}
