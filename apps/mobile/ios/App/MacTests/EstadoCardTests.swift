import XCTest

final class EstadoCardTests: XCTestCase {
    func testDecodificaElEstadoDeLaWeb() throws {
        let json = """
        {"fecha":"2026-10-01","franja":"tarde","franjaCompleta":false,"pctDia":40,
         "habitos":[{"id":"h1","nombre":"Leer","inicial":"L","slot":"tarde","turno":["tarde","noche"],"hecho":false}],
         "pasos":[{"id":"s1","titulo":"Escribir","tipo":"paso"}],"masPasos":0,
         "actualizado":"2026-10-01T20:00:00.000Z","proximaFranja":"2026-10-02T00:00:00.000Z"}
        """
        let e = try JSONDecoder().decode(EstadoCard.self, from: Data(json.utf8))
        XCTAssertEqual(e.habitos.first?.turno, ["tarde", "noche"])
        XCTAssertNil(e.habitos.first?.marca)
        XCTAssertEqual(e.proximaFranja, "2026-10-02T00:00:00.000Z")
        XCTAssertFalse(e.diaCompleto)
    }

    func testSinProximaFranjaNiFecha() throws {
        let json = """
        {"franja":"noche","franjaCompleta":true,"pctDia":100,"habitos":[],"pasos":[],"masPasos":0,"actualizado":""}
        """
        let e = try JSONDecoder().decode(EstadoCard.self, from: Data(json.utf8))
        XCTAssertNil(e.proximaFranja)
        XCTAssertNil(e.fecha)
        XCTAssertTrue(e.diaCompleto)
    }
}
