import AppIntents
import SwiftUI
import WidgetKit

/// Widgets de la app de Mac: lo pendiente de hoy, con lo que la app guardó en el App Group (`Compartido`).
@main
struct SecondBrainMacWidgets: WidgetBundle {
    var body: some Widget {
        WidgetHoy()
    }
}

struct WidgetHoy: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Compartido.tipoWidget, provider: Proveedor()) { entrada in
            VistaWidget(entrada: entrada)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Hoy")
        .description("Hábitos de la franja y pasos de hoy, para marcarlos sin abrir la app.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct Entrada: TimelineEntry {
    var date: Date
    var instantanea: Compartido.Instantanea?
}

/// La app recarga el widget cada vez que cambia lo que pinta la barra; el widget no se programa solo.
struct Proveedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, instantanea: Self.ejemplo) }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: .now, instantanea: context.isPreview ? (Compartido.leer() ?? Self.ejemplo) : Compartido.leer()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        completion(Timeline(entries: [Entrada(date: .now, instantanea: Compartido.leer())], policy: .never))
    }

    /// Para la galería de widgets antes de tener datos.
    static let ejemplo = Compartido.Instantanea(
        estado: EstadoCard(
            fecha: nil, franja: "tarde", franjaCompleta: false, pctDia: 40,
            habitos: [.init(id: "1", nombre: "Leer", inicial: "L", slot: "tarde", turno: ["tarde"], hecho: false, marca: nil),
                      .init(id: "2", nombre: "Ejercicio", inicial: "E", slot: "tarde", turno: ["tarde"], hecho: false, marca: nil)],
            pasos: [.init(id: "3", titulo: "Escribir el resumen", tipo: "paso", marca: nil)],
            masPasos: 0, actualizado: "", proximaFranja: nil),
        conSesion: true, recibido: true, escrita: .now)
}

// MARK: - Botones

/// ✓ del widget. Corre en la extensión, que no tiene la sesión: marca «enviando» en la instantánea (el widget lo
/// muestra al recargarse), encola el toque y avisa a la app, que lo escribe con `Marcas` y vuelve a recargar el widget.
struct MarcarDesdeWidget: AppIntent {
    static let title: LocalizedStringResource = "Marcar en Second Brain"
    static let isDiscoverable = false

    @Parameter(title: "Tipo") var tipo: String
    @Parameter(title: "Id") var id: String
    @Parameter(title: "Detalle") var detalle: String

    init() {}

    init(_ toque: Compartido.Toque) {
        tipo = toque.tipo.rawValue
        id = toque.id
        detalle = toque.detalle
    }

    func perform() async throws -> some IntentResult {
        guard let t = Compartido.Toque.Tipo(rawValue: tipo) else { return .result() }
        if var i = Compartido.leer(), var e = i.estado {
            switch t {
            case .habito:
                if let k = e.habitos.firstIndex(where: { $0.id == id && $0.slot == detalle }) { e.habitos[k].marca = .enviando }
            case .paso:
                if let k = e.pasos.firstIndex(where: { $0.id == id }) { e.pasos[k].marca = .enviando }
            }
            i.estado = e
            Compartido.guardar(i)
        }
        Compartido.encolar(Compartido.Toque(tipo: t, id: id, detalle: detalle))
        return .result()
    }
}

// MARK: - Vistas

private enum Colores {
    static let bueno = Color(red: 0x7B / 255, green: 0xC8 / 255, blue: 0x6C / 255)
    static let malo = Color(red: 0xE5 / 255, green: 0x67 / 255, blue: 0x5F / 255)
}

private func nombreFranja(_ f: String) -> String {
    switch f {
    case "manana": return "Mañana"
    case "tarde": return "Tarde"
    case "noche": return "Noche"
    default: return f.capitalized
    }
}

struct VistaWidget: View {
    var entrada: Entrada
    @Environment(\.widgetFamily) private var familia

    var body: some View {
        if let i = entrada.instantanea, i.conSesion {
            if let e = i.estado, !e.diaCompleto {
                familia == .systemSmall ? AnyView(Pequeno(e: e)) : AnyView(Mediano(e: e))
            } else if i.recibido {
                Aviso(icono: "checkmark.circle.fill", texto: "Día completo", color: Colores.bueno)
            } else {
                Aviso(icono: "brain", texto: "Abre Second Brain", color: .secondary)
            }
        } else {
            Aviso(icono: "brain", texto: "Abre Second Brain e inicia sesión", color: .secondary)
        }
    }
}

private struct Aviso: View {
    var icono: String
    var texto: String
    var color: Color
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icono).font(.title2).foregroundStyle(color)
            Text(texto).font(.callout.weight(.medium)).multilineTextAlignment(.center)
        }
    }
}

private struct Cabecera: View {
    var e: EstadoCard
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "brain").foregroundStyle(.tint)
            Text(e.franjaCompleta ? "\(nombreFranja(e.franja)) ✓" : nombreFranja(e.franja))
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}

private struct Anillo: View {
    var pct: Double
    var tamano: CGFloat
    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: tamano / 10)
            Circle().trim(from: 0, to: max(0, min(1, pct / 100)))
                .stroke(Colores.bueno, style: StrokeStyle(lineWidth: tamano / 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(pct.rounded()))%").font(.system(size: tamano / 4, weight: .semibold).monospacedDigit())
        }
        .frame(width: tamano, height: tamano)
    }
}

/// Pequeño: franja, % del día y cuántos pendientes quedan (sin botones: tocarlo abre la app).
private struct Pequeno: View {
    var e: EstadoCard
    private var pendientes: Int {
        e.habitos.filter { !$0.hecho }.count + (e.masPasos > 0 ? e.masPasos + 2 : e.pasos.count)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Cabecera(e: e)
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Anillo(pct: e.pctDia, tamano: 64)
                Spacer()
            }
            Spacer(minLength: 0)
            Text(pendientes == 1 ? "1 pendiente" : "\(pendientes) pendientes")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// Mediano: % y franja a la izquierda; burbujas de hábitos y hasta 3 pasos con ✓ a la derecha.
private struct Mediano: View {
    var e: EstadoCard
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Cabecera(e: e)
                Anillo(pct: e.pctDia, tamano: 58)
            }
            VStack(alignment: .leading, spacing: 8) {
                if !e.franjaCompleta && !e.habitos.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(e.habitos.prefix(4), id: \.self) { h in Burbuja(h: h) }
                    }
                }
                ForEach(e.pasos.prefix(e.franjaCompleta || e.habitos.isEmpty ? 4 : 2), id: \.self) { p in FilaPaso(p: p) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct Burbuja: View {
    var h: EstadoCard.Habito
    var body: some View {
        Button(intent: MarcarDesdeWidget(.init(tipo: .habito, id: h.id, detalle: h.slot))) {
            ZStack {
                Circle().fill(h.marca == .enviando ? Colores.bueno.opacity(0.25) : .clear)
                Circle().strokeBorder(h.marca == .enviando ? Colores.bueno : h.marca == .fallo ? Colores.malo : .secondary, lineWidth: 2)
                Text(h.inicial).font(.system(size: 13, weight: .semibold))
            }
            .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .disabled(h.marca == .enviando)
        .accessibilityLabel("Marcar \(h.nombre)")
    }
}

private struct FilaPaso: View {
    var p: EstadoCard.Paso
    var body: some View {
        HStack(spacing: 6) {
            Button(intent: MarcarDesdeWidget(.init(tipo: .paso, id: p.id, detalle: p.tipo))) {
                Image(systemName: p.marca == .enviando ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(p.marca == .enviando ? Colores.bueno : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(p.marca == .enviando)
            Text(p.titulo).font(.caption).lineLimit(1).truncationMode(.tail)
                .foregroundStyle(p.marca == .enviando ? .secondary : .primary)
        }
        .accessibilityLabel("Marcar \(p.titulo) como hecho")
    }
}
