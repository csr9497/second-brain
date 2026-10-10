import Foundation

/// Lo que comparten la app de Mac y sus widgets por el App Group (un contenedor de archivos común).
/// - La app escribe la `Instantanea` cada vez que cambia lo que pinta la barra; el widget solo la lee.
/// - El widget no escribe en Supabase (no tiene la sesión): encola los toques ✓ y avisa a la app, que los marca con
///   `Marcas` igual que la barra.
/// El grupo empieza por el Team ID: en macOS así vale sin perfil de aprovisionamiento (Personal Team).
enum Compartido {
    /// "" en producción y ".dev" en «Second Brain Dev» (`scripts/mac.sh … dev`, `SB_SUFIJO`): sale del bundle id de la
    /// app (`com.csr9497.secondbrain.mac<sufijo>`) o de su widget (`….widget`), así que cada uno usa su propio grupo.
    static let sufijo: String = {
        var id = Bundle.main.bundleIdentifier ?? ""
        if id.hasSuffix(".widget") { id.removeLast(".widget".count) }
        let base = "com.csr9497.secondbrain.mac"
        return id.hasPrefix(base) ? String(id.dropFirst(base.count)) : ""
    }()
    /// Debe coincidir con `com.apple.security.application-groups` de los entitlements (`$(SB_SUFIJO)`).
    static let grupo = "3WL76C24SA.com.csr9497.secondbrain" + sufijo
    /// Notificación Darwin con la que el widget avisa a la app de que hay toques en la cola.
    static let avisoToque = "com.csr9497.secondbrain\(sufijo).toque"
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
        /// El día completo (widget grande, racha). Opcional: instantáneas de antes no lo traen.
        var extra: ExtraMac?
        /// Cuándo el widget marcó un toque «enviando»: si la app no responde en `esperaToque`, el widget deja de
        /// mostrarlo (por ejemplo, con la app cerrada y sin poder abrirla).
        var enviandoDesde: Date?
        /// Ids tocados en el widget desde `enviandoDesde` (hábitos, semanales o pasos).
        var enviando: [String]?

        init(estado: EstadoCard?, conSesion: Bool, recibido: Bool, escrita: Date, extra: ExtraMac? = nil) {
            self.estado = estado
            self.conSesion = conSesion
            self.recibido = recibido
            self.escrita = escrita
            self.extra = extra
        }
    }

    /// Lo que espera el widget a que la app escriba un toque antes de dejar de mostrarlo «enviando».
    static let esperaToque: TimeInterval = 20

    /// Un ✓ tocado en el widget, pendiente de que la app lo escriba.
    struct Toque: Codable, Equatable {
        enum Tipo: String, Codable { case habito, paso, semanal }
        var tipo: Tipo
        var id: String
        /// Hábito: franja (`manana|tarde|noche`). Paso: `paso|tarea`. Semanal: vacío.
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

extension Compartido {
    static func fechaISO(_ texto: String) -> Date? { FechaISO.leer(texto) }
}
