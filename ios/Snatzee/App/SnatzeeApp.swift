import SwiftUI

@main
struct SnatzeeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        // Warm the players up before the splash asks for the audio logo.
        _ = SoundPlayer.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .tint(Theme.mint500)
        }
    }
}
