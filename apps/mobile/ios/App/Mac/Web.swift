import AppKit
import WebKit

/// El único WKWebView de la app. Lo retiene la app (no la ventana): con la ventana cerrada sigue vivo, Realtime
/// mantiene Hoy al día y la barra de menús recibe el estado.
@MainActor
final class Web: NSObject, WKNavigationDelegate, WKUIDelegate {
    let vista: WKWebView

    init(estado: EstadoMac) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(EsquemaApp(), forURLScheme: EsquemaApp.esquema)
        config.userContentController.addScriptMessageHandler(Puente(estado: estado), contentWorld: .page, name: Puente.nombre)
        // Que WebKit no congele la página con la ventana oculta
        config.preferences.inactiveSchedulingPolicy = .none
        vista = WKWebView(frame: .zero, configuration: config)
        super.init()
        vista.navigationDelegate = self
        vista.uiDelegate = self
        #if DEBUG
        vista.isInspectable = true
        #endif
        vista.load(URLRequest(url: EsquemaApp.inicio))
    }

    /// `window.sbRefrescar()` (useRefresco): vuelve a pedir las queries activas; con ellas, la web manda el estado.
    func refrescar() {
        vista.evaluateJavaScript("window.sbRefrescar?.()", completionHandler: nil)
    }

    /// `window.sbAccion(nombre)` (useAccionesNativas). false si la web no la hizo (modal abierto, aún cargando).
    @discardableResult
    func accion(_ nombre: String) async -> Bool {
        let r = try? await vista.callAsyncJavaScript(
            "return window.sbAccion ? await window.sbAccion(nombre) : false",
            arguments: ["nombre": nombre], contentWorld: .page)
        return (r as? Bool) ?? false
    }

    // MARK: Enlaces externos al navegador

    func webView(_ webView: WKWebView, decidePolicyFor accion: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = accion.request.url else { return .cancel }
        if url.scheme == EsquemaApp.esquema || url.scheme == "about" { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    /// `target=_blank` / `window.open`: al navegador.
    func webView(_ webView: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                 for accion: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = accion.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    /// Si el proceso de la web muere (memoria), se recarga.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: EsquemaApp.inicio))
    }
}
