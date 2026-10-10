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
    /// ISO del próximo cambio de franja (lo pone la web). La app de Mac vuelve a pedir Hoy a esa hora; en iOS es el
    /// `staleDate` de la card.
    var proximaFranja: String?
    /// Solo en la vista: ya empezó otra franja y no hay estado nuevo (`trasCaducar`). La web nunca lo manda.
    var actualizando: Bool?
}

extension EstadoCard {
    /// Nada pendiente: la card muestra «Día completo» y la app termina la actividad.
    var diaCompleto: Bool { habitos.isEmpty && pasos.isEmpty && masPasos == 0 }
}

// MARK: - Franja vigente (iOS, Mac y widgets)

/// ISO 8601 como lo manda la web (`toISOString`, con milisegundos) o sin fracción.
enum FechaISO {
    static func leer(_ texto: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: texto) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: texto)
    }
}

extension EstadoCard {
    /// Cuándo deja de valer lo que muestra: el próximo cambio de franja según la jornada (lo calcula la web).
    var vence: Date? { proximaFranja.flatMap(FechaISO.leer) }

    /// true si ya pasó el cambio de franja: los hábitos que trae son de la franja anterior. La card, el widget y la
    /// barra no los muestran hasta que llegue el estado de la nueva.
    func caducado(en fecha: Date) -> Bool {
        guard let vence else { return false }
        return fecha >= vence
    }

    /// La franja que empieza en `proximaFranja`: mañana → tarde → noche → mañana (del día siguiente).
    var franjaSiguiente: String {
        switch franja {
        case "manana": return "tarde"
        case "tarde": return "noche"
        default: return "manana"
        }
    }

    /// Tras la noche empieza otro día (`fin_dia`): tampoco valen los pasos ni el % del día.
    var siguienteEsOtroDia: Bool { franja == "noche" }

    /// Lo que se puede seguir mostrando cuando caducó: la franja nueva sin los hábitos de la anterior y, si cambió el
    /// día, sin pasos ni %. `actualizando` marca que falta el estado real.
    var trasCaducar: EstadoCard {
        var e = self
        e.franja = franjaSiguiente
        e.habitos = []
        e.franjaCompleta = false
        if siguienteEsOtroDia {
            e.pasos = []
            e.masPasos = 0
            e.pctDia = 0
        }
        e.actualizando = true
        return e
    }
}
