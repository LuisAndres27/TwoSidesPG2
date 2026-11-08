#nullable enable
using System;
using System.Collections.Generic;

namespace TwoSides.Network.Services;

public static class DecisionCatalog
{
    private static readonly IReadOnlyDictionary<string, string> Decisions = new Dictionary<string, string>
    {
        ["ocean"] = "ocean_waste_disposal",
        ["jungle"] = "jungle_transport_route",
        ["desert"] = "desert_cat_abandonment",
        ["forest"] = "forest_industrial_pesticides",
        ["tundra"] = "tundra_fossil_extraction"
    };
    public static string ForBiome(string biomeId) => biomeId is not null && Decisions.TryGetValue(biomeId, out var id)
        ? id : throw new ArgumentException("Bioma no reconocido.");
    public static bool Matches(string biomeId, string decisionId) => biomeId is not null &&
        Decisions.TryGetValue(biomeId, out var id) && id == decisionId;
}
