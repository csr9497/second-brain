import Foundation

/// Escrituras en PostgREST para los botones de la card, igual que `apps/web/src/lib/api.ts`.
/// Solo en el target App: usa la sesión del Keychain (`Sesion`).
enum SupabaseREST {
    enum Fallo: Error, CustomStringConvertible {
        case sinSesion
        case refresco(Int)
        case http(Int, String)
        case sinFilas

        var description: String {
            switch self {
            case .sinSesion: return "no hay sesión en el Keychain"
            case .refresco(let c): return "no se pudo refrescar el token (HTTP \(c))"
            case .http(let c, let cuerpo): return "HTTP \(c): \(cuerpo)"
            case .sinFilas: return "la escritura no afectó a ninguna fila"
            }
        }
    }

    /// Upsert de `habit_logs` (hábito marcado hoy en esa franja).
    static func marcarHabito(id: String, slot: String) async throws {
        try await escribir(
            "POST", ruta: "habit_logs?on_conflict=habit_id,fecha,slot",
            cuerpo: ["habit_id": id, "fecha": fechaLocal(), "slot": slot, "done": true],
            prefer: "resolution=merge-duplicates,return=representation")
    }

    /// `paso` → `steps.done = true`; `tarea` → `tasks.status = 'hecha'`.
    static func marcarPaso(id: String, tipo: String) async throws {
        let tabla = tipo == "tarea" ? "tasks" : "steps"
        let cuerpo: [String: Any] = tipo == "tarea" ? ["status": "hecha"] : ["done": true]
        try await escribir("PATCH", ruta: "\(tabla)?id=eq.\(id)", cuerpo: cuerpo, prefer: "return=representation")
    }

    /// Día local del dispositivo, `yyyy-MM-dd`.
    static func fechaLocal(_ fecha: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: fecha)
    }

    // MARK: - HTTP

    private static func escribir(_ metodo: String, ruta: String, cuerpo: [String: Any], prefer: String) async throws {
        guard var sesion = Sesion.leer() else { throw Fallo.sinSesion }
        if caduca(sesion.accessToken) {
            sesion = try await refrescar(sesion)
        }
        let datos = try JSONSerialization.data(withJSONObject: cuerpo)
        var (codigo, respuesta) = try await enviar(sesion, metodo, ruta, datos, prefer)
        if codigo == 401 {
            sesion = try await refrescar(sesion)
            (codigo, respuesta) = try await enviar(sesion, metodo, ruta, datos, prefer)
        }
        guard (200..<300).contains(codigo) else {
            throw Fallo.http(codigo, String(data: respuesta, encoding: .utf8) ?? "")
        }
        // Con RLS, un id ajeno o inexistente devuelve 200 con []: no cuenta como hecho.
        if let filas = try? JSONSerialization.jsonObject(with: respuesta) as? [Any], filas.isEmpty {
            throw Fallo.sinFilas
        }
    }

    private static func enviar(_ sesion: Sesion, _ metodo: String, _ ruta: String, _ datos: Data, _ prefer: String) async throws -> (Int, Data) {
        guard let url = URL(string: "\(sesion.url)/rest/v1/\(ruta)") else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = metodo
        req.httpBody = datos
        req.setValue(sesion.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(sesion.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(prefer, forHTTPHeaderField: "Prefer")
        // Los triggers calculan el día y la franja locales con esta zona (public.hora_local()).
        req.setValue(TimeZone.current.identifier, forHTTPHeaderField: "x-timezone")
        let (respuesta, http) = try await URLSession.shared.data(for: req)
        return ((http as? HTTPURLResponse)?.statusCode ?? 0, respuesta)
    }

    /// `POST /auth/v1/token?grant_type=refresh_token` y guarda los tokens nuevos en el Keychain.
    ///
    /// Supabase rota el refresh token: tras esto el de la web (supabase-js) queda usado. La web no se entera por un
    /// evento: su almacenamiento (`almacenNativo`, apps/web/src/lib/nativo/sesion.ts) lee el Keychain cada vez que
    /// supabase-js carga la sesión y toma estos tokens si difieren. Si la web y un botón refrescan a la vez con el
    /// mismo token, el intervalo de reutilización de Supabase (10 s) les da a los dos un token válido y gana la última
    /// escritura en el Keychain; solo se refresca cuando hace falta (`caduca` o un 401) para que eso sea raro.
    private static func refrescar(_ sesion: Sesion) async throws -> Sesion {
        guard let url = URL(string: "\(sesion.url)/auth/v1/token?grant_type=refresh_token") else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(sesion.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": sesion.refreshToken])
        let (datos, http) = try await URLSession.shared.data(for: req)
        let codigo = (http as? HTTPURLResponse)?.statusCode ?? 0
        guard codigo == 200,
              let json = try JSONSerialization.jsonObject(with: datos) as? [String: Any],
              let acceso = json["access_token"] as? String,
              let refresco = json["refresh_token"] as? String else {
            throw Fallo.refresco(codigo)
        }
        var nueva = sesion
        nueva.accessToken = acceso
        nueva.refreshToken = refresco
        try Sesion.guardar(nueva)
        return nueva
    }

    /// true si el JWT caduca en menos de 60 s (o no se puede leer su `exp`).
    private static func caduca(_ jwt: String) -> Bool {
        let partes = jwt.split(separator: ".")
        guard partes.count == 3 else { return true }
        var b64 = String(partes[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let datos = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: datos) as? [String: Any],
              let exp = json["exp"] as? Double else { return true }
        return Date(timeIntervalSince1970: exp).timeIntervalSinceNow < 60
    }
}
