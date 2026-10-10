import AppKit
import Foundation
import Observation
import UserNotifications
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
    /// El día completo (semanales, las tres franjas, todos los pasos, racha): solo en la Mac.
    private(set) var extra: ExtraMac?
    /// Lo que se muestra salió de la última instantánea guardada, no de la web (arranque sin conexión): cuándo era.
    private(set) var guardadoEn: Date?
    /// Permiso de notificaciones en macOS (lo muestra la barra si están desactivadas).
    private(set) var avisosDenegados = false
    /// Semanales tocados en la barra cuya escritura está en curso.
    private(set) var enviandoSemanal: Set<String> = []

    /// Pide a la web que vuelva a cargar Hoy (`Web.refrescar`); lo pone la app al arrancar.
    @ObservationIgnored var refrescar: () -> Void = {}
    @ObservationIgnored private var temporizador: Timer?
    @ObservationIgnored private var despertar: NSObjectProtocol?
    /// Sin `proximaFranja` (nada pendiente, sin sesión), se vuelve a pedir cada 15 min.
    static let respaldo: TimeInterval = 15 * 60

    @ObservationIgnored lazy var marcas = Marcas(destino: self, escritor: EscritorREST(), fechaLocal: { SupabaseREST.fechaLocal() })

    init() {
        escucharWidget()
        // Sin conexión al arrancar, la barra y el widget muestran lo último que se guardó (si es de esta sesión y de hoy;
        // si cambió la franja, `caducado` lo oculta). Con sesión nueva, la web lo reemplaza enseguida.
        if conSesion, let i = Compartido.leer(), i.conSesion, Date().timeIntervalSince(i.escrita) < 18 * 3600 {
            estado = i.estado
            extra = i.extra
            guardadoEn = i.escrita
        }
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

    func sincronizar(_ estado: EstadoCard?, extra: ExtraMac?) {
        self.estado = estado
        if let extra { self.extra = extra }
        recibido = true
        guardadoEn = nil
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
        extra = nil
        guardadoEn = nil
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

    /// Semanal: se marca como mucho una vez al día, en la franja actual (como `toggleHabit` en la web).
    func marcarSemanal(_ h: ExtraMac.Semanal) {
        guard let x = extra, !h.hoy, !enviandoSemanal.contains(h.id) else { return }
        enviandoSemanal.insert(h.id)
        Task {
            do {
                try await SupabaseREST.marcarHabito(id: h.id, slot: x.franjaActual, fecha: x.fecha)
                if var y = extra, let i = y.semanales.firstIndex(where: { $0.id == h.id }) {
                    y.semanales[i].hoy = true
                    y.semanales[i].hechas += 1
                    extra = y
                    compartir()
                }
            } catch {
                print("[Mac] marcar semanal \(h.nombre) falló: \(error)")
            }
            enviandoSemanal.remove(h.id)
            refrescar()
        }
    }

    /// Un hábito o paso que no está en el estado de la card (otra franja, más allá de los 5 pasos): se escribe directo.
    private func marcarDirecto(_ t: Compartido.Toque) {
        guard let x = extra else { return }
        Task {
            do {
                switch t.tipo {
                case .habito, .semanal: try await SupabaseREST.marcarHabito(id: t.id, slot: t.detalle.isEmpty ? x.franjaActual : t.detalle, fecha: x.fecha)
                case .paso: try await SupabaseREST.marcarPaso(id: t.id, tipo: t.detalle)
                }
            } catch {
                print("[Mac] marcar \(t.tipo) \(t.id) falló: \(error)")
            }
            refrescar()
        }
    }

    // MARK: Avisos

    func actualizarPermiso() {
        Task {
            let ajustes = await UNUserNotificationCenter.current().notificationSettings()
            avisosDenegados = ajustes.authorizationStatus == .denied
        }
    }

    // MARK: Widgets (Compartido)

    /// Guarda lo que pinta la barra en el App Group y recarga los widgets.
    private func compartir() {
        Compartido.guardar(Compartido.Instantanea(estado: estado, conSesion: conSesion, recibido: recibido || guardadoEn != nil,
                                                  escrita: guardadoEn ?? Date(), extra: extra))
        WidgetCenter.shared.reloadAllTimelines()
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
        guard estado != nil || extra != nil else { return }
        for t in Compartido.tomarCola() {
            switch t.tipo {
            case .habito:
                if let h = estado?.habitos.first(where: { $0.id == t.id && $0.slot == t.detalle }) { marcarHabito(h) } else { marcarDirecto(t) }
            case .paso:
                if let p = estado?.pasos.first(where: { $0.id == t.id }) { marcarPaso(p) } else { marcarDirecto(t) }
            case .semanal:
                if let h = extra?.semanales.first(where: { $0.id == t.id }) { marcarSemanal(h) }
            }
        }
    }

    /// Vuelve a pedir Hoy en el próximo cambio de franja (+5 s de margen) o, sin él, en `respaldo`.
    private func programar(_ proximaFranja: String?) {
        temporizador?.invalidate()
        let cuando = proximaFranja.flatMap(FechaISO.leer).map { $0.addingTimeInterval(5) }
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
