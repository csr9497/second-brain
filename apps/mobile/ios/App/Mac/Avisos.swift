import AppKit
import SwiftUI
import UserNotifications

/// Avisos de hábitos como notificaciones locales (M2). La web calcula cuáles quedan hoy (`avisosDelDia`, con las horas
/// de 🔔 Avisos y la jornada) y los manda en cada cambio (`programarAvisos`); aquí se reemplazan los programados.
/// Son locales: llegan aunque la ventana o la app estén cerradas, con el texto del último cálculo.
@MainActor
final class Avisos: NSObject, UNUserNotificationCenterDelegate {
    /// Espejo de `AvisoProgramado` (packages/shared/src/domain/avisos.ts).
    struct Aviso: Decodable {
        var id: String
        var franja: String
        /// ISO
        var cuando: String
        var titulo: String
        var cuerpo: String
        /// Hábitos que faltan (botón «Marcar todos»); vacío en el aviso de tareas y proyectos.
        var habitos: [HabitoAviso]
        var fecha: String
    }

    struct HabitoAviso: Codable {
        var id: String
        var slot: String
    }

    static let prefijo = "aviso-"
    private static let categoriaFranja = "franja"
    private static let accionMarcar = "marcar"
    private static let accionPosponer = "posponer"
    /// «En 30 min» vuelve a avisar pasado este tiempo.
    static let pospuesto: TimeInterval = 30 * 60
    private let centro = UNUserNotificationCenter.current()
    /// Se llama cuando puede haber cambiado el permiso (lo muestra la barra).
    var alCambiarPermiso: () -> Void = {}

    override init() {
        super.init()
        centro.delegate = self
        let marcar = UNNotificationAction(identifier: Self.accionMarcar, title: "Marcar todos")
        let posponer = UNNotificationAction(identifier: Self.accionPosponer, title: "En 30 min")
        centro.setNotificationCategories([UNNotificationCategory(identifier: Self.categoriaFranja, actions: [marcar, posponer], intentIdentifiers: [])])
    }

    /// `permitido`, `denegado` o `sin-decidir` (`PermisoAvisos` en la web).
    func permiso() async -> String {
        switch await centro.notificationSettings().authorizationStatus {
        case .denied: return "denegado"
        case .notDetermined: return "sin-decidir"
        default: return "permitido"
        }
    }

    /// Ajustes del Sistema → Notificaciones → esta app.
    func abrirAjustes() {
        let id = Bundle.main.bundleIdentifier ?? ""
        let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)")
            ?? URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!
        NSWorkspace.shared.open(url)
    }

    /// Reemplaza los avisos programados por `avisos` (los que ya pasaron se ignoran). Devuelve cuántos quedaron.
    func programar(_ avisos: [Aviso]) async -> Int {
        let futuros = avisos.compactMap { a in Compartido.fechaISO(a.cuando).map { (a, $0) } }.filter { $0.1 > Date() }
        if !futuros.isEmpty {
            // Solo pregunta la primera vez; luego devuelve lo que eligió Cesar
            _ = try? await centro.requestAuthorization(options: [.alert, .sound])
            alCambiarPermiso()
        }
        let viejos = await centro.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefijo) }
        centro.removePendingNotificationRequests(withIdentifiers: viejos)

        var programados = 0
        for (a, cuando) in futuros {
            if await agregar(id: Self.prefijo + a.id, contenido: contenido(a), cuando: cuando) { programados += 1 }
        }
        print("[Avisos] programados \(programados)")
        return programados
    }

    private func contenido(_ a: Aviso) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = a.titulo
        c.body = a.cuerpo
        c.sound = .default
        c.threadIdentifier = "habitos"
        if !a.habitos.isEmpty {
            c.categoryIdentifier = Self.categoriaFranja
            c.userInfo = ["habitos": a.habitos.map { [$0.id, $0.slot] }, "fecha": a.fecha]
        }
        return c
    }

    /// Fecha y hora de reloj: si la Mac duerme, el aviso sale al despertar (un intervalo se correría).
    private func agregar(id: String, contenido: UNNotificationContent, cuando: Date) async -> Bool {
        let partes = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: cuando)
        do {
            try await centro.add(UNNotificationRequest(identifier: id, content: contenido,
                                                       trigger: UNCalendarNotificationTrigger(dateMatching: partes, repeats: false)))
            return true
        } catch {
            print("[Avisos] no se pudo programar \(id): \(error)")
            return false
        }
    }

    /// «Marcar todos»: marca los hábitos del aviso en su día y vuelve a pedir Hoy (la web reprograma los avisos).
    private func marcarTodos(_ info: [AnyHashable: Any]) async {
        guard let habitos = info["habitos"] as? [[String]], let fecha = info["fecha"] as? String else { return }
        for h in habitos where h.count == 2 {
            do {
                try await SupabaseREST.marcarHabito(id: h[0], slot: h[1], fecha: fecha)
            } catch {
                print("[Avisos] marcar \(h[0]) falló: \(error)")
            }
        }
        Ventana.web?.refrescar()
    }

    // MARK: UNUserNotificationCenterDelegate

    /// También con la app al frente (por ejemplo, con la ventana abierta).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// Tocar el aviso abre la ventana en Hoy; sus botones marcan los hábitos o lo posponen sin abrirla.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let peticion = response.notification.request
        let info = peticion.content.userInfo
        switch response.actionIdentifier {
        case Self.accionMarcar:
            await marcarTodos(info)
        case Self.accionPosponer:
            guard let copia = peticion.content.mutableCopy() as? UNMutableNotificationContent else { return }
            // Otro prefijo: `programar` solo reemplaza los `aviso-*`, así que reprogramar no borra el pospuesto
            _ = await agregar(id: "pospuesto-" + peticion.identifier, contenido: copia, cuando: Date().addingTimeInterval(Self.pospuesto))
        default:
            await MainActor.run { Ventana.mostrar(accion: "ir:hoy") }
        }
    }
}

/// Abrir la ventana desde fuera de SwiftUI (avisos, widgets, Dock). La acción `openWindow` la deja la etiqueta de la
/// barra de menús, que existe mientras corre la app.
@MainActor
enum Ventana {
    static var abrir: OpenWindowAction?
    static var web: Web?

    static func mostrar(accion: String? = nil) {
        abrir?(id: Delegado.ventana)
        NSApp.activate()
        if let accion, let web { Task { await web.accion(accion) } }
    }
}
