import AppKit
import Foundation
import Observation

/// Lo que pinta la barra de menús: el último estado que mandó la web (`sincronizar`) y si hay sesión.
/// Es el destino de las marcas en la Mac y programa cuándo volver a pedir Hoy a la web.
@MainActor
@Observable
final class EstadoMac: DestinoEstado {
    private(set) var estado: EstadoCard?
    private(set) var conSesion = Sesion.leer() != nil
    /// La web mandó al menos un estado desde que arrancó la app (antes, la barra dice «Cargando…»).
    private(set) var recibido = false

    /// Pide a la web que vuelva a cargar Hoy (`Web.refrescar`); lo pone la app al arrancar.
    @ObservationIgnored var refrescar: () -> Void = {}
    @ObservationIgnored private var temporizador: Timer?
    @ObservationIgnored private var despertar: NSObjectProtocol?
    /// Sin `proximaFranja` (nada pendiente, sin sesión), se vuelve a pedir cada 15 min.
    static let respaldo: TimeInterval = 15 * 60

    @ObservationIgnored lazy var marcas = Marcas(destino: self, escritor: EscritorREST(), fechaLocal: { SupabaseREST.fechaLocal() })

    init() {
        despertar = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refrescar() }
        }
        programar(nil)
    }

    // MARK: DestinoEstado

    var estadoActual: EstadoCard? { estado }

    func publicar(_ estado: EstadoCard) async {
        self.estado = estado
    }

    // MARK: Desde la web (Puente)

    func sincronizar(_ estado: EstadoCard?) {
        self.estado = estado
        recibido = true
        programar(estado?.proximaFranja)
    }

    func sesionGuardada() { conSesion = true }

    func sesionCerrada() {
        conSesion = false
        estado = nil
        programar(nil)
    }

    // MARK: Botones de la barra

    func marcarHabito(_ h: EstadoCard.Habito) {
        Task {
            try? await marcas.marcarHabito(id: h.id, slot: h.slot)
            refrescar()
        }
    }

    func marcarPaso(_ p: EstadoCard.Paso) {
        Task {
            try? await marcas.marcarPaso(id: p.id, tipo: p.tipo)
            refrescar()
        }
    }

    /// Vuelve a pedir Hoy en el próximo cambio de franja (+5 s de margen) o, sin él, en `respaldo`.
    private func programar(_ proximaFranja: String?) {
        temporizador?.invalidate()
        let formato = ISO8601DateFormatter()
        formato.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let cuando = proximaFranja.flatMap { formato.date(from: $0) }.map { $0.addingTimeInterval(5) }
            ?? Date().addingTimeInterval(Self.respaldo)
        let t = Timer(fire: max(cuando, Date().addingTimeInterval(1)), interval: 0, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.refrescar()
                // Si la web no responde (sin sesión, sin red), que no se quede sin timer
                self?.programar(nil)
            }
        }
        RunLoop.main.add(t, forMode: .common)
        temporizador = t
    }
}
