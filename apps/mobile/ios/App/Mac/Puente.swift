import Foundation
import WebKit

/// `window.webkit.messageHandlers.sbMac`: el mismo contrato que el plugin `LiveActivity` de iOS
/// (`puenteMac` en apps/web/src/lib/nativo/plataforma.ts). Mensajes `{ metodo, args }`.
@MainActor
final class Puente: NSObject, WKScriptMessageHandlerWithReply {
    static let nombre = "sbMac"
    let estado: EstadoMac
    let avisos: Avisos

    init(estado: EstadoMac, avisos: Avisos) {
        self.estado = estado
        self.avisos = avisos
    }

    func userContentController(_ controller: WKUserContentController, didReceive mensaje: WKScriptMessage) async -> (Any?, String?) {
        guard let cuerpo = mensaje.body as? [String: Any], let metodo = cuerpo["metodo"] as? String else {
            return (nil, "Mensaje inválido")
        }
        let args = cuerpo["args"] as? [String: Any] ?? [:]
        switch metodo {
        case "sincronizar":
            var extra: ExtraMac?
            if let x = args["extra"], !(x is NSNull) {
                do {
                    extra = try JSONDecoder().decode(ExtraMac.self, from: JSONSerialization.data(withJSONObject: x))
                } catch {
                    print("[Mac] sincronizar: extra inválido: \(error)")
                }
            }
            guard let crudo = args["estado"], !(crudo is NSNull) else {
                estado.sincronizar(nil, extra: extra)
                return (["activa": false, "id": NSNull()], nil)
            }
            do {
                let datos = try JSONSerialization.data(withJSONObject: crudo)
                estado.sincronizar(try JSONDecoder().decode(EstadoCard.self, from: datos), extra: extra)
                return (["activa": true, "id": NSNull()], nil)
            } catch {
                print("[Mac] sincronizar: estado inválido: \(error)")
                return (nil, "Estado inválido: \(error.localizedDescription)")
            }
        case "guardarSesion":
            guard let url = args["url"] as? String, let anonKey = args["anonKey"] as? String,
                  let acceso = args["accessToken"] as? String, let refresco = args["refreshToken"] as? String else {
                return (nil, "Faltan url, anonKey, accessToken o refreshToken")
            }
            do {
                try Sesion.guardar(Sesion(url: url, anonKey: anonKey, accessToken: acceso, refreshToken: refresco))
                estado.sesionGuardada()
                return (NSNull(), nil)
            } catch {
                return (nil, "No se pudo guardar la sesión: \(error.localizedDescription)")
            }
        case "leerSesion":
            guard let s = Sesion.leer() else { return ([String: Any](), nil) }
            return (["url": s.url, "accessToken": s.accessToken, "refreshToken": s.refreshToken], nil)
        case "cerrarSesion":
            Sesion.borrar()
            estado.sesionCerrada()
            _ = await avisos.programar([])
            return (NSNull(), nil)
        case "permisoAvisos":
            return (["permiso": await avisos.permiso()], nil)
        case "abrirAjustesAvisos":
            avisos.abrirAjustes()
            return (NSNull(), nil)
        case "programarAvisos":
            do {
                let datos = try JSONSerialization.data(withJSONObject: args["avisos"] ?? [])
                let lista = try JSONDecoder().decode([Avisos.Aviso].self, from: datos)
                return (["programados": await avisos.programar(lista)], nil)
            } catch {
                return (nil, "Avisos inválidos: \(error.localizedDescription)")
            }
        default:
            return (nil, "Método desconocido: \(metodo)")
        }
    }
}
