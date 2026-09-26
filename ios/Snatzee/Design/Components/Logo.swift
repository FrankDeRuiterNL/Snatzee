import SwiftUI

/// The dice mark in its rounded tile (`LogoMark`).
struct LogoMark: View {
    var size: CGFloat = 56

    var body: some View {
        Image("Mark")
            .resizable()
            .interpolation(.high)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .snatzeeShadow(.soft)
            .accessibilityHidden(true)
    }
}

/// "Snat" in ink, "zee" in mint — the live-text wordmark.
struct Wordmark: View {
    var size: CGFloat

    @Environment(\.wordmarkOpacity) private var opacity

    var body: some View {
        (Text("Snat").foregroundColor(Theme.ink) + Text("zee").foregroundColor(Theme.mint500))
            .font(.jakarta(size, .extrabold))
            .trackingTight(size)
            .opacity(opacity)
            .accessibilityLabel("Snatzee")
    }
}

/// Mark beside the wordmark, for headers (`LogoLockup`).
struct LogoLockup: View {
    var size: CGFloat = 44

    var body: some View {
        HStack(spacing: 10) {
            LogoMark(size: size)
            Wordmark(size: 21.6)
        }
    }
}

/// Mark above the wordmark, for the launch screen (`LogoStack`).
/// Proportions from the web version: a 101pt mark over a 28.08pt
/// wordmark, 12pt apart — scaled together.
struct LogoStack: View {
    var size: CGFloat = 101

    var body: some View {
        VStack(spacing: size * 12 / 101) {
            LogoMark(size: size)
            Wordmark(size: size * 28.08 / 101)
        }
    }
}
