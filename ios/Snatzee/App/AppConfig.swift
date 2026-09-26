import Foundation

/// Where the app finds its server, from Info.plist (set in Config/*.xcconfig).
enum AppConfig {
    static var apiURL: URL? {
        let info = Bundle.main.infoDictionary
        let scheme = (info?["SnatzeeAPIScheme"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "https"
        guard let host = info?["SnatzeeAPIHost"] as? String, !host.isEmpty else { return nil }
        return URL(string: "\(scheme)://\(host)")
    }

    static var anonKey: String? {
        guard let key = Bundle.main.infoDictionary?["SnatzeeAnonKey"] as? String, !key.isEmpty else {
            return nil
        }
        return key
    }

    /// A page of the website, such as the privacy policy.
    static func webURL(_ path: String) -> URL {
        apiURL?.appending(path: path) ?? URL(string: "https://www.snatzee.nl\(path)")!
    }

    /// Snatzee! in the App Store (App Store Connect Apple ID 6816307907).
    static let appStoreURL = URL(string: "https://apps.apple.com/app/id6816307907")!

    /// Both present: the app can talk to its server.
    static var isComplete: Bool { apiURL != nil && anonKey != nil }

    static var buildNumber: Int {
        Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0
    }

    static var versionString: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        return "\(version) (\(buildNumber))"
    }
}
