import SwiftUI

/// The signed-out start screen: the website's landing page.
struct WelcomeView: View {
    @State private var path: [AuthMode] = []
    @State private var appleEnabled = false
    @State private var appleError: String?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LogoLockup(size: 44)
                        .padding(.top, 24)

                    (Text("Jouw Yahtzee‑scores,\n") + Text("eindelijk bijgehouden.").foregroundColor(Theme.mint400))
                        .font(.jakarta(41.6, .black))
                        .trackingTight(41.6)
                        .foregroundStyle(Theme.ink)
                        .padding(.top, 40)

                    Text("Speel gewoon met je vertrouwde scoreblaadje. Voeg na afloop je eindscore toe en Snatzee regelt de records, statistieken, achievements en ranglijsten.")
                        .font(.jakarta(16.8))
                        .lineSpacing(4)
                        .foregroundStyle(Theme.inkSoft)
                        .padding(.top, 16)

                    VStack(spacing: 12) {
                        Feature(icon: "dice-5", accent: .mint, title: "Eén tik per potje",
                                text: "Score invullen, gewonnen aanvinken, opslaan. Klaar binnen vijf seconden.")
                        Feature(icon: "zap", accent: .tangerine, title: "Yahtzees los registreren",
                                text: "Inclusief een aparte knop voor die ene Yahtzee in de eerste worp.")
                        Feature(icon: "trophy", accent: .grape, title: "Ranglijsten & achievements",
                                text: "Zes ranglijsten, 36 achievements en records die automatisch worden bijgehouden.")
                        Feature(icon: "users", accent: .aqua, title: "Vrienden en groepen",
                                text: "Vergelijk je cijfers met je familie, je collega's of je vrijdagavondclub.")
                    }
                    .padding(.top, 32)
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 12) {
                    if appleEnabled {
                        AppleSignInButton { appleError = $0 }
                        FieldError(message: appleError)
                    }
                    Button("Gratis account maken") { path.append(.register) }
                        .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                    Button("Ik heb al een account") { path.append(.login) }
                        .buttonStyle(.snatzee(.soft, size: .lg, full: true))
                    ConsentNotice()
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(Theme.canvas)
            }
            .background(Theme.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: AuthMode.self) { mode in
                AuthFormView(mode: mode)
            }
        }
        .task { appleEnabled = await AuthSettings.isAppleEnabled() }
    }
}

private struct Feature: View {
    let icon: String
    let accent: Accent
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            IconTile(icon: icon, accent: accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.jakarta(TextSize.base, .bold))
                    .trackingTight(TextSize.base)
                    .foregroundStyle(Theme.ink)
                Text(text)
                    .font(.jakarta(TextSize.sm))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .card(.surface)
    }
}

#Preview {
    WelcomeView()
}
