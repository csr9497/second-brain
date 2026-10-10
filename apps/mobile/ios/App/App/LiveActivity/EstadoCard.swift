import Foundation

/// Estado de la card de iOS y de la barra de menús de la Mac. Sin dependencias (sin ActivityKit): lo compilan la app
/// de iOS, su extensión, la app de Mac y sus tests.
/// Es un espejo de `EstadoLiveActivity` (packages/shared/src/domain/liveActivity.ts), más `marca`, que solo pone la app
/// (`Marcas`) y la web no manda: al sincronizar vuelve a nil.
struct EstadoCard: Codable, Hashable {
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
    /// ISO del próximo cambio de franja (lo pone la web). La app de Mac vuelve a pedir Hoy a esa hora; la card lo ignora.
    var proximaFranja: String?
}

extension EstadoCard {
    /// Nada pendiente: la card muestra «Día completo» y la app termina la actividad.
    var diaCompleto: Bool { habitos.isEmpty && pasos.isEmpty && masPasos == 0 }
}
