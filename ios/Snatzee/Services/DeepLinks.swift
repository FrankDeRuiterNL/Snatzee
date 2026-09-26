import Foundation
import Observation

/// Where a universal link or a tapped notification wants to go, for the
/// signed-in app to pick up — the website's paths, mapped onto tabs and
/// navigation stacks.
@MainActor
@Observable
final class DeepLinks {
    static let shared = DeepLinks()

    enum FriendsPane: Equatable { case friends, requests, search }

    struct Destination: Equatable {
        let tab: AppTab
        /// The stack to show on that tab; empty for the tab's own page.
        let routes: [AppRoute]
        /// Push onto whatever tab is showing instead (a player's profile).
        var onCurrentTab = false
    }

    /// Waiting for MainTabView.
    var pending: Destination?
    /// An invite code from a scanned QR link, for the join sheet.
    var inviteCode: String?
    /// /app/friends?tab=requests
    var friendsPane: FriendsPane?

    private init() {}

    /// True when the link was ours to handle.
    @discardableResult
    func open(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return open(path: components.path, query: components.queryItems ?? [])
    }

    /// A site-relative path like "/app/groups/<id>" or "/u/mathijs".
    @discardableResult
    func open(path raw: String) -> Bool {
        guard let components = URLComponents(string: raw) else { return false }
        return open(path: components.path, query: components.queryItems ?? [])
    }

    private func open(path: String, query: [URLQueryItem]) -> Bool {
        guard let destination = Self.destination(path: path, query: query) else { return false }
        if destination.tab == .friends, destination.routes.isEmpty {
            friendsPane = query.first { $0.name == "tab" }?.value == "requests" ? .requests : .friends
        }
        if destination.routes == [.groups], let code = query.first(where: { $0.name == "code" })?.value {
            inviteCode = Invite.parse(code)
        }
        pending = destination
        return true
    }

    nonisolated static func destination(path: String, query: [URLQueryItem] = []) -> Destination? {
        let parts = path.split(separator: "/").map(String.init)

        if parts.count == 2, parts[0] == "u" {
            let username = parts[1].removingPercentEncoding ?? parts[1]
            return Destination(tab: .home, routes: [.publicProfile(username.lowercased())], onCurrentTab: true)
        }
        guard parts.first == "app" else { return nil }

        switch Array(parts.dropFirst()) {
        case []: return Destination(tab: .home, routes: [])
        case ["rankings"]: return Destination(tab: .rankings, routes: [])
        case ["friends"]: return Destination(tab: .friends, routes: [])
        case ["groups"]: return Destination(tab: .friends, routes: [.groups])
        case let rest where rest.count == 2 && rest[0] == "groups":
            guard let id = UUID(uuidString: rest[1]) else { return Destination(tab: .friends, routes: [.groups]) }
            return Destination(tab: .friends, routes: [.groups, .group(id)])
        case ["profile"]: return Destination(tab: .profile, routes: [])
        case ["settings"]: return Destination(tab: .profile, routes: [.settings])
        case ["achievements"]: return Destination(tab: .profile, routes: [.achievements])
        case ["statistics"]: return Destination(tab: .profile, routes: [.statistics])
        case ["history"]:
            let filter = AppRoute.HistoryFilter(rawValue: query.first { $0.name == "filter" }?.value ?? "") ?? .all
            return Destination(tab: .profile, routes: [.history(filter)])
        default: return Destination(tab: .home, routes: [])
        }
    }
}
