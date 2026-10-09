import ActivityKit
import Foundation

/// Atributos de la Live Activity. Se compila en la app y en la extensión: sin dependencias.
/// `ContentState` es un espejo de `EstadoLiveActivity` (packages/shared/src/domain/liveActivity.ts), más `marca`,
/// que solo pone la app (`AccionesCard`) y la web no manda: al sincronizar vuelve a nil.
struct SecondBrainAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Botón tocado cuya escritura está en curso o acaba de fallar.
        enum Marca: String, Codable, Hashable {
            case enviando
            case fallo
        }

        struct Habito: Codable, Hashable {
            var id: String
            var nombre: String
            var inicial: String
            /// manana | tarde | noche
            var slot: String
            var turno: [String]
            var hecho: Bool
            var marca: Marca?
        }

        struct Paso: Codable, Hashable {
            var id: String
            var titulo: String
            /// paso | tarea
            var tipo: String
            var marca: Marca?
        }

        /// Día (de la jornada) que muestra la card, `yyyy-MM-dd`. Opcional: una actividad creada antes de este campo no lo trae.
        var fecha: String?
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

typealias EstadoCard = SecondBrainAttributes.ContentState

extension EstadoCard {
    /// Nada pendiente: la card muestra «Día completo» y la app termina la actividad.
    var diaCompleto: Bool { habitos.isEmpty && pasos.isEmpty && masPasos == 0 }
}
