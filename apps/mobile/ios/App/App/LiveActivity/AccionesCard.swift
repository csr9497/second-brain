import ActivityKit
import Foundation

/// Lo que hacen los botones de la card (`MarcarHabitoIntent` / `MarcarPasoIntent`), en el proceso de la app:
/// escriben en Supabase y, solo si la escritura salió bien, actualizan la card al momento.
/// Al abrir la app, la web vuelve a sincronizar el estado real (`useLiveActivity`).
enum AccionesCard {
    /// Tras marcar un hábito, la burbuja se queda rellena este tiempo antes de desaparecer.
    static let pausaHecho: Duration = .seconds(3)

    static func marcarHabito(id: String, slot: String) async throws {
        do {
            try await SupabaseREST.marcarHabito(id: id, slot: slot)
        } catch {
            print("[LiveActivity] marcarHabito \(id) falló: \(error)")
            throw error
        }
        print("[LiveActivity] marcarHabito \(id) \(slot) ok")
        guard let actividad = Activity<SecondBrainAttributes>.activities.first else { return }

        var estado = actividad.content.state
        let esEste: (EstadoCard.Habito) -> Bool = { $0.id == id && $0.slot == slot }
        guard let i = estado.habitos.firstIndex(where: esEste), !estado.habitos[i].hecho else { return }
        estado.pctDia = pctTrasMarcar(estado)
        estado.habitos[i].hecho = true
        await actividad.update(ActivityContent(state: estado, staleDate: nil))

        try? await Task.sleep(for: pausaHecho)

        var despues = actividad.content.state
        despues.habitos.removeAll { esEste($0) && $0.hecho }
        if despues.habitos.isEmpty { despues.franjaCompleta = true }
        await aplicar(despues, en: actividad)
    }

    static func marcarPaso(id: String, tipo: String) async throws {
        do {
            try await SupabaseREST.marcarPaso(id: id, tipo: tipo)
        } catch {
            print("[LiveActivity] marcarPaso \(tipo) \(id) falló: \(error)")
            throw error
        }
        print("[LiveActivity] marcarPaso \(tipo) \(id) ok")
        guard let actividad = Activity<SecondBrainAttributes>.activities.first else { return }

        var estado = actividad.content.state
        let antes = estado.pasos.count
        estado.pasos.removeAll { $0.id == id }
        guard estado.pasos.count < antes else { return }
        // masPasos cuenta los que van más allá de los 2 visibles: con uno menos, sube el siguiente.
        estado.masPasos = max(0, estado.masPasos - 1)
        await aplicar(estado, en: actividad)
    }

    /// Actualiza la card o, si ya no queda nada pendiente, la termina con el estado «Día completo» (se quita a los 5 min).
    private static func aplicar(_ estado: EstadoCard, en actividad: Activity<SecondBrainAttributes>) async {
        var estado = estado
        estado.actualizado = ISO8601DateFormatter().string(from: Date())
        let contenido = ActivityContent(state: estado, staleDate: nil)
        if estado.habitos.isEmpty && estado.pasos.isEmpty && estado.masPasos == 0 {
            await actividad.end(contenido, dismissalPolicy: .after(Date().addingTimeInterval(5 * 60)))
            print("[LiveActivity] día completo: actividad terminada")
        } else {
            await actividad.update(contenido)
        }
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
