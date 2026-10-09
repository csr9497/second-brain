import ActivityKit
import Foundation

/// Lo que hacen los botones de la card (`MarcarHabitoIntent` / `MarcarPasoIntent`), en el proceso de la app:
/// 1. marca el botón como `enviando` al momento (sin red), para que el toque se note;
/// 2. escribe en Supabase;
/// 3. si salió bien, lo da por hecho; si no, lo marca `fallo` un rato y lo deja como estaba.
/// Al abrir la app, la web vuelve a sincronizar el estado real (`useLiveActivity`).
@MainActor
enum AccionesCard {
    /// Tras marcar un hábito, la burbuja se queda rellena este tiempo antes de desaparecer.
    static let pausaHecho: Duration = .seconds(1)
    /// Lo que se ve el aviso de fallo antes de que el botón vuelva a estar disponible.
    static let pausaFallo: Duration = .seconds(2.5)

    /// Último estado enviado a la card. Las ediciones parten de aquí y no de `actividad.content.state`, que se
    /// actualiza con retraso: así dos toques seguidos no se pisan. El plugin lo pone al sincronizar desde la web.
    static var ultimo: EstadoCard?

    static func marcarHabito(id: String, slot: String) async throws {
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
            // El día de la card, no el del reloj: pasada la medianoche puede seguir siendo la noche de ayer (jornada).
            try await SupabaseREST.marcarHabito(id: id, slot: slot, fecha: fecha ?? SupabaseREST.fechaLocal())
        } catch {
            print("[LiveActivity] marcarHabito \(id) falló: \(error)")
            await mostrarFallo { estado, marca in
                if let i = estado.habitos.firstIndex(where: esEste) { estado.habitos[i].marca = marca }
            }
            throw error
        }
        print("[LiveActivity] marcarHabito \(id) \(slot) ok")

        await editar { estado in
            guard let i = estado.habitos.firstIndex(where: esEste) else { return false }
            estado.pctDia = pctTrasMarcar(estado)
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

    static func marcarPaso(id: String, tipo: String) async throws {
        let tocado = await editar { estado in
            guard let i = estado.pasos.firstIndex(where: { $0.id == id }), estado.pasos[i].marca != .enviando else { return false }
            estado.pasos[i].marca = .enviando
            return true
        }
        guard tocado else { return }

        do {
            try await SupabaseREST.marcarPaso(id: id, tipo: tipo)
        } catch {
            print("[LiveActivity] marcarPaso \(tipo) \(id) falló: \(error)")
            await mostrarFallo { estado, marca in
                if let i = estado.pasos.firstIndex(where: { $0.id == id }) { estado.pasos[i].marca = marca }
            }
            throw error
        }
        print("[LiveActivity] marcarPaso \(tipo) \(id) ok")

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
    private static func mostrarFallo(_ poner: (inout EstadoCard, EstadoCard.Marca?) -> Void) async {
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

    /// Aplica `cambio` al último estado y lo manda a la card. `cambio` devuelve false si no hay nada que hacer.
    /// La lectura y la escritura de `ultimo` ocurren sin `await` de por medio (MainActor), así que no se intercalan.
    /// Si ya no queda nada pendiente, termina la actividad con el estado «Día completo» (se quita a los 5 min).
    @discardableResult
    private static func editar(_ cambio: (inout EstadoCard) -> Bool) async -> Bool {
        guard let actividad = Activity<SecondBrainAttributes>.activities.first else { return false }
        var estado = ultimo ?? actividad.content.state
        guard cambio(&estado) else { return false }
        estado.actualizado = ISO8601DateFormatter().string(from: Date())
        ultimo = estado
        let contenido = ActivityContent(state: estado, staleDate: nil)
        if estado.diaCompleto {
            ultimo = nil
            await actividad.end(contenido, dismissalPolicy: .after(Date().addingTimeInterval(5 * 60)))
            print("[LiveActivity] día completo: actividad terminada")
        } else {
            await actividad.update(contenido)
        }
        return true
    }

    /// % del día aproximado tras marcar un turno. El estado no trae el total de turnos del día, así que se estima:
    /// lo que falta se reparte entre los pendientes de esta franja por las franjas que quedan (mañana 3, tarde 2, noche 1).
    /// Es exacto en la última franja; la web corrige el valor al volver a la app.
    static func pctTrasMarcar(_ estado: EstadoCard) -> Double {
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
