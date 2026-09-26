import Foundation
import Network
import Observation

/// Whether the phone can reach the internet at all, from the system's own
/// view of the network. Used to say "offline" once, clearly, instead of
/// letting every screen fail on its own, and to reload when it returns.
@MainActor
@Observable
final class Connectivity {
    static let shared = Connectivity()

    private(set) var isOnline = true

    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { path in
            let online = path.status == .satisfied
            Task { @MainActor in
                Connectivity.shared.isOnline = online
            }
        }
        monitor.start(queue: DispatchQueue(label: "nl.snatzee.connectivity"))
    }
}
