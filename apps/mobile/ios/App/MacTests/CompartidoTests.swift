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
