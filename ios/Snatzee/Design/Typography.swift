import SwiftUI

/// Plus Jakarta Sans, the web app's typeface, in the weights it uses.
///
/// Tailwind's `font-black` (900) has no Jakarta cut; browsers render it
/// with ExtraBold, and so does this.
enum JakartaWeight {
    case regular, medium, semibold, bold, extrabold, black

    var postScriptName: String {
        switch self {
        case .regular: "PlusJakartaSans-Regular"
        case .medium: "PlusJakartaSans-Medium"
        case .semibold: "PlusJakartaSans-SemiBold"
        case .bold: "PlusJakartaSans-Bold"
        case .extrabold, .black: "PlusJakartaSans-ExtraBold"
        }
    }
}

extension Font {
    /// A Jakarta font at a CSS pixel size, scaling with Dynamic Type from
    /// the body style like the system fonts do.
    static func jakarta(_ size: CGFloat, _ weight: JakartaWeight = .regular) -> Font {
        .custom(weight.postScriptName, size: size, relativeTo: .body)
    }
}

/// Tailwind's text sizes, in points (1rem = 16).
enum TextSize {
    static let xs10: CGFloat = 10     // text-[0.625rem]
    static let xs: CGFloat = 12       // text-xs
    static let sm: CGFloat = 14       // text-sm
    static let base15: CGFloat = 15.2 // text-[0.95rem]
    static let base: CGFloat = 16     // text-base
    static let lg: CGFloat = 18       // text-lg
    static let xl: CGFloat = 20       // text-xl
    static let xxl: CGFloat = 24      // text-2xl
    static let xxxl: CGFloat = 30     // text-3xl
    static let xxxxl: CGFloat = 36    // text-4xl
}

extension View {
    /// `tracking-tight`: -0.025em.
    func trackingTight(_ size: CGFloat) -> some View {
        tracking(size * -0.025)
    }
}
