import AppIntents
import AppKit
import SwiftUI
import WidgetKit

/// Widgets de la app de Mac: lo de hoy, con lo que la app guardó en el App Group (`Compartido`).
@main
struct SecondBrainMacWidgets: WidgetBundle {
    var body: some Widget {
        WidgetHoy()
        WidgetRacha()
    }
}

// MARK: - Configuración

/// Qué muestra el widget «Hoy» (clic derecho → «Editar widget»).
enum Contenido: String, AppEnum {
    case todo, habitos, pasos

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Contenido"
    static let caseDisplayRepresentations: [Contenido: DisplayRepresentation] = [
        .todo: "Hábitos y pasos",
        .habitos: "Solo hábitos",
        .pasos: "Solo pasos",
    ]

    var habitos: Bool { self != .pasos }
    var pasos: Bool { self != .habitos }
}

struct ConfigHoy: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Hoy"
    static let description = IntentDescription("Qué mostrar del día.")

    @Parameter(title: "Mostrar", default: .todo) var contenido: Contenido
}

struct WidgetHoy: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Compartido.tipoWidget, intent: ConfigHoy.self, provider: Proveedor()) { entrada in
            VistaHoy(entrada: entrada)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Hoy")
        .description("Hábitos de la franja y pasos de hoy, para marcarlos sin abrir la app.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct WidgetRacha: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SecondBrainRacha", provider: ProveedorRacha()) { entrada in
            VistaRacha(entrada: entrada)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Racha")
        .description("Días seguidos con todos los hábitos, el % de hoy y tus metas de la semana.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Línea de tiempo

struct Entrada: TimelineEntry {
    var date: Date
    var instantanea: Compartido.Instantanea?
    var contenido: Contenido = .todo

    var estado: EstadoCard? { instantanea?.estado }
    var extra: ExtraMac? { instantanea?.extra }
    /// Ya empezó otra franja y la app aún no trajo la nueva.
    var caducado: Bool { estado?.caducado(en: date) ?? false }

    /// Toque del widget que la app todavía no escribió (deja de mostrarse pasados `Compartido.esperaToque` s).
    func enviando(_ id: String) -> Bool {
        guard let i = instantanea, let desde = i.enviandoDesde, date < desde.addingTimeInterval(Compartido.esperaToque) else { return false }
        return (i.enviando ?? []).contains(id)
    }
}

/// Entradas: ahora; al vencer una marca «enviando» (si la app no respondió); y en el próximo cambio de franja, desde
/// donde no se muestran los hábitos de la franja anterior aunque la app no haya recargado el widget.
private func lineaDeTiempo(_ i: Compartido.Instantanea?, contenido: Contenido = .todo) -> Timeline<Entrada> {
    let ahora = Date()
    var fechas = [ahora]
    if let desde = i?.enviandoDesde, desde.addingTimeInterval(Compartido.esperaToque) > ahora {
        fechas.append(desde.addingTimeInterval(Compartido.esperaToque))
    }
    var politica: TimelineReloadPolicy = .never
    if let vence = i?.estado?.vence, vence > ahora {
        fechas.append(vence)
        // Un minuto después vuelve a leer la instantánea, por si la app ya trajo la franja nueva
        politica = .after(vence.addingTimeInterval(60))
    }
    return Timeline(entries: fechas.sorted().map { Entrada(date: $0, instantanea: i, contenido: contenido) }, policy: politica)
}

struct Proveedor: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, instantanea: Ejemplo.instantanea) }

    func snapshot(for config: ConfigHoy, in context: Context) async -> Entrada {
        Entrada(date: .now, instantanea: context.isPreview ? (Compartido.leer() ?? Ejemplo.instantanea) : Compartido.leer(), contenido: config.contenido)
    }

    func timeline(for config: ConfigHoy, in context: Context) async -> Timeline<Entrada> {
        lineaDeTiempo(Compartido.leer(), contenido: config.contenido)
    }
}

struct ProveedorRacha: TimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, instantanea: Ejemplo.instantanea) }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: .now, instantanea: context.isPreview ? (Compartido.leer() ?? Ejemplo.instantanea) : Compartido.leer()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        completion(lineaDeTiempo(Compartido.leer()))
    }
}

/// Para la galería de widgets antes de tener datos.
enum Ejemplo {
    static let estado = EstadoCard(
        fecha: nil, franja: "tarde", franjaCompleta: false, pctDia: 40,
        habitos: [.init(id: "1", nombre: "Leer", inicial: "L", slot: "tarde", turno: ["tarde"], hecho: false, marca: nil),
                  .init(id: "2", nombre: "Ejercicio", inicial: "E", slot: "tarde", turno: ["tarde"], hecho: false, marca: nil)],
        pasos: [.init(id: "3", titulo: "Escribir el resumen", tipo: "paso", marca: nil)],
        masPasos: 0, actualizado: "", proximaFranja: nil)
    static let extra = ExtraMac(
        fecha: "", franjaActual: "tarde", pctDia: 40, racha: 5,
        franjas: ["manana": [.init(id: "0", nombre: "Agua", inicial: "A", slot: "manana", hecho: true)],
                  "tarde": [.init(id: "1", nombre: "Leer", inicial: "L", slot: "tarde", hecho: false),
                            .init(id: "2", nombre: "Ejercicio", inicial: "E", slot: "tarde", hecho: false)],
                  "noche": [.init(id: "4", nombre: "Planear", inicial: "P", slot: "noche", hecho: false)]],
        semanales: [.init(id: "5", nombre: "Correr", inicial: "C", meta: 3, hechas: 1, hoy: false)],
        pasos: [.init(id: "3", titulo: "Escribir el resumen", tipo: "paso", proyecto: "Tesis")],
        totalPasos: 1)
    static let instantanea = Compartido.Instantanea(estado: estado, conSesion: true, recibido: true, escrita: .now, extra: extra)
}

// MARK: - Botones

/// ✓ del widget. Corre en la extensión, que no tiene la sesión: anota el toque como «enviando» en la instantánea (el
/// widget lo muestra al recargarse), lo encola y avisa a la app, que lo escribe y vuelve a recargar el widget. Si la
/// app está cerrada, la abre en segundo plano; si no responde, la marca se quita sola (`Compartido.esperaToque`).
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
        if var i = Compartido.leer() {
            let vigente = i.enviandoDesde.map { Date() < $0.addingTimeInterval(Compartido.esperaToque) } ?? false
            i.enviando = (vigente ? (i.enviando ?? []) : []) + [id]
            i.enviandoDesde = Date()
            Compartido.guardar(i)
        }
        Compartido.encolar(Compartido.Toque(tipo: t, id: id, detalle: detalle))
        Self.abrirAppSiHaceFalta()
        return .result()
    }

    /// La app es la que escribe: si no está corriendo, se abre sin ventana (`--fondo`) y procesa la cola al arrancar.
    static func abrirAppSiHaceFalta() {
        // …/Second Brain.app/Contents/PlugIns/SecondBrainMacWidget.appex → …/Second Brain.app
        let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        guard let id = Bundle(url: app)?.bundleIdentifier,
              NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty else { return }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = false
        config.addsToRecentItems = false
        config.arguments = ["--fondo"]
        NSWorkspace.shared.openApplication(at: app, configuration: config) { _, error in
            if let error { print("[Widget] no se pudo abrir la app: \(error)") }
        }
    }
}

// MARK: - Piezas comunes

enum Colores {
    static let bueno = Color(red: 0x7B / 255, green: 0xC8 / 255, blue: 0x6C / 255)
    static let malo = Color(red: 0xE5 / 255, green: 0x67 / 255, blue: 0x5F / 255)
    static let fuego = Color(red: 0xF0 / 255, green: 0x8A / 255, blue: 0x3C / 255)
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

private struct Seccion: View {
    var titulo: String
    var body: some View {
        Text(titulo.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.6).foregroundStyle(.tertiary)
    }
}

/// Burbuja de un hábito: pendiente (botón que lo marca), enviando, fallo o hecho (rellena con ✓). El nombre debajo,
/// porque las iniciales se repiten (Ejercicio y Estiramiento).
private struct Burbuja: View {
    var nombre: String
    var inicial: String
    var hecho: Bool
    var enviando: Bool
    var fallo: Bool = false
    var toque: Compartido.Toque
    var tamano: CGFloat = 30
    var conNombre = true
    /// Semanal: anillo de progreso hacia la meta.
    var progreso: Double?

    var body: some View {
        Button(intent: MarcarDesdeWidget(toque)) {
            VStack(spacing: 3) {
                ZStack {
                    Circle().fill(hecho ? Colores.bueno : enviando ? Colores.bueno.opacity(0.25) : .clear)
                    Circle().strokeBorder(hecho || enviando ? Colores.bueno : fallo ? Colores.malo : .secondary, lineWidth: 2)
                    if let progreso, !hecho {
                        Circle().trim(from: 0, to: max(0, min(1, progreso)))
                            .stroke(Colores.bueno, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                    if hecho {
                        Image(systemName: "checkmark").font(.system(size: tamano * 0.4, weight: .heavy)).foregroundStyle(.black.opacity(0.7))
                    } else {
                        Text(inicial).font(.system(size: tamano * 0.43, weight: .semibold))
                    }
                }
                .frame(width: tamano, height: tamano)
                if conNombre {
                    Text(nombre).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(hecho || enviando)
        .accessibilityLabel(hecho ? "\(nombre), hecho" : "Marcar \(nombre)")
    }
}

private struct FilaPaso: View {
    var titulo: String
    var proyecto: String?
    var enviando: Bool
    var fallo: Bool = false
    var toque: Compartido.Toque

    var body: some View {
        HStack(spacing: 6) {
            Button(intent: MarcarDesdeWidget(toque)) {
                Image(systemName: enviando ? "checkmark.circle.fill" : fallo ? "exclamationmark.circle" : "circle")
                    .foregroundStyle(enviando ? Colores.bueno : fallo ? Colores.malo : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(enviando)
            Text(titulo).font(.caption).lineLimit(1).truncationMode(.tail)
                .foregroundStyle(enviando ? .secondary : .primary)
            if let proyecto {
                Text(proyecto).font(.system(size: 9)).foregroundStyle(.tertiary).lineLimit(1)
            }
        }
        .accessibilityLabel("Marcar \(titulo) como hecho")
    }
}

private func pendientes(_ e: EstadoCard) -> Int {
    e.habitos.filter { !$0.hecho }.count + (e.masPasos > 0 ? e.masPasos + 2 : e.pasos.count)
}

// MARK: - Hoy

struct VistaHoy: View {
    var entrada: Entrada
    @Environment(\.widgetFamily) private var familia

    var body: some View {
        if let i = entrada.instantanea, i.conSesion {
            if let e = entrada.estado, entrada.caducado {
                Caducado(e: e, entrada: entrada, conPasos: familia != .systemSmall)
            } else if familia == .systemLarge, let x = entrada.extra {
                Grande(entrada: entrada, x: x)
            } else if let e = entrada.estado, !e.diaCompleto {
                switch familia {
                case .systemSmall: Pequeno(entrada: entrada, e: e)
                default: Mediano(entrada: entrada, e: e)
                }
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

/// Ya empezó la franja siguiente y la app aún no trajo sus hábitos: la franja nueva sin los hábitos de la anterior.
/// Los pasos siguen valiendo si es el mismo día (no tras la noche).
private struct Caducado: View {
    var e: EstadoCard
    var entrada: Entrada
    var conPasos: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Cabecera(titulo: nombreFranja(e.franjaSiguiente))
            Text("Actualizando…").font(.callout.weight(.medium)).foregroundStyle(.secondary)
            if conPasos && !e.siguienteEsOtroDia && entrada.contenido.pasos {
                ForEach(e.pasos.prefix(3), id: \.self) { p in
                    FilaPaso(titulo: p.titulo, enviando: entrada.enviando(p.id), toque: .init(tipo: .paso, id: p.id, detalle: p.tipo))
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Pequeño: franja, % y lo siguiente que toca (un hábito de la franja o un paso), con el total de pendientes.
private struct Pequeno: View {
    var entrada: Entrada
    var e: EstadoCard

    private var siguiente: String? {
        let habito = entrada.contenido.habitos && !e.franjaCompleta ? e.habitos.first(where: { !$0.hecho })?.nombre : nil
        let paso = entrada.contenido.pasos ? e.pasos.first?.titulo : nil
        return habito ?? paso
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Cabecera(e: e)
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Anillo(pct: e.pctDia, tamano: 56)
                Spacer()
            }
            Spacer(minLength: 0)
            if let siguiente {
                Text("Sigue: \(siguiente)").font(.caption.weight(.medium)).lineLimit(1).truncationMode(.tail)
            }
            Text(pendientes(e) == 1 ? "1 pendiente" : "\(pendientes(e)) pendientes")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }
}

/// Mediano: a la izquierda la franja, el % y los pendientes; a la derecha los hábitos de la franja con su nombre y,
/// debajo, los pasos de hoy (según «Mostrar»). Las dos columnas ocupan todo el alto.
private struct Mediano: View {
    var entrada: Entrada
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
                if entrada.contenido.habitos {
                    Seccion(titulo: "Hábitos")
                    if e.franjaCompleta || e.habitos.isEmpty {
                        Label("Franja completa", systemImage: "checkmark.circle.fill")
                            .font(.caption.weight(.medium)).foregroundStyle(Colores.bueno)
                    } else {
                        HStack(alignment: .top, spacing: 6) {
                            ForEach(e.habitos.prefix(4), id: \.self) { h in
                                Burbuja(nombre: h.nombre, inicial: h.inicial, hecho: h.hecho,
                                        enviando: entrada.enviando(h.id) || h.marca == .enviando, fallo: h.marca == .fallo,
                                        toque: .init(tipo: .habito, id: h.id, detalle: h.slot))
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
                if entrada.contenido == .todo { Spacer(minLength: 4) }
                if entrada.contenido.pasos {
                    Seccion(titulo: "Pasos de hoy")
                    if e.pasos.isEmpty {
                        Text("Sin pasos para hoy").font(.caption).foregroundStyle(.secondary)
                    } else {
                        let max = entrada.contenido == .pasos ? 4 : 2
                        ForEach(e.pasos.prefix(max), id: \.self) { p in
                            FilaPaso(titulo: p.titulo, enviando: entrada.enviando(p.id) || p.marca == .enviando, fallo: p.marca == .fallo,
                                     toque: .init(tipo: .paso, id: p.id, detalle: p.tipo))
                        }
                        let mas = (e.masPasos > 0 ? e.masPasos + 2 : e.pasos.count) - min(max, e.pasos.count)
                        if mas > 0 { Text("+\(mas) más").font(.caption2).foregroundStyle(.secondary) }
                    }
                }
                if entrada.contenido != .todo { Spacer(minLength: 0) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// Grande: el día completo. Las tres franjas con sus hábitos (la actual resaltada), los semanales con su progreso y
/// hasta 5 pasos de hoy (8 con «Solo pasos») con su proyecto.
private struct Grande: View {
    var entrada: Entrada
    var x: ExtraMac

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Anillo(pct: x.pctDia, tamano: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Cabecera(titulo: "Hoy · \(nombreFranja(x.franjaActual))")
                    Text(x.racha > 0 ? "🔥 \(x.racha) día\(x.racha == 1 ? "" : "s") seguidos" : "Sin racha todavía")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            if entrada.contenido.habitos {
                ForEach(ExtraMac.ordenFranjas, id: \.self) { f in
                    let habitos = x.franjas[f] ?? []
                    if !habitos.isEmpty {
                        HStack(alignment: .center, spacing: 8) {
                            Text(nombreFranja(f)).font(.caption.weight(f == x.franjaActual ? .semibold : .regular))
                                .foregroundStyle(f == x.franjaActual ? .primary : .secondary)
                                .frame(width: 58, alignment: .leading)
                            ForEach(habitos.prefix(6), id: \.self) { h in
                                Burbuja(nombre: h.nombre, inicial: h.inicial, hecho: h.hecho, enviando: entrada.enviando(h.id),
                                        toque: .init(tipo: .habito, id: h.id, detalle: h.slot), tamano: 24, conNombre: false)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
                if !x.semanales.isEmpty {
                    HStack(alignment: .center, spacing: 8) {
                        Text("Semana").font(.caption).foregroundStyle(.secondary).frame(width: 58, alignment: .leading)
                        ForEach(x.semanales.prefix(6), id: \.self) { h in
                            Burbuja(nombre: h.nombre, inicial: h.inicial, hecho: h.hoy, enviando: entrada.enviando(h.id),
                                    toque: .init(tipo: .semanal, id: h.id, detalle: ""), tamano: 24, conNombre: false,
                                    progreso: Double(h.hechas) / Double(max(1, h.meta)))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            if entrada.contenido.pasos {
                Divider()
                Seccion(titulo: "Pasos de hoy")
                if x.pasos.isEmpty {
                    Text("Sin pasos para hoy").font(.caption).foregroundStyle(.secondary)
                } else {
                    let tope = entrada.contenido == .pasos ? 8 : 5
                    ForEach(x.pasos.prefix(tope), id: \.self) { p in
                        FilaPaso(titulo: p.titulo, proyecto: p.proyecto, enviando: entrada.enviando(p.id),
                                 toque: .init(tipo: .paso, id: p.id, detalle: p.tipo))
                    }
                    let mas = x.totalPasos - min(tope, x.pasos.count)
                    if mas > 0 { Text("+\(mas) más").font(.caption2).foregroundStyle(.secondary) }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Racha

struct VistaRacha: View {
    var entrada: Entrada

    var body: some View {
        if let i = entrada.instantanea, i.conSesion, let x = entrada.extra {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill").foregroundStyle(Colores.fuego)
                    Text("Racha").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(x.racha)").font(.system(size: 40, weight: .bold).monospacedDigit())
                    Text(x.racha == 1 ? "día" : "días").font(.callout).foregroundStyle(.secondary)
                }
                Text("Hoy \(Int(x.pctDia.rounded()))%" + (x.pctDia >= 100 ? " ✓" : ""))
                    .font(.caption).foregroundStyle(x.pctDia >= 100 ? Colores.bueno : .secondary)
                Spacer(minLength: 0)
                if !x.semanales.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(x.semanales.prefix(2), id: \.self) { h in
                            HStack(spacing: 4) {
                                Text(h.nombre).font(.system(size: 10)).lineLimit(1)
                                Spacer(minLength: 2)
                                ForEach(0..<min(h.meta, 7), id: \.self) { k in
                                    Circle().fill(k < h.hechas ? Colores.bueno : Color.secondary.opacity(0.3)).frame(width: 6, height: 6)
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Aviso(icono: "flame", texto: "Abre Second Brain", color: .secondary)
        }
    }
}
