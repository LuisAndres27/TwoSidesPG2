#nullable enable
using System.Collections.Generic;
using TwoSides.LocalPersistence;

namespace TwoSides.Integration.Sqlite;

// Version of the initial-save shape only. No availability, decision or ending evaluator.
internal static class RealGameCatalog
{
    internal static SaveCatalog InitialState() => new("initial-state-only-1", "copy-initial-content-1",
        new Dictionary<string, string> {
            ["ocean"]="ocean_waste_disposal", ["jungle"]="jungle_transport_route",
            ["desert"]="desert_cat_abandonment", ["forest"]="forest_industrial_pesticides",
            ["tundra"]="tundra_fossil_extraction"
        });
}
