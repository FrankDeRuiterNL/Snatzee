import SwiftUI

/// Full-screen moment for a new record or a first-roll Yahtzee —
/// `<CelebrationOverlay>`.
struct CelebrationOverlay: View {
    let celebration: GameCoordinator.Celebration
    let onDismiss: () -> Void

    @State private var shown = false
    @State private var spin = 0.0

    private var big: Bool { celebration.variant == .firstRoll }
    private var accent: Color { big ? Theme.tangerine400 : Theme.mint400 }

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
                .background(.ultraThinMaterial)
            ConfettiView(pieces: big ? 64 : 34)

            VStack(spacing: 0) {
                Text(celebration.emoji)
                    .font(.system(size: big ? 88 : 72))
                    .rotationEffect(.degrees(spin))
                    .scaleEffect(shown ? 1 : 0.6)
                    .shadow(color: (big ? Theme.tangerine500 : Theme.mint500).opacity(0.55), radius: big ? 40 : 32)

                Text(celebration.title.uppercased())
                    .font(.jakarta(TextSize.sm, .bold))
                    .tracking(4.2)
                    .foregroundStyle(accent)
                    .padding(.top, 24)

                Text(celebration.headline)
                    .font(.jakarta(big ? TextSize.xxxxl : TextSize.xxxl, .black))
                    .trackingTight(big ? TextSize.xxxxl : TextSize.xxxl)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)

                if let detail = celebration.detail {
                    Text(detail)
                        .font(.jakarta(TextSize.base, .medium))
                        .foregroundStyle(Theme.inkSoft)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                        .padding(.top, 12)
                }

                Button("Top!", action: onDismiss)
                    .font(.jakarta(TextSize.sm, .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 28)
                    .frame(minHeight: 48)
                    .background(Theme.surface.opacity(0.10), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.20), lineWidth: 1))
                    .buttonStyle(.pressable)
                    .padding(.top, 36)
            }
            .padding(.horizontal, 24)
            .scaleEffect(shown ? 1 : 0.7)
            .offset(y: shown ? 0 : 24)
            .opacity(shown ? 1 : 0)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onDismiss)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) { shown = true }
            withAnimation(.timingCurve(0.34, 1.56, 0.64, 1, duration: big ? 1.1 : 0.75)) {
                spin = big ? 720 : 360
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isModal)
    }
}

/// "Achievement unlocked", one at a time — `<AchievementUnlockSheet>`.
struct AchievementUnlockView: View {
    let achievement: Achievement
    let remaining: Int
    let onNext: () -> Void

    @State private var shown = false

    private var rarity: Rarity { Rarity(achievement.rarity) }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.80).ignoresSafeArea()
                .background(.ultraThinMaterial)
            ConfettiView(pieces: 44)
                .frame(maxHeight: .infinity, alignment: .center)

            VStack(spacing: 0) {
                Text("ACHIEVEMENT UNLOCKED")
                    .font(.jakarta(TextSize.xs, .bold))
                    .tracking(3.4)
                    .foregroundStyle(Theme.mint400)

                Text(achievement.icon)
                    .font(.system(size: 48))
                    .frame(width: 96, height: 96)
                    .background(
                        LinearGradient(colors: rarity.glow, startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                            .strokeBorder(rarity.ring, lineWidth: 4)
                    )
                    .scaleEffect(shown ? 1 : 0.5)
                    .rotationEffect(.degrees(shown ? 0 : -12))
                    .padding(.top, 24)

                Text(rarity.label.uppercased())
                    .font(.jakarta(11.2, .bold))
                    .tracking(1.1)
                    .foregroundStyle(rarity.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(rarity.chipBackground, in: Capsule())
                    .padding(.top, 20)

                Text(achievement.name)
                    .font(.jakarta(TextSize.xxxl, .black))
                    .trackingTight(TextSize.xxxl)
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)

                Text(achievement.description)
                    .font(.jakarta(TextSize.base15))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .padding(.top, 8)

                Button(remaining > 0 ? "Volgende (\(remaining))" : "Lekker bezig!", action: onNext)
                    .buttonStyle(.snatzee(.navy, size: .lg, full: true))
                    .padding(.top, 32)
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 28)
            .frame(maxWidth: 544)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                    .fill(Theme.surfaceElevated)
                    .ignoresSafeArea(edges: .bottom)
            )
            .overlay(
                UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                    .strokeBorder(Theme.hairlineStrong, lineWidth: 1)
                    .ignoresSafeArea(edges: .bottom)
            )
            .snatzeeShadow(.float)
            .offset(y: shown ? 0 : 500)
        }
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { shown = true }
        }
        .accessibilityAddTraits(.isModal)
    }
}
