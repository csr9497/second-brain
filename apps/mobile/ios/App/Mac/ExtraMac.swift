import Foundation

/// Espejo de `ExtraMac` (packages/shared/src/domain/mac.ts): el día completo que la web manda solo a la app de Mac,
/// para la barra y los widgets grandes. Lo compilan la app y el widget.
struct ExtraMac: Codable, Hashable {
    struct Habito: Codable, Hashable {
        var id: String
        var nombre: String
        var inicial: String
        var slot: String
        var hecho: Bool
    }

    struct Semanal: Codable, Hashable {
        var id: String
        var nombre: String
        var inicial: String
        var meta: Int
        var hechas: Int
        var hoy: Bool
    }

    struct Paso: Codable, Hashable {
        var id: String
        var titulo: String
        /// paso | tarea
        var tipo: String
        var proyecto: String?
    }

    var fecha: String
    var franjaActual: String
    var pctDia: Double
    var racha: Int
    /// manana | tarde | noche → hábitos de esa franja
    var franjas: [String: [Habito]]
    var semanales: [Semanal]
    var pasos: [Paso]
    var totalPasos: Int

    static let ordenFranjas = ["manana", "tarde", "noche"]
}

func nombreFranja(_ f: String) -> String {
    switch f {
    case "manana": return "Mañana"
    case "tarde": return "Tarde"
    case "noche": return "Noche"
    default: return f.capitalized
    }
}
