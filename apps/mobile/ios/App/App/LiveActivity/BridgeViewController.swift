import Capacitor
import UIKit

/// Bridge propio para registrar los plugins locales del target App (Capacitor 8).
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
