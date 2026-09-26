import Foundation
import Observation

/// Switches the server hands out through `get_client_config`, so a feature
/// can be tried in TestFlight and turned on for everyone from the admin
/// console without a new build.
@MainActor
@Observable
final class AppFeatures {
    static let shared = AppFeatures()

    /// "Scoreblad scannen" in the add-a-game sheet.
    private(set) var scoresheetScan = false

    private init() {}

    func apply(_ config: ClientConfig) {
        scoresheetScan = config.setting("scoresheet_scan_ios") == 1
    }

    /// Re-reads the switches; quiet when offline.
    func refresh() async {
        guard let config = try? await API.rpc("get_client_config", as: ClientConfig.self) else { return }
        apply(config)
    }
}
