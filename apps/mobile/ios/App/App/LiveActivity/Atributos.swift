import ActivityKit
import Foundation

/// Atributos de la Live Activity. Se compila en la app y en la extensión (Task 4): sin dependencias.
/// `ContentState` es un espejo exacto de `EstadoLiveActivity` (packages/shared/src/domain/liveActivity.ts).
struct SecondBrainAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        struct Habito: Codable, Hashable {
            var id: String
            var nombre: String
            var inicial: String
            /// manana | tarde | noche
            var slot: String
            var turno: [String]
            var hecho: Bool
        }

        struct Paso: Codable, Hashable {
            var id: String
            var titulo: String
            /// paso | tarea
            var tipo: String
        }

        var franja: String
        var franjaCompleta: Bool
        var pctDia: Double
        var habitos: [Habito]
        var pasos: [Paso]
        var masPasos: Int
        /// ISO 8601 (lo pone la web)
        var actualizado: String
    }
}
