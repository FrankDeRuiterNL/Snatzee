import SwiftUI

/// Splash first, then the app.
struct RootView: View {
    @State private var showingSplash = true

    var body: some View {
        ZStack {
            if AppConfig.isComplete {
                MainTabView()
            } else {
                ConfigMissingView()
            }

            if showingSplash {
                SplashView {
                    withAnimation(.easeOut(duration: 0.25)) { showingSplash = false }
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
        .background(Theme.canvas.ignoresSafeArea())
    }
}

/// A build without its server settings says so plainly, rather than
/// failing on every request.
private struct ConfigMissingView: View {
    var body: some View {
        VStack(spacing: 12) {
            LogoMark(size: 72)
            Text("Serverinstellingen ontbreken")
                .font(.jakarta(TextSize.lg, .extrabold))
                .foregroundStyle(Theme.ink)
            Text("Vul SNATZEE_ANON_KEY in ios/Config/Local.xcconfig in en bouw opnieuw.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas.ignoresSafeArea())
    }
}
