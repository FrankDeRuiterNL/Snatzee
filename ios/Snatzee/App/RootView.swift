import SwiftUI

/// Splash first, then whatever the session calls for: the welcome screen,
/// onboarding, or the app.
struct RootView: View {
    @State private var session = SessionStore()
    @State private var showingSplash = true

    var body: some View {
        ZStack {
            content
                .animation(.easeOut(duration: 0.25), value: session.state)

            if showingSplash {
                SplashView {
                    withAnimation(.easeOut(duration: 0.25)) { showingSplash = false }
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
        .background(Theme.canvas.ignoresSafeArea())
        .environment(session)
        .toasts()
        .task { session.start() }
        .onOpenURL { url in
            if url.path.hasPrefix("/auth/") || url.scheme != "https" {
                // Confirmation and magic links (universal links to /auth/…)
                // carry the session; supabase-swift completes the sign-in.
                Task { try? await SupabaseService.client?.auth.session(from: url) }
            } else {
                // Everything else is a page of the site: a profile, a
                // group invite, a tab. Picked up once signed in.
                DeepLinks.shared.open(url)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !AppConfig.isComplete {
            ConfigMissingView()
        } else {
            switch session.state {
            case .loading:
                Theme.canvas.ignoresSafeArea()
            case .signedOut:
                WelcomeView()
            case .onboarding(let profile):
                OnboardingView(profile: profile)
            case .ready(let profile):
                MainTabView(profile: profile)
            case .updateRequired:
                UpdateRequiredView()
            }
        }
    }
}

/// A build without its server settings says so plainly, rather than
/// failing on every request.
private struct ConfigMissingView: View {
    var body: some View {
        MessageScreen(
            title: "Serverinstellingen ontbreken",
            text: "Vul SNATZEE_ANON_KEY in ios/Config/Local.xcconfig in en bouw opnieuw."
        )
    }
}

/// Shown when the server has raised `min_ios_build` past this build.
private struct UpdateRequiredView: View {
    var body: some View {
        MessageScreen(
            title: "Tijd voor een update",
            text: "Deze versie van Snatzee! werkt niet meer met de server. Werk de app bij via de App Store of TestFlight."
        )
    }
}

private struct MessageScreen: View {
    let title: String
    let text: String

    var body: some View {
        VStack(spacing: 12) {
            LogoMark(size: 72)
            Text(title)
                .font(.jakarta(TextSize.lg, .extrabold))
                .foregroundStyle(Theme.ink)
            Text(text)
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas.ignoresSafeArea())
    }
}
