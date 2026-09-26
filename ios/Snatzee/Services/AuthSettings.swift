import Foundation

/// Which sign-in providers the server has switched on.
///
/// GoTrue publishes this at /auth/v1/settings. The Apple button is only
/// offered when Apple is actually configured there — a button that leads
/// nowhere is worse than none, the same rule the website follows.
enum AuthSettings {
    private struct Response: Decodable {
        let external: [String: Bool]
    }

    static func isAppleEnabled() async -> Bool {
        guard let base = AppConfig.apiURL, let key = AppConfig.anonKey else { return false }
        var request = URLRequest(url: base.appending(path: "auth/v1/settings"))
        request.setValue(key, forHTTPHeaderField: "apikey")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let settings = try? JSONDecoder().decode(Response.self, from: data)
        else { return false }
        return settings.external["apple"] ?? false
    }
}
