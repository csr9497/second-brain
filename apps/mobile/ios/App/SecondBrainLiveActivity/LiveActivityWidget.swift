import ActivityKit
import SwiftUI
import WidgetKit

/// Extensión WidgetKit: dibuja la Live Activity (Variante A · Burbujas) en la pantalla de bloqueo y en la Dynamic Island.
@main
struct SecondBrainWidgets: WidgetBundle {
    var body: some Widget {
        LiveActivityWidget()
    }
}

struct LiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        // Pasado el cambio de franja (`staleDate` = proximaFranja) los hábitos son de la anterior: no se muestran
        ActivityConfiguration(for: SecondBrainAttributes.self) { contexto in
            VistaBloqueo(estado: contexto.isStale ? contexto.state.trasCaducar : contexto.state)
                .activityBackgroundTint(Tema.fondo)
                .activitySystemActionForegroundColor(Tema.texto)
                .widgetURL(Tema.enlaceHoy)
        } dynamicIsland: { contexto in
            let estado = contexto.isStale ? contexto.state.trasCaducar : contexto.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    IslaCabecera(estado: estado)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Anillo(pct: estado.pctDia, tamano: 40, grosor: 4.5, tamanoTexto: 11)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    IslaExpandida(estado: estado)
                }
            } compactLeading: {
                Anillo(pct: estado.pctDia, tamano: 22, grosor: 3.5, tamanoTexto: nil)
            } compactTrailing: {
                Text("\(estado.pendientes)")
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Tema.bueno)
            } minimal: {
                Anillo(pct: estado.pctDia, tamano: 22, grosor: 3.5, tamanoTexto: nil)
            }
            .widgetURL(Tema.enlaceHoy)
            .keylineTint(Tema.bueno)
        }
    }
}
