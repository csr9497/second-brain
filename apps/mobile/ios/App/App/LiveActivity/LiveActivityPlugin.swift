import ActivityKit
import Capacitor
import Foundation

/// Plugin local que expone la Live Activity a la web (`registerPlugin('LiveActivity')`, apps/web/src/lib/nativo).
/// Se registra en `BridgeViewController.capacitorDidLoad()`.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sincronizar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "guardarSesion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leerSesion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cerrarSesion", returnType: CAPPluginReturnPromise),
    ]

    /// `{ estado: EstadoLiveActivity | null }` → `{ activa, id }`
    @objc func sincronizar(_ call: CAPPluginCall) {
        let crudo = call.options["estado"]
        guard let crudo, !(crudo is NSNull) else {
            CAPLog.print("[LiveActivity] sincronizar: estado null, se terminan las actividades")
            Task {
                await Self.terminarTodas()
                call.resolve(["activa": false, "id": NSNull()])
            }
            return
        }
        let estado: EstadoCard
        do {
            let datos = try JSONSerialization.data(withJSONObject: crudo)
            estado = try JSONDecoder().decode(EstadoCard.self, from: datos)
        } catch {
            CAPLog.print("[LiveActivity] sincronizar: estado inválido: \(error)")
            call.reject("Estado inválido: \(error.localizedDescription)", "ESTADO_INVALIDO", error)
            return
        }
        CAPLog.print("[LiveActivity] sincronizar: franja=\(estado.franja) habitos=\(estado.habitos.count) pasos=\(estado.pasos.count) masPasos=\(estado.masPasos)")

        Task { @MainActor in
            AccionesCard.destino.ultimo = estado
            let contenido = ActivityContent(state: estado, staleDate: estado.vence)
            if let actual = Activity<SecondBrainAttributes>.activities.first {
                await actual.update(contenido)
                CAPLog.print("[LiveActivity] actualizada \(actual.id)")
                call.resolve(["activa": true, "id": actual.id])
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                CAPLog.print("[LiveActivity] las Live Activities están desactivadas")
                call.resolve(["activa": false, "id": NSNull()])
                return
            }
            do {
                let actividad = try Activity.request(attributes: SecondBrainAttributes(), content: contenido, pushType: nil)
                CAPLog.print("[LiveActivity] creada \(actividad.id)")
                call.resolve(["activa": true, "id": actividad.id])
            } catch {
                CAPLog.print("[LiveActivity] no se pudo crear: \(error)")
                call.reject("No se pudo crear la Live Activity: \(error.localizedDescription)", "REQUEST", error)
            }
        }
    }

    /// `{ url, anonKey, accessToken, refreshToken }` → Keychain
    @objc func guardarSesion(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), let anonKey = call.getString("anonKey"),
              let accessToken = call.getString("accessToken"), let refreshToken = call.getString("refreshToken") else {
            call.reject("Faltan url, anonKey, accessToken o refreshToken", "ARGUMENTOS")
            return
        }
        do {
            try Sesion.guardar(Sesion(url: url, anonKey: anonKey, accessToken: accessToken, refreshToken: refreshToken))
            CAPLog.print("[LiveActivity] sesión guardada en el Keychain")
            call.resolve()
        } catch {
            call.reject("No se pudo guardar la sesión: \(error.localizedDescription)", "KEYCHAIN", error)
        }
    }

    /// Keychain → `{ url, accessToken, refreshToken }`, o `{}` si no hay sesión. La web lo usa para tomar los tokens
    /// que rotó un botón de la card (`SupabaseREST.refrescar`); ver `almacenNativo` en apps/web/src/lib/nativo/sesion.ts.
    @objc func leerSesion(_ call: CAPPluginCall) {
        guard let s = Sesion.leer() else {
            call.resolve([:])
            return
        }
        call.resolve(["url": s.url, "accessToken": s.accessToken, "refreshToken": s.refreshToken])
    }

    /// Borra la sesión del Keychain y termina la actividad.
    @objc func cerrarSesion(_ call: CAPPluginCall) {
        Sesion.borrar()
        CAPLog.print("[LiveActivity] sesión borrada")
        Task {
            await Self.terminarTodas()
            call.resolve()
        }
    }

    @MainActor
    private static func terminarTodas() async {
        AccionesCard.destino.ultimo = nil
        for actividad in Activity<SecondBrainAttributes>.activities {
            await actividad.end(nil, dismissalPolicy: .immediate)
        }
    }
}
