import SwiftUI

/// Snatzee design tokens, ported one-to-one from `src/app/globals.css`.
///
/// Dark by default. Depth comes from stacked navy layers rather than from
/// black: the canvas is the darkest, cards sit above it, and elevated
/// cards above those. Mint is the primary accent; tangerine, grape and
/// aqua stay reserved for achievements, records and special moments.
enum Theme {
    // MARK: Surfaces, darkest to lightest
    static let canvas = Color(hex: 0x07131F)
    static let canvasSoft = Color(hex: 0x0B1D2D)
    static let surface = Color(hex: 0x102638)
    static let surfaceElevated = Color(hex: 0x153044)
    static let surfaceHigh = Color(hex: 0x1B3B53)

    static let hairline = Color.white.opacity(0.07)
    static let hairlineStrong = Color.white.opacity(0.12)

    // MARK: Text
    static let ink = Color(hex: 0xF4F7F9)
    static let inkSoft = Color(hex: 0x91A4B5)
    static let inkMuted = Color(hex: 0x667A8A)

    // MARK: Brand scales
    static let navy950 = Color(hex: 0x04131F)
    static let navy900 = Color(hex: 0x071E33)

    static let mint300 = Color(hex: 0x6FDFBD)
    static let mint400 = Color(hex: 0x2EE6B0)
    static let mint500 = Color(hex: 0x24C79A)
    static let mint600 = Color(hex: 0x12A67D)

    static let tangerine300 = Color(hex: 0xFFB689)
    static let tangerine400 = Color(hex: 0xFF9660)
    static let tangerine500 = Color(hex: 0xFF7A3D)

    static let grape300 = Color(hex: 0xD0A6FB)
    static let grape400 = Color(hex: 0xB877F5)
    static let grape500 = Color(hex: 0xA855F7)

    static let aqua300 = Color(hex: 0x8ADEF2)
    static let aqua400 = Color(hex: 0x4FD0ED)
    static let aqua500 = Color(hex: 0x23BBE0)

    static let roseEmber300 = Color(hex: 0xF98FB6)
    static let roseEmber400 = Color(hex: 0xF2639A)
    static let roseEmber500 = Color(hex: 0xE93B7D)

    // MARK: Radii (Tailwind rem × 16)
    enum Radius {
        static let lg: CGFloat = 8
        static let xl: CGFloat = 12
        static let xxl: CGFloat = 16      // rounded-2xl
        static let card: CGFloat = 24     // --radius-card / rounded-[1.5rem]
        static let xl2: CGFloat = 28      // --radius-xl2 / rounded-[1.75rem]
    }

    // MARK: Spacing
    /// The page gutter the web app uses everywhere (`px-5`).
    static let gutter: CGFloat = 20
}

// MARK: - Shadows

/// The CSS shadows, each a pair of layers like their `box-shadow` values.
enum ShadowStyle {
    /// `--shadow-soft`
    case soft
    /// `--shadow-lift`
    case lift
    /// `--shadow-float`
    case float
    /// `--shadow-mint`, the glow under mint buttons
    case mint
}

private struct LayeredShadow: ViewModifier {
    let style: ShadowStyle

    func body(content: Content) -> some View {
        switch style {
        case .soft:
            content
                .shadow(color: .black.opacity(0.30), radius: 1, x: 0, y: 1)
                .shadow(color: .black.opacity(0.55), radius: 12, x: 0, y: 8)
        case .lift:
            content
                .shadow(color: .black.opacity(0.40), radius: 3, x: 0, y: 2)
                .shadow(color: .black.opacity(0.65), radius: 20, x: 0, y: 16)
        case .float:
            content
                .shadow(color: .black.opacity(0.55), radius: 12, x: 0, y: 8)
                .shadow(color: .black.opacity(0.75), radius: 32, x: 0, y: 32)
        case .mint:
            content
                .shadow(color: Theme.mint500.opacity(0.55), radius: 15, x: 0, y: 10)
        }
    }
}

extension View {
    func snatzeeShadow(_ style: ShadowStyle) -> some View {
        modifier(LayeredShadow(style: style))
    }
}

// MARK: - Hex colours

extension Color {
    /// `Color(hex: 0x24C79A)` — the same notation as the CSS tokens.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
