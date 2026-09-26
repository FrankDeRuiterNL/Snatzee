import SwiftUI

/// The web app's `<Button>`: a pill in one of seven variants and three sizes.
struct SnatzeeButtonStyle: ButtonStyle {
    enum Variant { case primary, navy, soft, ghost, outline, danger, dangerSoft }
    enum Size { case sm, md, lg }

    var variant: Variant = .primary
    var size: Size = .md
    var full = false
    var loading = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if loading {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(foreground)
                    .controlSize(.small)
            }
            configuration.label
                .opacity(loading ? 0.7 : 1)
        }
        .font(.jakarta(fontSize, .semibold))
        .trackingTight(fontSize)
        .foregroundStyle(foreground)
        .padding(.horizontal, horizontalPadding)
        .frame(minHeight: minHeight)
        .frame(maxWidth: full ? .infinity : nil)
        .background(background, in: Capsule())
        .overlay(Capsule().strokeBorder(ring, lineWidth: 1))
        .modifier(VariantShadow(variant: variant))
        .opacity(isEnabled ? 1 : 0.5)
        .contentShape(Capsule())
        .scaleEffect(configuration.isPressed ? 0.965 : 1)
        .animation(.spring(response: 0.18, dampingFraction: 0.55), value: configuration.isPressed)
    }

    private var fontSize: CGFloat {
        switch size {
        case .sm: TextSize.sm
        case .md: TextSize.base15
        case .lg: TextSize.base
        }
    }

    private var minHeight: CGFloat {
        switch size {
        case .sm: 44
        case .md: 48
        case .lg: 56
        }
    }

    private var horizontalPadding: CGFloat {
        switch size {
        case .sm: 16
        case .md: 20
        case .lg: 24
        }
    }

    private var foreground: Color {
        switch variant {
        case .primary: Theme.navy950
        case .navy, .danger: .white
        case .soft, .outline: Theme.ink
        case .ghost: Theme.inkSoft
        case .dangerSoft: Theme.roseEmber300
        }
    }

    private var background: Color {
        switch variant {
        case .primary: Theme.mint500
        case .navy: Theme.surfaceElevated
        case .soft: Theme.surface
        case .ghost, .outline: .clear
        case .danger: Theme.roseEmber500
        case .dangerSoft: Theme.roseEmber500.opacity(0.15)
        }
    }

    private var ring: Color {
        switch variant {
        case .soft, .outline: Theme.hairline
        case .dangerSoft: Theme.roseEmber500.opacity(0.25)
        default: .clear
        }
    }
}

private struct VariantShadow: ViewModifier {
    let variant: SnatzeeButtonStyle.Variant

    func body(content: Content) -> some View {
        switch variant {
        case .primary: content.snatzeeShadow(.mint)
        case .navy, .soft, .danger: content.snatzeeShadow(.soft)
        default: content
        }
    }
}

extension ButtonStyle where Self == SnatzeeButtonStyle {
    static func snatzee(
        _ variant: SnatzeeButtonStyle.Variant = .primary,
        size: SnatzeeButtonStyle.Size = .md,
        full: Bool = false,
        loading: Bool = false
    ) -> SnatzeeButtonStyle {
        SnatzeeButtonStyle(variant: variant, size: size, full: full, loading: loading)
    }
}
