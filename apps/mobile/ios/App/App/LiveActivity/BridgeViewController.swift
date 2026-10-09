import Capacitor
import UIKit
import WebKit

/// Bridge propio para registrar los plugins locales del target App (Capacitor 8) y el «jalar para actualizar».
class BridgeViewController: CAPBridgeViewController {
    /// Si la web no responde en este tiempo, el indicador se cierra igual.
    private static let tiempoMaximo: TimeInterval = 10

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())

        // Jalar hacia abajo: el indicador nativo de iOS y la web vuelve a pedir los datos (`window.sbRefrescar`,
        // apps/web/src/lib/nativo/useRefresco.ts). Capacitor quita el rebote del scroll; sin él no se puede jalar.
        guard let scroll = webView?.scrollView else { return }
        scroll.bounces = true
        scroll.alwaysBounceVertical = true
        let control = UIRefreshControl()
        control.addTarget(self, action: #selector(refrescar(_:)), for: .valueChanged)
        scroll.refreshControl = control
    }

    @objc private func refrescar(_ control: UIRefreshControl) {
        guard let webView else {
            control.endRefreshing()
            return
        }
        var terminado = false
        let terminar = {
            guard !terminado else { return }
            terminado = true
            control.endRefreshing()
        }
        // callAsyncJavaScript espera a la promesa: el indicador gira hasta que llegan los datos
        webView.callAsyncJavaScript("await window.sbRefrescar?.()", arguments: [:], in: nil, in: .page) { resultado in
            if case .failure(let error) = resultado { CAPLog.print("[Refresco] falló: \(error)") }
            terminar()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.tiempoMaximo, execute: terminar)
    }
}
