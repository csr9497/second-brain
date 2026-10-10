import XCTest

final class CompartidoTests: XCTestCase {
    override func setUpWithError() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        Compartido.carpetaDePrueba = dir
    }

    override func tearDown() {
        if let dir = Compartido.carpetaDePrueba { try? FileManager.default.removeItem(at: dir) }
        Compartido.carpetaDePrueba = nil
    }

    func testInstantaneaIdaYVuelta() {
        XCTAssertNil(Compartido.leer())
        let i = Compartido.Instantanea(estado: nil, conSesion: true, recibido: false, escrita: Date(timeIntervalSince1970: 0))
        Compartido.guardar(i)
        XCTAssertEqual(Compartido.leer(), i)
    }

    func testColaSinRepetidosYSeVacia() {
        let a = Compartido.Toque(tipo: .habito, id: "h1", detalle: "tarde")
        let b = Compartido.Toque(tipo: .paso, id: "s1", detalle: "paso")
        Compartido.encolar(a)
        Compartido.encolar(a)
        Compartido.encolar(b)
        XCTAssertEqual(Compartido.tomarCola(), [a, b])
        XCTAssertEqual(Compartido.tomarCola(), [])
    }
}

final class FranjaVigenteTests: XCTestCase {
    func estado(_ franja: String, proxima: String?) -> EstadoCard {
        EstadoCard(fecha: "2026-10-10", franja: franja, franjaCompleta: false, pctDia: 40,
                   habitos: [], pasos: [], masPasos: 0, actualizado: "", proximaFranja: proxima)
    }
    let frontera = "2026-10-10T17:00:00.000Z"
    var fechaFrontera: Date { Compartido.fechaISO(frontera)! }

    func testAntesDeLaFronteraEstaVigente() {
        XCTAssertFalse(estado("manana", proxima: frontera).caducado(en: fechaFrontera.addingTimeInterval(-1)))
    }

    func testDesdeLaFronteraCaduca() {
        XCTAssertTrue(estado("manana", proxima: frontera).caducado(en: fechaFrontera))
        XCTAssertTrue(estado("manana", proxima: frontera).caducado(en: fechaFrontera.addingTimeInterval(3600)))
    }

    func testSinProximaFranjaNoCaduca() {
        XCTAssertFalse(estado("manana", proxima: nil).caducado(en: .distantFuture))
    }

    func testFranjaSiguienteYCambioDeDia() {
        XCTAssertEqual(estado("manana", proxima: nil).franjaSiguiente, "tarde")
        XCTAssertEqual(estado("tarde", proxima: nil).franjaSiguiente, "noche")
        XCTAssertEqual(estado("noche", proxima: nil).franjaSiguiente, "manana")
        XCTAssertFalse(estado("tarde", proxima: nil).siguienteEsOtroDia)
        XCTAssertTrue(estado("noche", proxima: nil).siguienteEsOtroDia)
    }

    func testFechaISOConYSinFraccion() {
        XCTAssertNotNil(Compartido.fechaISO("2026-10-10T17:00:00.000Z"))
        XCTAssertNotNil(Compartido.fechaISO("2026-10-10T17:00:00Z"))
        XCTAssertNil(Compartido.fechaISO("mañana"))
    }
}
