import SwiftUI

/// The web app's Lucide icons, exported into Icons.xcassets by
/// `scripts/generate-ios-icons.mjs` so both platforms draw the same glyphs.
///
///     LucideIcon("house", size: 20).foregroundStyle(Theme.mint400)
struct LucideIcon: View {
    let name: String
    var size: CGFloat = 20

    init(_ name: String, size: CGFloat = 20) {
        self.name = name
        self.size = size
    }

    var body: some View {
        Image("lucide.\(name)")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
