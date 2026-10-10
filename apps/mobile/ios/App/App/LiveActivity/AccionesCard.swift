import ActivityKit
import Foundation

/// La Live Activity como destino de las marcas. `ultimo` es el último estado enviado: las ediciones parten de aquí y
/// no de `actividad.content.state`, que se actualiza con retraso. El plugin lo pone al sincronizar desde la web.
@MainActor
final class DestinoLiveActivity: DestinoEstado {
    var ultimo: EstadoCard?

    var estadoActual: EstadoCard? {
        guard let actividad = Activity<SecondBrainAttributes>.activities.first else { return nil }
        return ultimo ?? actividad.content.state
    }

    /// Si ya no queda nada pendiente, termina la actividad con «Día completo» (se quita a los 5 min).
    func publicar(_ estado: EstadoCard) async {
        guard let actividad = Activity<SecondBrainAttributes>.activities.first else { return }
        ultimo = estado.diaCompleto ? nil : estado
        let contenido = ActivityContent(state: estado, staleDate: estado.vence)
        if estado.diaCompleto {
            await actividad.end(contenido, dismissalPolicy: .after(Date().addingTimeInterval(5 * 60)))
            print("[LiveActivity] día completo: actividad terminada")
        } else {
            await actividad.update(contenido)
        }
    }
}

/// Lo que hacen los botones de la card (`MarcarHabitoIntent` / `MarcarPasoIntent`), en el proceso de la app.
/// Al abrir la app, la web vuelve a sincronizar el estado real (`useLiveActivity`).
@MainActor
enum AccionesCard {
    static let destino = DestinoLiveActivity()
    static let marcas = Marcas(destino: destino, escritor: EscritorREST(), fechaLocal: { SupabaseREST.fechaLocal() })

    static func marcarHabito(id: String, slot: String) async throws {
        try await marcas.marcarHabito(id: id, slot: slot)
    }

    static func marcarPaso(id: String, tipo: String) async throws {
        try await marcas.marcarPaso(id: id, tipo: tipo)
    }
}
