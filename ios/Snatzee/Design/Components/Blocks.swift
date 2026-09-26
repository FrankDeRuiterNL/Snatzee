import SwiftUI

/// The tinted colour pairs the web app uses for icon tiles and chips.
enum Accent {
    case mint, navy, tangerine, grape, aqua, rose

    var background: Color {
        switch self {
        case .mint: Theme.mint500.opacity(0.15)
        case .navy: .white.opacity(0.08)
        case .tangerine: Theme.tangerine500.opacity(0.15)
        case .grape: Theme.grape500.opacity(0.15)
        case .aqua: Theme.aqua500.opacity(0.15)
        case .rose: Theme.roseEmber500.opacity(0.15)
        }
    }

    var foreground: Color {
        switch self {
        case .mint: Theme.mint300
        case .navy: Theme.inkSoft
        case .tangerine: Theme.tangerine300
        case .grape: Theme.grape300
        case .aqua: Theme.aqua300
        case .rose: Theme.roseEmber300
        }
    }
}

/// A rounded square holding an icon in an accent colour.
struct IconTile: View {
    let icon: String
    var accent: Accent = .mint
    var size: CGFloat = 44
    var iconSize: CGFloat = 20
    var radius: CGFloat = Theme.Radius.xxl

    var body: some View {
        LucideIcon(icon, size: iconSize)
            .foregroundStyle(accent.foreground)
            .frame(width: size, height: size)
            .background(accent.background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// `<EmptyState>`
struct EmptyStateView<Action: View>: View {
    var emoji = "🎲"
    let title: String
    var description: String?
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(spacing: 0) {
            Text(emoji)
                .font(.system(size: 30))
                .frame(width: 64, height: 64)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            Text(title)
                .font(.jakarta(TextSize.lg, .extrabold))
                .trackingTight(TextSize.lg)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
                .padding(.top, 16)
            if let description {
                Text(description)
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 260)
                    .padding(.top, 8)
            }
            action()
                .frame(maxWidth: 256)
                .padding(.top, 24)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
        .card(.surface, radius: Theme.Radius.xl2)
    }
}

extension EmptyStateView where Action == EmptyView {
    init(emoji: String = "🎲", title: String, description: String? = nil) {
        self.init(emoji: emoji, title: title, description: description) { EmptyView() }
    }
}

/// `<StatCard>`
struct StatCard: View {
    let label: String
    let value: String
    var hint: String?
    var icon: String?
    var accent: Accent = .navy

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let icon {
                IconTile(icon: icon, accent: accent, size: 36, iconSize: 18, radius: Theme.Radius.xl)
                    .padding(.bottom, 12)
            }
            Text(label)
                .font(.jakarta(TextSize.sm, .medium))
                .foregroundStyle(Theme.inkMuted)
            Text(value)
                .font(.jakarta(TextSize.xxl, .extrabold))
                .trackingTight(TextSize.xxl)
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
                .padding(.top, 2)
            if let hint {
                Text(hint)
                    .font(.jakarta(TextSize.xs, .medium))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(.surface)
    }
}

/// `<LevelChip>`
struct LevelChip: View {
    let emoji: String?
    let name: String

    var body: some View {
        HStack(spacing: 6) {
            Text(emoji ?? "🎲")
            Text(name)
        }
        .font(.jakarta(TextSize.xs, .bold))
        .foregroundStyle(Theme.inkSoft)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Theme.canvas, in: Capsule())
    }
}

/// The small round icon buttons in headers (settings, back).
struct RoundIconButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            LucideIcon(icon, size: 20)
                .foregroundStyle(Theme.inkSoft)
                .frame(width: 44, height: 44)
                .background(Theme.surface, in: Circle())
                .overlay(Circle().strokeBorder(Theme.hairline, lineWidth: 1))
                .snatzeeShadow(.soft)
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(label)
    }
}
