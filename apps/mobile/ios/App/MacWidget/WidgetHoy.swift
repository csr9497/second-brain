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

/// La app recarga el widget cada vez que cambia lo que pinta la barra. Además, el widget programa una entrada en el
/// próximo cambio de franja: desde ahí no muestra los hábitos de la franja anterior (`caducado`) aunque la app no lo
/// haya recargado aún (cerrada, sin red, la Mac dormida).
struct Proveedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, instantanea: Self.ejemplo) }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: .now, instantanea: context.isPreview ? (Compartido.leer() ?? Self.ejemplo) : Compartido.leer()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        let ahora = Date()
        let i = Compartido.leer()
        var entradas = [Entrada(date: ahora, instantanea: i)]
        var politica: TimelineReloadPolicy = .never
        if let vence = i?.estado?.vence, vence > ahora {
            entradas.append(Entrada(date: vence, instantanea: i))
            // Un minuto después vuelve a leer la instantánea, por si la app ya trajo la franja nueva
            politica = .after(vence.addingTimeInterval(60))
        }
        completion(Timeline(entries: entradas, policy: politica))
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
            if let e = i.estado, e.caducado(en: entrada.date) {
                Caducado(e: e, conPasos: familia != .systemSmall)
            } else if let e = i.estado, !e.diaCompleto {
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
    var titulo: String
    init(e: EstadoCard) { titulo = e.franjaCompleta ? "\(nombreFranja(e.franja)) ✓" : nombreFranja(e.franja) }
    init(titulo: String) { self.titulo = titulo }
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "brain").foregroundStyle(.tint)
            Text(titulo).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}

/// Ya empezó la franja siguiente y la app aún no trajo sus hábitos: muestra la franja nueva sin los hábitos de la
/// anterior. Los pasos siguen valiendo si es el mismo día (no tras la noche).
private struct Caducado: View {
    var e: EstadoCard
    var conPasos: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Cabecera(titulo: nombreFranja(e.franjaSiguiente))
            Text("Actualizando…").font(.callout.weight(.medium)).foregroundStyle(.secondary)
            if conPasos && !e.siguienteEsOtroDia {
                ForEach(e.pasos.prefix(3), id: \.self) { p in FilaPaso(p: p) }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
            Text(pendientes(e) == 1 ? "1 pendiente" : "\(pendientes(e)) pendientes")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// Pendientes de la card: hábitos sin marcar de la franja + pasos del día (`masPasos` cuenta los que van tras los 2).
private func pendientes(_ e: EstadoCard) -> Int {
    e.habitos.filter { !$0.hecho }.count + (e.masPasos > 0 ? e.masPasos + 2 : e.pasos.count)
}

/// Mediano: a la izquierda la franja, el % y los pendientes (como el pequeño); a la derecha los hábitos de la franja
/// con su nombre y, debajo, los pasos de hoy. Las dos columnas ocupan todo el alto.
private struct Mediano: View {
    var e: EstadoCard
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Cabecera(e: e)
                Spacer(minLength: 6)
                Anillo(pct: e.pctDia, tamano: 62)
                Spacer(minLength: 6)
                Text(pendientes(e) == 1 ? "1 pendiente" : "\(pendientes(e)) pendientes")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .frame(width: 92, alignment: .leading)
            .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                Seccion(titulo: "Hábitos")
                if e.franjaCompleta || e.habitos.isEmpty {
                    Label("Franja completa", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.medium)).foregroundStyle(Colores.bueno)
                } else {
                    HStack(alignment: .top, spacing: 6) {
                        ForEach(e.habitos.prefix(4), id: \.self) { h in Burbuja(h: h).frame(maxWidth: .infinity) }
                    }
                }
                Spacer(minLength: 4)
                Seccion(titulo: "Pasos de hoy")
                if e.pasos.isEmpty {
                    Text("Sin pasos para hoy").font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(e.pasos.prefix(2), id: \.self) { p in FilaPaso(p: p) }
                    let mas = (e.masPasos > 0 ? e.masPasos + 2 : e.pasos.count) - min(2, e.pasos.count)
                    if mas > 0 { Text("+\(mas) más").font(.caption2).foregroundStyle(.secondary) }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

private struct Seccion: View {
    var titulo: String
    var body: some View {
        Text(titulo.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(.tertiary)
    }
}

/// Burbuja de un hábito con su nombre debajo (las iniciales solas se repiten: Ejercicio y Estiramiento).
private struct Burbuja: View {
    var h: EstadoCard.Habito
    var body: some View {
        Button(intent: MarcarDesdeWidget(.init(tipo: .habito, id: h.id, detalle: h.slot))) {
            VStack(spacing: 3) {
                ZStack {
                    Circle().fill(h.marca == .enviando ? Colores.bueno.opacity(0.25) : .clear)
                    Circle().strokeBorder(h.marca == .enviando ? Colores.bueno : h.marca == .fallo ? Colores.malo : .secondary, lineWidth: 2)
                    Text(h.inicial).font(.system(size: 13, weight: .semibold))
                }
                .frame(width: 30, height: 30)
                Text(h.nombre).font(.system(size: 10)).foregroundStyle(.secondary)
                    .lineLimit(1).truncationMode(.tail)
            }
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
