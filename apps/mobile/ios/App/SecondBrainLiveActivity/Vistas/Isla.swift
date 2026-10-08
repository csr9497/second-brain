import SwiftUI
import WidgetKit

/// Dynamic Island expandida, región izquierda: glifo y franja.
struct IslaCabecera: View {
    var estado: EstadoCard

    var body: some View {
        HStack(spacing: 6) {
            Glifo()
            Text(estado.diaCompleto ? "Día completo" : estado.nombreFranja)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Tema.texto)
                .lineLimit(1)
            if estado.franjaCompleta || estado.diaCompleto {
                CheckRelleno(tamano: 16)
            }
        }
        .padding(.leading, 4)
        .frame(maxHeight: .infinity, alignment: .center)
    }
}

/// Dynamic Island expandida, región inferior: las burbujas (sin nombres) y el primer paso.
struct IslaExpandida: View {
    var estado: EstadoCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if estado.mostrarBurbujas {
                FilaBurbujas(habitos: estado.habitos, tamano: 36, conNombre: false)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let paso = estado.pasos.first {
                FilaPaso(paso: paso, extra: estado.totalPasos - 1, alto: 36)
            } else if !estado.mostrarBurbujas {
                Text("Nada pendiente por hoy").font(.system(size: 14)).foregroundStyle(Tema.tenue)
            }
        }
        .padding(.horizontal, 4)
    }
}
