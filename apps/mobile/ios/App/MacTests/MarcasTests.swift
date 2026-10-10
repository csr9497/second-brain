import XCTest

@MainActor
final class DestinoFalso: DestinoEstado {
    var estadoActual: EstadoCard?
    var publicados: [EstadoCard] = []
    init(_ estado: EstadoCard?) { estadoActual = estado }
    func publicar(_ estado: EstadoCard) async {
        estadoActual = estado
        publicados.append(estado)
    }
}

actor EscritorFalso: EscritorMarcas {
    var falla = false
    var habitos: [(String, String, String)] = []
    var pasos: [(String, String)] = []
    func fallar() { falla = true }
    struct Error: Swift.Error {}
    func marcarHabito(id: String, slot: String, fecha: String) async throws {
        if falla { throw Error() }
        habitos.append((id, slot, fecha))
    }
    func marcarPaso(id: String, tipo: String) async throws {
        if falla { throw Error() }
        pasos.append((id, tipo))
    }
}

func estado(habitos: [String] = ["a", "b"], pasos: [String] = ["p1"], masPasos: Int = 0, fecha: String? = "2026-10-01") -> EstadoCard {
    EstadoCard(
        fecha: fecha, franja: "tarde", franjaCompleta: false, pctDia: 50,
        habitos: habitos.map { .init(id: $0, nombre: $0, inicial: $0, slot: "tarde", turno: ["tarde"], hecho: false, marca: nil) },
        pasos: pasos.map { .init(id: $0, titulo: $0, tipo: "paso", marca: nil) },
        masPasos: masPasos, actualizado: "", proximaFranja: nil)
}

@MainActor
final class MarcasTests: XCTestCase {
    func marcas(_ d: DestinoFalso, _ e: EscritorFalso) -> Marcas {
        Marcas(destino: d, escritor: e, pausaHecho: .zero, pausaFallo: .zero, fechaLocal: { "2026-10-02" })
    }

    func testHabitoEnviandoHechoYQuitado() async throws {
        let d = DestinoFalso(estado()), e = EscritorFalso()
        try await marcas(d, e).marcarHabito(id: "a", slot: "tarde")
        XCTAssertEqual(d.publicados.map { $0.habitos.first { $0.id == "a" }?.marca }, [.enviando, nil, nil])
        XCTAssertEqual(d.publicados[1].habitos.first { $0.id == "a" }?.hecho, true)
        XCTAssertEqual(d.estadoActual?.habitos.map(\.id), ["b"])
        let escritos = await e.habitos
        XCTAssertEqual(escritos.map(\.2), ["2026-10-01"]) // la fecha del estado, no la del reloj
    }

    func testUltimoHabitoCompletaLaFranja() async throws {
        let d = DestinoFalso(estado(habitos: ["a"])), e = EscritorFalso()
        try await marcas(d, e).marcarHabito(id: "a", slot: "tarde")
        XCTAssertEqual(d.estadoActual?.franjaCompleta, true)
    }

    func testSinFechaUsaLaLocal() async throws {
        let d = DestinoFalso(estado(fecha: nil)), e = EscritorFalso()
        try await marcas(d, e).marcarHabito(id: "a", slot: "tarde")
        let escritos = await e.habitos
        XCTAssertEqual(escritos.map(\.2), ["2026-10-02"])
    }

    func testFalloMarcaYVuelve() async {
        let d = DestinoFalso(estado()), e = EscritorFalso()
        await e.fallar()
        do {
            try await marcas(d, e).marcarPaso(id: "p1", tipo: "paso")
            XCTFail("debía fallar")
        } catch {}
        XCTAssertEqual(d.publicados.map { $0.pasos.first?.marca }, [.enviando, .fallo, nil])
        XCTAssertEqual(d.estadoActual?.pasos.map(\.id), ["p1"])
    }

    func testPasoQuitadoYMasPasos() async throws {
        let d = DestinoFalso(estado(pasos: ["p1", "p2"], masPasos: 3)), e = EscritorFalso()
        try await marcas(d, e).marcarPaso(id: "p1", tipo: "paso")
        XCTAssertEqual(d.estadoActual?.pasos.map(\.id), ["p2"])
        XCTAssertEqual(d.estadoActual?.masPasos, 2)
    }

    func testDosToquesSeguidosNoSePisan() async throws {
        let d = DestinoFalso(estado()), e = EscritorFalso()
        let m = marcas(d, e)
        async let uno: Void = m.marcarHabito(id: "a", slot: "tarde")
        async let dos: Void = m.marcarHabito(id: "b", slot: "tarde")
        _ = try await (uno, dos)
        XCTAssertEqual(d.estadoActual?.habitos, [])
        XCTAssertEqual(d.estadoActual?.franjaCompleta, true)
    }

    func testSegundoToqueMientrasEnviaNoRepite() async throws {
        var s = estado()
        s.habitos[0].marca = .enviando
        let d = DestinoFalso(s), e = EscritorFalso()
        try await marcas(d, e).marcarHabito(id: "a", slot: "tarde")
        XCTAssertTrue(d.publicados.isEmpty)
        let escritos = await e.habitos
        XCTAssertTrue(escritos.isEmpty)
    }

    func testSinEstadoNoHaceNada() async throws {
        let d = DestinoFalso(nil), e = EscritorFalso()
        try await marcas(d, e).marcarPaso(id: "p1", tipo: "paso")
        let escritos = await e.pasos
        XCTAssertTrue(escritos.isEmpty)
    }

    func testPctTrasMarcar() {
        var s = estado()
        XCTAssertEqual(Marcas.pctTrasMarcar(s), 62.5, accuracy: 0.001) // 50 + 50 / (2 pendientes × 2 franjas)
        s.franja = "noche"
        XCTAssertEqual(Marcas.pctTrasMarcar(s), 75, accuracy: 0.001)
    }
}
