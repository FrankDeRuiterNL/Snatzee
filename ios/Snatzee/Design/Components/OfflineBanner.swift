import SwiftUI

/// "Geen internetverbinding": a pill above the tab bar while the phone is
/// offline. What is on screen stays usable to look at; it refreshes itself
/// as soon as the connection is back.
struct OfflineBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            LucideIcon("wifi-off", size: 16)
            Text("Geen internetverbinding")
                .font(.jakarta(TextSize.sm, .semibold))
        }
        .foregroundStyle(Theme.tangerine300)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surfaceElevated, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.tangerine500.opacity(0.35), lineWidth: 1))
        .snatzeeShadow(.lift)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }
}
