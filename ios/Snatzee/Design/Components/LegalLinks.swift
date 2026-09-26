import SwiftUI

/// "Met je account ga je akkoord met de voorwaarden en het privacybeleid."
/// Shown wherever an account can be made (e-mail or Apple).
struct ConsentNotice: View {
    var body: some View {
        Text(Self.text)
            .font(.jakarta(TextSize.xs))
            .foregroundStyle(Theme.inkMuted)
            .tint(Theme.inkSoft)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    private static var text: AttributedString {
        let terms = AppConfig.webURL("/voorwaarden").absoluteString
        let privacy = AppConfig.webURL("/privacy").absoluteString
        var text = (try? AttributedString(markdown: "Met je account ga je akkoord met de [voorwaarden](\(terms)) en het [privacybeleid](\(privacy)).")) ?? AttributedString("Met je account ga je akkoord met de voorwaarden en het privacybeleid.")
        for run in text.runs where run.link != nil {
            text[run.range].underlineStyle = .single
        }
        return text
    }
}

/// Privacybeleid · Voorwaarden · Support, opened in Safari.
struct LegalLinks: View {
    var body: some View {
        HStack(spacing: 20) {
            link("Privacybeleid", "/privacy")
            link("Voorwaarden", "/voorwaarden")
            link("Support", "/support")
        }
        .font(.jakarta(TextSize.sm))
        .foregroundStyle(Theme.inkMuted)
        .frame(maxWidth: .infinity)
    }

    private func link(_ title: String, _ path: String) -> some View {
        Link(destination: AppConfig.webURL(path)) {
            Text(title).underline()
        }
    }
}
