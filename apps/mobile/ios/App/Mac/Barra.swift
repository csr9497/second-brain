import AppKit
import ServiceManagement
import SwiftUI

private enum Color2 {
    static let bueno = Color(red: 0x7B / 255, green: 0xC8 / 255, blue: 0x6C / 255)
    static let acento = Color(red: 0x7C / 255, green: 0x9C / 255, blue: 0xFF / 255)
    static let malo = Color(red: 0xE5 / 255, green: 0x67 / 255, blue: 0x5F / 255)
}

/// Ícono de la barra: el cerebro y el % del día (✓ si no queda nada pendiente).
struct EtiquetaBarra: View {
    let estado: EstadoMac

    var body: some View {
        if let e = estado.estado, e.caducado(en: Date()) {
            Image(systemName: "brain")
        } else if let e = estado.estado, !e.diaCompleto {
            Label("\(Int(e.pctDia.rounded())) %", systemImage: "brain")
                .labelStyle(.titleAndIcon)
        } else if estado.conSesion && estado.recibido {
            Label("✓", systemImage: "brain").labelStyle(.titleAndIcon)
        } else {
            Image(systemName: "brain")
        }
    }
}

/// Panel de la barra: franja y %, burbujas de hábitos, pasos de hoy y acciones.
struct PanelBarra: View {
    let estado: EstadoMac
    let web: Web
    @Environment(\.openWindow) private var abrir
    @State private var alIniciar = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            contenido
            Divider()
            pie
        }
        .padding(14)
        .frame(width: 320)
        .onAppear { web.refrescar() }
    }

    @ViewBuilder private var contenido: some View {
        if !estado.conSesion {
            Text("Inicia sesión en Second Brain").font(.headline)
            Button("Abrir Second Brain") { abrirVentana() }
        } else if let e = estado.estado, e.caducado(en: Date()) {
            // Empezó otra franja y la web aún no mandó sus hábitos (abrir el panel ya pidió Hoy)
            Text("Second Brain").font(.headline)
            Text("\(nombreFranja(e.franjaSiguiente)) · Actualizando…").font(.subheadline).foregroundStyle(.secondary)
        } else if let e = estado.estado, !e.diaCompleto {
            cabecera(e)
            if !e.franjaCompleta && !e.habitos.isEmpty {
                HStack(spacing: 10) {
                    ForEach(e.habitos, id: \.self) { h in BurbujaMac(habito: h) { estado.marcarHabito(h) } }
                }
            }
            if !e.pasos.isEmpty {
                VStack(spacing: 6) {
                    ForEach(e.pasos, id: \.self) { p in FilaPasoMac(paso: p) { estado.marcarPaso(p) } }
                }
            }
            let mas = e.totalPasos - e.pasos.count
            if mas > 0 {
                Button("\(mas) más en Hoy ›") { abrirVentana("ir:hoy") }
                    .buttonStyle(.link).foregroundStyle(Color2.acento)
            }
        } else if estado.recibido || estado.estado != nil {
            Label("Día completo", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(Color2.bueno)
        } else {
            Text("Cargando…").foregroundStyle(.secondary)
        }
    }

    private func cabecera(_ e: EstadoCard) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Second Brain").font(.headline)
                Text(e.franjaCompleta ? "\(nombreFranja(e.franja)) ✓" : nombreFranja(e.franja))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            AnilloMac(pct: e.pctDia)
        }
    }

    private var pie: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button("Abrir Second Brain") { abrirVentana() }
            Button("Actualizar") { web.refrescar() }
            Toggle("Abrir al iniciar sesión", isOn: $alIniciar)
                .toggleStyle(.checkbox)
                .onChange(of: alIniciar) { _, activo in
                    do {
                        if activo { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                    } catch {
                        print("[Mac] abrir al iniciar sesión: \(error)")
                        alIniciar = SMAppService.mainApp.status == .enabled
                    }
                }
            Button("Salir") { NSApp.terminate(nil) }
        }
        .buttonStyle(.plain)
    }

    private func abrirVentana(_ accion: String? = nil) {
        abrir(id: Delegado.ventana)
        NSApp.activate()
        if let accion { Task { await web.accion(accion) } }
    }
}

private func nombreFranja(_ f: String) -> String {
    switch f {
    case "manana": return "Mañana"
    case "tarde": return "Tarde"
    case "noche": return "Noche"
    default: return f.capitalized
    }
}

extension EstadoCard {
    /// Pasos del día en total: `masPasos` cuenta los que van más allá de los 2 visibles de la card.
    var totalPasos: Int { masPasos > 0 ? masPasos + 2 : pasos.count }
}

struct AnilloMac: View {
    let pct: Double
    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 4)
            Circle().trim(from: 0, to: max(0, min(1, pct / 100)))
                .stroke(Color2.bueno, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(pct.rounded()))%").font(.system(size: 11, weight: .semibold).monospacedDigit())
        }
        .frame(width: 40, height: 40)
    }
}

/// Burbuja de un hábito: borde con la inicial (pendiente), verde tenue (enviando), roja (fallo) o rellena (hecho).
struct BurbujaMac: View {
    let habito: EstadoCard.Habito
    let marcar: () -> Void

    private var color: Color {
        switch habito.marca {
        case .enviando: return Color2.bueno
        case .fallo: return Color2.malo
        case nil: return habito.hecho ? Color2.bueno : .secondary
        }
    }

    var body: some View {
        Button(action: marcar) {
            ZStack {
                Circle().fill(habito.hecho ? Color2.bueno : color.opacity(habito.marca == nil ? 0 : 0.22))
                Circle().strokeBorder(color, lineWidth: 2)
                if habito.hecho {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(.black.opacity(0.75))
                } else if habito.marca == .fallo {
                    Image(systemName: "exclamationmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(Color2.malo)
                } else {
                    Text(habito.inicial).font(.system(size: 15, weight: .semibold))
                }
            }
            .frame(width: 38, height: 38)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(habito.hecho || habito.marca == .enviando)
        .help(habito.marca == .fallo ? "No se pudo marcar \(habito.nombre). Reintentar" : habito.nombre)
        .accessibilityLabel("Marcar \(habito.nombre)")
    }
}

/// Fila de un paso (o una tarea sin pasos) con su ✓.
struct FilaPasoMac: View {
    let paso: EstadoCard.Paso
    let marcar: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(paso.marca == .fallo ? "No se pudo marcar" : paso.titulo)
                .foregroundStyle(paso.marca == .fallo ? Color2.malo : paso.marca == .enviando ? .secondary : .primary)
                .lineLimit(1).truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: marcar) {
                Image(systemName: paso.marca == .enviando ? "checkmark.circle.fill" : paso.marca == .fallo ? "exclamationmark.circle" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(paso.marca == .enviando ? Color2.bueno : paso.marca == .fallo ? Color2.malo : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(paso.marca == .enviando)
            .accessibilityLabel("Marcar \(paso.titulo) como hecho")
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }
}
