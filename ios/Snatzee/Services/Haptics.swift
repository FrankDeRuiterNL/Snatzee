import UIKit

/// The web app's `haptic()` patterns, on the Taptic Engine.
enum Haptics {
    enum Pattern { case light, medium, heavy, success, warning }

    @MainActor
    static func play(_ pattern: Pattern) {
        switch pattern {
        case .light: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .medium: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case .heavy: UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
    }
}
