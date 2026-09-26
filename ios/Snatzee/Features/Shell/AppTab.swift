import Foundation

/// The four tabs, in the web app's order and with its labels.
enum AppTab: String, CaseIterable, Identifiable {
    case home, rankings, friends, profile

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: "Home"
        case .rankings: "Ranking"
        case .friends: "Vrienden"
        case .profile: "Profiel"
        }
    }

    /// Lucide icon names, as on the web.
    var icon: String {
        switch self {
        case .home: "house"
        case .rankings: "trophy"
        case .friends: "users"
        case .profile: "user"
        }
    }
}
