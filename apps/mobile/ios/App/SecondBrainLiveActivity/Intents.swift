import AppIntents
import Foundation

// Botones de la card. Este archivo se compila en los dos targets: la extensión los necesita para
// `Button(intent:)` y, como son `LiveActivityIntent` presentes también en la app, el sistema ejecuta
// `perform()` en el proceso de la app (la abre en segundo plano si hace falta). Por eso la escritura
// en Supabase (`AccionesCard`, Keychain incluido) solo existe en el target App; en la extensión
// (`WIDGET_EXTENSION`) `perform()` no hace nada y nunca toca el Keychain.

struct MarcarHabitoIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Marcar hábito"
    static let isDiscoverable = false

    @Parameter(title: "Hábito") var id: String
    /// manana | tarde | noche
    @Parameter(title: "Franja") var slot: String

    init() {}

    init(id: String, slot: String) {
        self.id = id
        self.slot = slot
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        try await AccionesCard.marcarHabito(id: id, slot: slot)
        #endif
        return .result()
    }
}

struct MarcarPasoIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Marcar paso"
    static let isDiscoverable = false

    @Parameter(title: "Paso o tarea") var id: String
    /// paso | tarea
    @Parameter(title: "Tipo") var tipo: String

    init() {}

    init(id: String, tipo: String) {
        self.id = id
        self.tipo = tipo
    }

    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        try await AccionesCard.marcarPaso(id: id, tipo: tipo)
        #endif
        return .result()
    }
}
