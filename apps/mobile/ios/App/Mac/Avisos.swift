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
    }

    static let prefijo = "aviso-"
    private let centro = UNUserNotificationCenter.current()

    override init() {
        super.init()
        centro.delegate = self
    }

    /// Reemplaza los avisos programados por `avisos` (los que ya pasaron se ignoran). Devuelve cuántos quedaron.
    func programar(_ avisos: [Aviso]) async -> Int {
        let futuros = avisos.compactMap { a in Compartido.fechaISO(a.cuando).map { (a, $0) } }.filter { $0.1 > Date() }
        if !futuros.isEmpty {
            // Solo pregunta la primera vez; luego devuelve lo que eligió Cesar
            _ = try? await centro.requestAuthorization(options: [.alert, .sound])
        }
        let viejos = await centro.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefijo) }
        centro.removePendingNotificationRequests(withIdentifiers: viejos)

        var programados = 0
        for (a, cuando) in futuros {
            let contenido = UNMutableNotificationContent()
            contenido.title = a.titulo
            contenido.body = a.cuerpo
            contenido.sound = .default
            contenido.threadIdentifier = "habitos"
            // Fecha y hora de reloj: si la Mac duerme, el aviso sale al despertar (un intervalo se correría)
            let partes = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: cuando)
            let disparo = UNCalendarNotificationTrigger(dateMatching: partes, repeats: false)
            do {
                try await centro.add(UNNotificationRequest(identifier: Self.prefijo + a.id, content: contenido, trigger: disparo))
                programados += 1
            } catch {
                print("[Avisos] no se pudo programar \(a.id): \(error)")
            }
        }
        print("[Avisos] programados \(programados)")
        return programados
    }

    // MARK: UNUserNotificationCenterDelegate

    /// También con la app al frente (por ejemplo, con la ventana abierta).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// Tocar el aviso abre la ventana en Hoy.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        await MainActor.run { Ventana.mostrar(accion: "ir:hoy") }
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
