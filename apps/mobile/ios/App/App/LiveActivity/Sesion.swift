import Foundation
import Security

/// Sesión de Supabase guardada en el Keychain, para que los botones de la card escriban sin abrir la app.
struct Sesion: Codable {
    var url: String
    var anonKey: String
    var accessToken: String
    var refreshToken: String

    #if os(macOS)
    /// En la Mac, por bundle id: la app de producción y «Second Brain Dev» no comparten la sesión.
    private static let servicio = (Bundle.main.bundleIdentifier ?? "com.csr9497.secondbrain.mac") + ".sesion"
    #else
    private static let servicio = "com.csr9497.secondbrain.sesion"
    #endif
    private static let cuenta = "supabase"

    private static var consulta: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: servicio,
         kSecAttrAccount as String: cuenta]
    }

    static func guardar(_ sesion: Sesion) throws {
        let datos = try JSONEncoder().encode(sesion)
        let cambios: [String: Any] = [kSecValueData as String: datos,
                                      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        var estado = SecItemUpdate(consulta as CFDictionary, cambios as CFDictionary)
        if estado == errSecItemNotFound {
            var nuevo = consulta
            nuevo.merge(cambios) { $1 }
            estado = SecItemAdd(nuevo as CFDictionary, nil)
        }
        guard estado == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(estado)) }
    }

    static func leer() -> Sesion? {
        var q = consulta
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultado: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &resultado) == errSecSuccess, let datos = resultado as? Data else { return nil }
        return try? JSONDecoder().decode(Sesion.self, from: datos)
    }

    static func borrar() {
        SecItemDelete(consulta as CFDictionary)
    }
}
