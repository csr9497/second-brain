import AppKit
import Carbon.HIToolbox
import SwiftUI

/// Captura rápida: un panel flotante para apuntar una idea sin abrir la ventana. Se abre con el atajo global
/// ⌃⌥Espacio (desde cualquier app) o desde la barra de menús, y la guarda en la bandeja (`ideas`).
@MainActor
final class Captura {
    static let shared = Captura()
    static let atajo = "⌃⌥Espacio"

    /// Tras guardar, la web vuelve a pedir lo que está en pantalla (la bandeja de capturas).
    var alGuardar: () -> Void = {}
    private var panel: NSPanel?
    private var atajoRef: EventHotKeyRef?

    /// Guarda el texto; devuelve el error para mostrarlo en el panel o en la barra.
    func guardar(_ texto: String) async -> String? {
        let t = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        do {
            try await SupabaseREST.capturar(t)
            alGuardar()
            return nil
        } catch {
            print("[Captura] falló: \(error)")
            return "No se pudo guardar (¿sin conexión o sin sesión?)"
        }
    }

    /// Atajo global con Carbon (`RegisterEventHotKey`): funciona en el sandbox y sin permiso de accesibilidad.
    func registrarAtajo() {
        var tipo = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            DispatchQueue.main.async { MainActor.assumeIsolated { Captura.shared.mostrar() } }
            return noErr
        }, 1, &tipo, nil, nil)
        let id = EventHotKeyID(signature: OSType(0x5342_4350), id: 1) // "SBCP"
        let estado = RegisterEventHotKey(UInt32(kVK_Space), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0, &atajoRef)
        if estado != noErr { print("[Captura] no se pudo registrar \(Self.atajo): \(estado)") }
    }

    func mostrar() {
        if panel == nil {
            let p = PanelClave(contentRect: NSRect(x: 0, y: 0, width: 460, height: 64),
                               styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false)
            p.titleVisibility = .hidden
            p.titlebarAppearsTransparent = true
            p.isMovableByWindowBackground = true
            p.level = .floating
            p.isReleasedWhenClosed = false
            p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            p.contentView = NSHostingView(rootView: VistaCaptura(cerrar: { [weak p] in p?.orderOut(nil) }))
            panel = p
        }
        panel?.center()
        NSApp.activate()
        panel?.makeKeyAndOrderFront(nil)
    }
}

/// Panel que acepta el teclado.
private final class PanelClave: NSPanel {
    override var canBecomeKey: Bool { true }
}

private struct VistaCaptura: View {
    let cerrar: () -> Void
    @State private var texto = ""
    @State private var error: String?
    @State private var guardando = false
    @FocusState private var foco: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "tray.and.arrow.down").foregroundStyle(.secondary)
                TextField("Captura rápida… (Enter guarda, Esc cierra)", text: $texto)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($foco)
                    .disabled(guardando)
                    .onSubmit { enviar() }
                    .onExitCommand { cerrar() }
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(width: 460)
        .onAppear {
            texto = ""
            error = nil
            foco = true
        }
    }

    private func enviar() {
        guardando = true
        Task {
            error = await Captura.shared.guardar(texto)
            guardando = false
            if error == nil {
                texto = ""
                cerrar()
            }
        }
    }
}
