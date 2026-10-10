import Foundation
import WebKit

/// `window.webkit.messageHandlers.sbMac`: el mismo contrato que el plugin `LiveActivity` de iOS
/// (`puenteMac` en apps/web/src/lib/nativo/plataforma.ts). Mensajes `{ metodo, args }`.
@MainActor
final class Puente: NSObject, WKScriptMessageHandlerWithReply {
    static let nombre = "sbMac"
    let estado: EstadoMac

    init(estado: EstadoMac) { self.estado = estado }

    func userContentController(_ controller: WKUserContentController, didReceive mensaje: WKScriptMessage) async -> (Any?, String?) {
        guard let cuerpo = mensaje.body as? [String: Any], let metodo = cuerpo["metodo"] as? String else {
            return (nil, "Mensaje inválido")
        }
        let args = cuerpo["args"] as? [String: Any] ?? [:]
        switch metodo {
        case "sincronizar":
            guard let crudo = args["estado"], !(crudo is NSNull) else {
                estado.sincronizar(nil)
                return (["activa": false, "id": NSNull()], nil)
            }
            do {
                let datos = try JSONSerialization.data(withJSONObject: crudo)
                estado.sincronizar(try JSONDecoder().decode(EstadoCard.self, from: datos))
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
            return (NSNull(), nil)
        default:
            return (nil, "Método desconocido: \(metodo)")
        }
    }
}
