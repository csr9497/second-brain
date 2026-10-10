import Foundation
import UniformTypeIdentifiers
import WebKit

/// Sirve el build de la web (`Mac/public`, copiado por `pnpm mac:build`) en `app://localhost/`: un origin estable para
/// `localStorage` y la sesión de supabase-js, como `capacitor://localhost` en iOS.
final class EsquemaApp: NSObject, WKURLSchemeHandler {
    static let esquema = "app"
    static let inicio = URL(string: "app://localhost/index.html")!
    private let raiz = Bundle.main.resourceURL!.appendingPathComponent("public", isDirectory: true).standardizedFileURL

    func webView(_ webView: WKWebView, start tarea: WKURLSchemeTask) {
        guard let url = tarea.request.url else { return }
        var ruta = url.path
        if ruta.isEmpty || ruta == "/" { ruta = "/index.html" }
        let archivo = raiz.appendingPathComponent(String(ruta.dropFirst())).standardizedFileURL
        // Nada fuera de `public` (../)
        guard archivo.path.hasPrefix(raiz.path + "/"), let datos = try? Data(contentsOf: archivo) else {
            tarea.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            tarea.didFinish()
            return
        }
        let tipo = UTType(filenameExtension: archivo.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let respuesta = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                        headerFields: ["Content-Type": tipo, "Content-Length": "\(datos.count)"])!
        tarea.didReceive(respuesta)
        tarea.didReceive(datos)
        tarea.didFinish()
    }

    func webView(_ webView: WKWebView, stop tarea: WKURLSchemeTask) {}
}
