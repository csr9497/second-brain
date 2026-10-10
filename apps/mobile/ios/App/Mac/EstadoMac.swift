import AppKit
import Foundation
import Observation
import WidgetKit

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
        escucharWidget()
        // Lo que haya en el App Group puede ser de otra sesión: el widget empieza con lo que sabe esta app
        compartir()
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
        compartir()
    }

    // MARK: Desde la web (Puente)

    func sincronizar(_ estado: EstadoCard?) {
        self.estado = estado
        recibido = true
        programar(estado?.proximaFranja)
        compartir()
        // Toques del widget que llegaron con la app cerrada o antes de tener estado
        procesarToques()
    }

    func sesionGuardada() {
        guard !conSesion else { return }
        conSesion = true
        compartir()
    }

    func sesionCerrada() {
        conSesion = false
        estado = nil
        programar(nil)
        compartir()
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

    // MARK: Widgets (Compartido)

    /// Guarda lo que pinta la barra en el App Group y recarga el widget.
    private func compartir() {
        Compartido.guardar(Compartido.Instantanea(estado: estado, conSesion: conSesion, recibido: recibido, escrita: Date()))
        WidgetCenter.shared.reloadTimelines(ofKind: Compartido.tipoWidget)
    }

    /// El widget avisa con una notificación Darwin cuando encola un toque.
    private func escucharWidget() {
        let centro = CFNotificationCenterGetDarwinNotifyCenter()
        let yo = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(centro, yo, { _, observador, _, _, _ in
            guard let observador else { return }
            let estado = Unmanaged<EstadoMac>.fromOpaque(observador).takeUnretainedValue()
            DispatchQueue.main.async { MainActor.assumeIsolated { estado.procesarToques() } }
        }, Compartido.avisoToque as CFString, nil, .deliverImmediately)
    }

    /// Marca los toques encolados por el widget con las mismas `Marcas` de la barra. Sin estado (aún cargando), espera
    /// al próximo `sincronizar`.
    func procesarToques() {
        guard let e = estado else { return }
        for t in Compartido.tomarCola() {
            switch t.tipo {
            case .habito:
                if let h = e.habitos.first(where: { $0.id == t.id && $0.slot == t.detalle }) { marcarHabito(h) }
            case .paso:
                if let p = e.pasos.first(where: { $0.id == t.id }) { marcarPaso(p) }
            }
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
