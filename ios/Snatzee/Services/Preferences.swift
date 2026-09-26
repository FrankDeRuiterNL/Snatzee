import Foundation
import Observation

/// The device-level preferences from the website's Settings, kept on this
/// phone like the website keeps them in the browser.
@MainActor
@Observable
final class Preferences {
    static let shared = Preferences()

    var celebrations: Bool { didSet { store(celebrations, "snatzee.celebrations") } }
    var haptics: Bool { didSet { store(haptics, "snatzee.haptics") } }
    var reducedMotion: Bool { didSet { store(reducedMotion, "snatzee.reduced-motion") } }
    var sound: Bool { didSet { SoundPlayer.isEnabled = sound } }

    private init() {
        let defaults = UserDefaults.standard
        celebrations = defaults.object(forKey: "snatzee.celebrations") as? Bool ?? true
        haptics = defaults.object(forKey: "snatzee.haptics") as? Bool ?? true
        reducedMotion = defaults.object(forKey: "snatzee.reduced-motion") as? Bool ?? false
        sound = SoundPlayer.isEnabled
    }

    private func store(_ value: Bool, _ key: String) {
        UserDefaults.standard.set(value, forKey: key)
    }

    /// Read without the main actor, for Haptics.
    nonisolated static var hapticsEnabled: Bool {
        UserDefaults.standard.object(forKey: "snatzee.haptics") as? Bool ?? true
    }
}
