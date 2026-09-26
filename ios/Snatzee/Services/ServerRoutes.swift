import Foundation
import Supabase

/// The website's own server routes (/api/…), called with the player's
/// access token as `Authorization: Bearer` — how the server tells the app
/// apart from the website's cookie.
enum ServerRoutes {
    private struct ErrorBody: Decodable { let error: String? }

    static func post<T: Decodable>(_ path: String, body: [String: String] = [:]) async throws -> T {
        guard let base = AppConfig.apiURL else { throw APIError.notConfigured }
        let token = try await API.client().auth.session.accessToken

        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw APIError(message: message ?? "De server gaf een fout (\(status)).", hint: "http_\(status)")
        }
        return try API.decoder.decode(T.self, from: data)
    }
}
