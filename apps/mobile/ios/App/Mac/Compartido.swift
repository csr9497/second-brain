import Foundation

/// Lo que comparten la app de Mac y sus widgets por el App Group (un contenedor de archivos común).
/// - La app escribe la `Instantanea` cada vez que cambia lo que pinta la barra; el widget solo la lee.
/// - El widget no escribe en Supabase (no tiene la sesión): encola los toques ✓ y avisa a la app, que los marca con
///   `Marcas` igual que la barra.
/// El grupo empieza por el Team ID: en macOS así vale sin perfil de aprovisionamiento (Personal Team).
enum Compartido {
    static let grupo = "3WL76C24SA.com.csr9497.secondbrain"
    /// Notificación Darwin con la que el widget avisa a la app de que hay toques en la cola.
    static let avisoToque = "com.csr9497.secondbrain.toque"
    /// Tipo del widget (`WidgetCenter.reloadTimelines(ofKind:)`).
    static let tipoWidget = "SecondBrainHoy"

    /// Lo que pinta el widget.
    struct Instantanea: Codable, Equatable {
        var estado: EstadoCard?
        var conSesion: Bool
        /// La web mandó al menos un estado desde que arrancó la app.
        var recibido: Bool
        /// Cuándo la escribió la app.
        var escrita: Date
    }

    /// Un ✓ tocado en el widget, pendiente de que la app lo escriba.
    struct Toque: Codable, Equatable {
        enum Tipo: String, Codable { case habito, paso }
        var tipo: Tipo
        var id: String
        /// Hábito: franja (`manana|tarde|noche`). Paso: `paso|tarea`.
        var detalle: String
    }

    /// En los tests (sin App Group), una carpeta temporal.
    nonisolated(unsafe) static var carpetaDePrueba: URL?

    private static var carpeta: URL? {
        carpetaDePrueba ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: grupo)
    }
    private static var archivoInstantanea: URL? { carpeta?.appendingPathComponent("instantanea.json") }
    private static var archivoCola: URL? { carpeta?.appendingPathComponent("toques.json") }

    // MARK: Instantánea

    static func guardar(_ i: Instantanea) {
        guard let url = archivoInstantanea, let datos = try? JSONEncoder().encode(i) else { return }
        coordinar(escribir: url) { try? datos.write(to: $0, options: .atomic) }
    }

    static func leer() -> Instantanea? {
        guard let url = archivoInstantanea else { return nil }
        var i: Instantanea?
        coordinar(leer: url) { i = (try? Data(contentsOf: $0)).flatMap { try? JSONDecoder().decode(Instantanea.self, from: $0) } }
        return i
    }

    // MARK: Cola de toques

    static func encolar(_ t: Toque) {
        guard let url = archivoCola else { return }
        coordinar(escribir: url) { u in
            var cola = (try? Data(contentsOf: u)).flatMap { try? JSONDecoder().decode([Toque].self, from: $0) } ?? []
            if !cola.contains(t) { cola.append(t) }
            try? JSONEncoder().encode(cola).write(to: u, options: .atomic)
        }
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                                             CFNotificationName(avisoToque as CFString), nil, nil, true)
    }

    /// Saca todos los toques de la cola (la app, al recibir el aviso o al arrancar).
    static func tomarCola() -> [Toque] {
        guard let url = archivoCola else { return [] }
        var cola: [Toque] = []
        coordinar(escribir: url) { u in
            cola = (try? Data(contentsOf: u)).flatMap { try? JSONDecoder().decode([Toque].self, from: $0) } ?? []
            try? FileManager.default.removeItem(at: u)
        }
        return cola
    }

    // MARK: Coordinación (la app y el widget son procesos distintos)

    private static func coordinar(leer url: URL, _ bloque: (URL) -> Void) {
        var error: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &error, byAccessor: bloque)
    }

    private static func coordinar(escribir url: URL, _ bloque: (URL) -> Void) {
        var error: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: [], error: &error, byAccessor: bloque)
    }
}

// MARK: - Franja vigente

extension Compartido {
    /// ISO 8601 como lo manda la web (`toISOString`, con milisegundos) o sin fracción.
    static func fechaISO(_ texto: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: texto) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: texto)
    }
}

extension EstadoCard {
    /// Cuándo deja de valer lo que muestra: el próximo cambio de franja según la jornada (lo calcula la web).
    var vence: Date? { proximaFranja.flatMap(Compartido.fechaISO) }

    /// true si ya pasó el cambio de franja: los hábitos que trae son de la franja anterior. El widget y la barra
    /// no los muestran hasta que la app traiga los de la nueva.
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
}
