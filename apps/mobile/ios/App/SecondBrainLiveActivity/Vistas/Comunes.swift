import SwiftUI
import WidgetKit

/// Colores de la Variante A (project/VarA.dc.html).
enum Tema {
    static let fondo = Color(hex: 0x232221)
    static let fila = Color(hex: 0x2B2A28)
    static let glifo = Color(hex: 0x191817)
    static let texto = Color(hex: 0xF3F1EC)
    static let suave = Color(hex: 0xC9C5BD)
    static let tenue = Color(hex: 0xA8A39A)
    static let borde = Color(hex: 0x5A5753)
    static let pista = Color(hex: 0x3A3836)
    static let bueno = Color(hex: 0x7BC86C)
    static let tintaBueno = Color(hex: 0x11240D)
    static let acento = Color(hex: 0x7C9CFF)
    static let malo = Color(hex: 0xE5675F)
    static let enlaceHoy = URL(string: "secondbrain://hoy")!
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

extension EstadoCard {
    var nombreFranja: String {
        switch franja {
        case "manana": return "Mañana"
        case "tarde": return "Tarde"
        case "noche": return "Noche"
        default: return franja.capitalized
        }
    }

    /// Burbujas solo mientras la franja tiene hábitos pendientes.
    var mostrarBurbujas: Bool { !franjaCompleta && !habitos.isEmpty }

    /// Pasos del día en total: `masPasos` cuenta los que van más allá de los 2 visibles.
    var totalPasos: Int { masPasos > 0 ? masPasos + 2 : pasos.count }

    /// Hábitos sin marcar de la franja más los pasos del día (Dynamic Island compacta).
    var pendientes: Int { habitos.filter { !$0.hecho }.count + totalPasos }

    var pct: Int { Int(pctDia.rounded()) }
}

/// Glifo de la app: caja de 22 pt con el cerebro en el acento.
struct Glifo: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(Tema.glifo)
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Tema.pista, lineWidth: 1))
            .overlay(Image(systemName: "brain").font(.system(size: 12, weight: .semibold)).foregroundStyle(Tema.acento))
            .frame(width: 22, height: 22)
    }
}

/// Anillo del % del día.
struct Anillo: View {
    var pct: Double
    var tamano: CGFloat
    var grosor: CGFloat
    /// nil: sin texto dentro (isla compacta y mínima)
    var tamanoTexto: CGFloat?

    var body: some View {
        ZStack {
            Circle().stroke(Tema.pista, lineWidth: grosor)
            Circle()
                .trim(from: 0, to: max(0, min(1, pct / 100)))
                .stroke(Tema.bueno, style: StrokeStyle(lineWidth: grosor, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if let tamanoTexto {
                Text("\(Int(pct.rounded()))%")
                    .font(.system(size: tamanoTexto, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Tema.texto)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
        }
        .padding(grosor / 2)
        .frame(width: tamano, height: tamano)
    }
}

/// Círculo verde con ✓ (hábito hecho, franja completa).
struct CheckRelleno: View {
    var tamano: CGFloat
    var body: some View {
        Circle()
            .fill(Tema.bueno)
            .overlay(Image(systemName: "checkmark").font(.system(size: tamano * 0.46, weight: .heavy)).foregroundStyle(Tema.tintaBueno))
            .frame(width: tamano, height: tamano)
    }
}

/// Círculo con borde de un botón de la card según su `marca`: gris (pendiente), verde con relleno tenue
/// (enviando: el toque se registró y la escritura está en curso) o rojo (la escritura falló).
struct CirculoMarca<Contenido: View>: View {
    var marca: EstadoCard.Marca?
    var tamano: CGFloat
    @ViewBuilder var contenido: Contenido

    private var color: Color {
        switch marca {
        case .enviando: return Tema.bueno
        case .fallo: return Tema.malo
        case nil: return Tema.borde
        }
    }

    var body: some View {
        Circle()
            .fill(color.opacity(marca == nil ? 0 : 0.22))
            .overlay(Circle().strokeBorder(color, lineWidth: 2))
            .overlay(contenido)
            .frame(width: tamano, height: tamano)
            .contentShape(Circle())
    }
}

/// Burbuja de un hábito: pendiente (borde con la inicial, botón que lo marca), enviando, fallo o hecho (relleno con ✓).
struct Burbuja: View {
    var habito: EstadoCard.Habito
    var tamano: CGFloat
    var conNombre: Bool

    var body: some View {
        VStack(spacing: 4) {
            if habito.hecho {
                CheckRelleno(tamano: tamano)
            } else if habito.marca == .enviando {
                // Sin botón mientras se envía: un segundo toque no repite la escritura.
                CirculoMarca(marca: .enviando, tamano: tamano) {
                    Text(habito.inicial).font(.system(size: tamano * 0.36, weight: .semibold)).foregroundStyle(Tema.bueno)
                }
                .accessibilityLabel("Marcando \(habito.nombre)")
            } else {
                Button(intent: MarcarHabitoIntent(id: habito.id, slot: habito.slot)) {
                    CirculoMarca(marca: habito.marca, tamano: tamano) {
                        if habito.marca == .fallo {
                            Image(systemName: "exclamationmark").font(.system(size: tamano * 0.36, weight: .heavy)).foregroundStyle(Tema.malo)
                        } else {
                            Text(habito.inicial).font(.system(size: tamano * 0.36, weight: .semibold)).foregroundStyle(Tema.tenue)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(habito.marca == .fallo ? "No se pudo marcar \(habito.nombre). Reintentar" : "Marcar \(habito.nombre)")
            }
            if conNombre {
                Text(habito.marca == .fallo ? "Sin conexión" : habito.nombre)
                    .font(.system(size: 12))
                    .foregroundStyle(habito.marca == .fallo ? Tema.malo : habito.hecho ? Tema.suave : Tema.tenue)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: tamano + 6)
            }
        }
        .frame(width: tamano + 6)
    }
}

struct FilaBurbujas: View {
    var habitos: [EstadoCard.Habito]
    var tamano: CGFloat
    var conNombre: Bool

    var body: some View {
        HStack(alignment: .top, spacing: conNombre ? 12 : 10) {
            ForEach(habitos, id: \.self) { h in
                Burbuja(habito: h, tamano: tamano, conNombre: conNombre)
            }
        }
    }
}

/// Fila de un paso con su botón ✓ circular. `extra` > 0 añade «+N ›» (enlace a Hoy) antes del botón.
struct FilaPaso: View {
    var paso: EstadoCard.Paso
    var extra: Int = 0
    var alto: CGFloat = 38

    var body: some View {
        HStack(spacing: 8) {
            Text(paso.marca == .fallo ? "No se pudo marcar" : paso.titulo)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(paso.marca == .fallo ? Tema.malo : paso.marca == .enviando ? Tema.tenue : Tema.texto)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            if extra > 0 {
                Link(destination: Tema.enlaceHoy) {
                    Text("+\(extra) ›")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Tema.acento)
                }
            }
            if paso.marca == .enviando {
                CirculoMarca(marca: .enviando, tamano: alto - 4) {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Tema.bueno)
                }
                .accessibilityLabel("Marcando \(paso.titulo)")
            } else {
                Button(intent: MarcarPasoIntent(id: paso.id, tipo: paso.tipo)) {
                    CirculoMarca(marca: paso.marca, tamano: alto - 4) {
                        Image(systemName: paso.marca == .fallo ? "exclamationmark" : "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(paso.marca == .fallo ? Tema.malo : Tema.texto)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(paso.marca == .fallo ? "No se pudo marcar \(paso.titulo). Reintentar" : "Marcar \(paso.titulo) como hecho")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 2)
        .frame(height: alto)
        .background(Tema.fila, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
