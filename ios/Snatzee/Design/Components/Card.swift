import SwiftUI

/// The two card surfaces from globals.css.
enum CardStyle {
    /// `.card-surface` / `bg-surface ring-1 ring-hairline shadow-soft`
    case surface
    /// `.card-elevated` (with `.sheen`): the hero cards
    case elevated
}

struct CardBackground: ViewModifier {
    var style: CardStyle = .surface
    var radius: CGFloat = Theme.Radius.card

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        switch style {
        case .surface:
            content
                .background(Theme.surface, in: shape)
                .overlay(shape.strokeBorder(Theme.hairline, lineWidth: 1))
                .snatzeeShadow(.soft)
        case .elevated:
            content
                .background {
                    shape.fill(Theme.surfaceElevated)
                        .overlay(
                            // `.sheen`: a faint light from above
                            shape.fill(
                                LinearGradient(
                                    colors: [.white.opacity(0.05), .white.opacity(0)],
                                    startPoint: .top,
                                    endPoint: UnitPoint(x: 0.5, y: 0.45)
                                )
                            )
                        )
                }
                .overlay(shape.strokeBorder(Theme.hairlineStrong, lineWidth: 1))
                .snatzeeShadow(.lift)
        }
    }
}

extension View {
    func card(_ style: CardStyle = .surface, radius: CGFloat = Theme.Radius.card) -> some View {
        modifier(CardBackground(style: style, radius: radius))
    }
}
