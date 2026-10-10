import AppKit
import SwiftUI
import WebKit

/// App de Mac: la web completa en una ventana y la barra de menús con la franja y los pasos de hoy (docs/APP-MAC.md).
@main
struct SecondBrainMacApp: App {
    @NSApplicationDelegateAdaptor private var delegado: Delegado

    var body: some Scene {
        Window("Second Brain", id: Delegado.ventana) {
            Contenedor(web: delegado.web).conDock()
                .frame(minWidth: 900, minHeight: 600)
        }
        .defaultSize(width: 1200, height: 820)
        .commands { Comandos(web: delegado.web) }

        MenuBarExtra {
            PanelBarra(estado: delegado.estado, web: delegado.web, avisos: delegado.avisos)
        } label: {
            EtiquetaBarra(estado: delegado.estado)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class Delegado: NSObject, NSApplicationDelegate {
    static let ventana = "principal"
    let estado = EstadoMac()
    let avisos = Avisos()
    lazy var web = Web(estado: estado, avisos: avisos)

    func applicationDidFinishLaunching(_ notification: Notification) {
        estado.refrescar = { [weak self] in self?.web.refrescar() }
        Ventana.web = web
        avisos.alCambiarPermiso = { [weak self] in self?.estado.actualizarPermiso() }
        estado.actualizarPermiso()
        Captura.shared.alGuardar = { [weak self] in self?.web.refrescar() }
        Captura.shared.registrarAtajo()
        // Abierta por un widget (--fondo) o al iniciar sesión en la Mac: sin ventana, solo la barra
        if CommandLine.arguments.contains("--fondo") || Self.abiertaAlIniciarSesion() {
            DispatchQueue.main.async {
                NSApp.windows.filter { $0.identifier?.rawValue.hasPrefix(Delegado.ventana) == true }.forEach { $0.close() }
                NSApp.setActivationPolicy(.accessory)
            }
        }
        _ = web // carga la web aunque la ventana no se abra (inicio de sesión en la Mac)
    }

    private static func abiertaAlIniciarSesion() -> Bool {
        guard let evento = NSAppleEventManager.shared().currentAppleEvent else { return false }
        return evento.eventID == kAEOpenApplication
            && evento.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
    }

    /// Cerrar la ventana deja la app en la barra de menús.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// Abrir la app ya abierta (Dock, Finder, tocar un widget) muestra la ventana.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { Ventana.mostrar() }
        return false
    }
}

/// La ventana muestra el WebView de la app. Con la ventana abierta hay ícono en el Dock; al cerrarla, solo la barra.
struct Contenedor: NSViewRepresentable {
    let web: Web

    func makeNSView(context: Context) -> WKWebView { web.vista }
    func updateNSView(_ vista: WKWebView, context: Context) {}

    static func dismantleNSView(_ vista: WKWebView, coordinator: ()) {
        // El WebView sigue vivo en `Web`; solo se suelta de la ventana
        vista.removeFromSuperview()
    }
}

extension Contenedor {
    func conDock() -> some View {
        self
            .onAppear {
                NSApp.setActivationPolicy(.regular)
                NSApp.activate()
            }
            .onDisappear { NSApp.setActivationPolicy(.accessory) }
    }
}
