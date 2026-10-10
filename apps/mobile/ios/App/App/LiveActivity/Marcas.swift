import Foundation

/// Dónde vive el estado que pintan los botones: la Live Activity (iOS) o la barra de menús (Mac).
@MainActor
protocol DestinoEstado: AnyObject {
    /// Estado a editar; nil si no hay nada en pantalla.
    var estadoActual: EstadoCard? { get }
    /// Publica el estado editado. Debe dejar `estadoActual` al día antes de su primer `await`, para que dos toques
    /// seguidos partan cada uno del estado que dejó el otro.
    func publicar(_ estado: EstadoCard) async
}

/// Escrituras en Supabase de los botones (en la app, `SupabaseREST`).
protocol EscritorMarcas: Sendable {
    func marcarHabito(id: String, slot: String, fecha: String) async throws
    func marcarPaso(id: String, tipo: String) async throws
}

/// Lo que hace un botón ✓: lo marca `enviando` al momento (sin red), escribe en Supabase y, si salió bien, lo da por
/// hecho; si no, lo marca `fallo` un rato y lo deja como estaba. Lo comparten la card de iOS y la barra de la Mac.
@MainActor
final class Marcas {
    let destino: DestinoEstado
    let escritor: EscritorMarcas
    /// Tras marcar un hábito, la burbuja se queda rellena este tiempo antes de desaparecer.
    var pausaHecho: Duration
    /// Lo que se ve el aviso de fallo antes de que el botón vuelva a estar disponible.
    var pausaFallo: Duration
    /// Día de calendario del dispositivo, si el estado no trae `fecha`.
    var fechaLocal: () -> String

    init(destino: DestinoEstado, escritor: EscritorMarcas, pausaHecho: Duration = .seconds(1),
         pausaFallo: Duration = .seconds(2.5), fechaLocal: @escaping () -> String) {
        self.destino = destino
        self.escritor = escritor
        self.pausaHecho = pausaHecho
        self.pausaFallo = pausaFallo
        self.fechaLocal = fechaLocal
    }

    func marcarHabito(id: String, slot: String) async throws {
        let esEste: (EstadoCard.Habito) -> Bool = { $0.id == id && $0.slot == slot }
        var fecha: String?
        let tocado = await editar { estado in
            fecha = estado.fecha
            guard let i = estado.habitos.firstIndex(where: esEste),
                  !estado.habitos[i].hecho, estado.habitos[i].marca != .enviando else { return false }
            estado.habitos[i].marca = .enviando
            return true
        }
        guard tocado else { return }

        do {
            // El día del estado, no el del reloj: pasada la medianoche puede seguir siendo la noche de ayer (jornada).
            try await escritor.marcarHabito(id: id, slot: slot, fecha: fecha ?? fechaLocal())
        } catch {
            print("[Marcas] marcarHabito \(id) falló: \(error)")
            await mostrarFallo { estado, marca in
                if let i = estado.habitos.firstIndex(where: esEste) { estado.habitos[i].marca = marca }
            }
            throw error
        }

        await editar { estado in
            guard let i = estado.habitos.firstIndex(where: esEste) else { return false }
            estado.pctDia = Self.pctTrasMarcar(estado)
            estado.habitos[i].hecho = true
            estado.habitos[i].marca = nil
            return true
        }
        try? await Task.sleep(for: pausaHecho)
        await editar { estado in
            estado.habitos.removeAll { esEste($0) && $0.hecho }
            if estado.habitos.isEmpty { estado.franjaCompleta = true }
            return true
        }
    }

    func marcarPaso(id: String, tipo: String) async throws {
        let tocado = await editar { estado in
            guard let i = estado.pasos.firstIndex(where: { $0.id == id }), estado.pasos[i].marca != .enviando else { return false }
            estado.pasos[i].marca = .enviando
            return true
        }
        guard tocado else { return }

        do {
            try await escritor.marcarPaso(id: id, tipo: tipo)
        } catch {
            print("[Marcas] marcarPaso \(tipo) \(id) falló: \(error)")
            await mostrarFallo { estado, marca in
                if let i = estado.pasos.firstIndex(where: { $0.id == id }) { estado.pasos[i].marca = marca }
            }
            throw error
        }

        await editar { estado in
            let antes = estado.pasos.count
            estado.pasos.removeAll { $0.id == id }
            guard estado.pasos.count < antes else { return false }
            // masPasos cuenta los que van más allá de los 2 visibles: con uno menos, sube el siguiente.
            estado.masPasos = max(0, estado.masPasos - 1)
            return true
        }
    }

    /// Pone `fallo` en el botón, espera `pausaFallo` y lo devuelve a pendiente (si nadie lo cambió entretanto).
    private func mostrarFallo(_ poner: (inout EstadoCard, EstadoCard.Marca?) -> Void) async {
        await editar { estado in
            poner(&estado, .fallo)
            return true
        }
        try? await Task.sleep(for: pausaFallo)
        await editar { estado in
            poner(&estado, nil)
            return true
        }
    }

    /// Aplica `cambio` al estado actual y lo publica. `cambio` devuelve false si no hay nada que hacer.
    /// Leer y publicar ocurren sin `await` de por medio hasta `publicar` (MainActor), así que no se intercalan.
    @discardableResult
    private func editar(_ cambio: (inout EstadoCard) -> Bool) async -> Bool {
        guard var estado = destino.estadoActual, cambio(&estado) else { return false }
        estado.actualizado = ISO8601DateFormatter().string(from: Date())
        await destino.publicar(estado)
        return true
    }

    /// % del día aproximado tras marcar un turno. El estado no trae el total de turnos del día, así que se estima:
    /// lo que falta se reparte entre los pendientes de esta franja por las franjas que quedan (mañana 3, tarde 2, noche 1).
    /// Es exacto en la última franja; la web corrige el valor al sincronizar.
    nonisolated static func pctTrasMarcar(_ estado: EstadoCard) -> Double {
        let pendientes = estado.habitos.filter { !$0.hecho }.count
        let franjas: Int
        switch estado.franja {
        case "manana": franjas = 3
        case "tarde": franjas = 2
        default: franjas = 1
        }
        let falta = max(0, 100 - estado.pctDia)
        return min(100, estado.pctDia + falta / Double(max(1, pendientes * franjas)))
    }
}
