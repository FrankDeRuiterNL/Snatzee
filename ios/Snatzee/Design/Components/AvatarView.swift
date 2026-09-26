import SwiftUI

/// The web app's `<Avatar>`: a round photo, or initials on a raised navy
/// disc when there is none (or it fails to load).
struct AvatarView: View {
    enum Size {
        case xs, sm, md, lg, xl

        var points: CGFloat {
            switch self {
            case .xs: 32
            case .sm: 40
            case .md: 48
            case .lg: 64
            case .xl: 96
            }
        }

        var fontSize: CGFloat {
            switch self {
            case .xs: 10.4
            case .sm: TextSize.xs
            case .md: TextSize.sm
            case .lg: TextSize.base
            case .xl: TextSize.xl
            }
        }
    }

    let url: URL?
    let name: String?
    var size: Size = .md
    var ring = true

    var body: some View {
        ZStack {
            Circle().fill(Theme.surfaceHigh)
            if let url {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initialsView
                    }
                }
            } else {
                initialsView
            }
        }
        .frame(width: size.points, height: size.points)
        .clipShape(Circle())
        .overlay {
            if ring { Circle().strokeBorder(.white.opacity(0.10), lineWidth: 2) }
        }
        .accessibilityElement()
        .accessibilityLabel(name.map { "Profielfoto van \($0)" } ?? "Profielfoto")
    }

    private var initialsView: some View {
        Text(Initials.of(name))
            .font(.jakarta(size.fontSize, .bold))
            .foregroundStyle(Theme.inkSoft)
    }
}

enum Initials {
    /// Same rule as `initials()` in lib/utils.ts.
    static func of(_ name: String?) -> String {
        let parts = (name ?? "").split(whereSeparator: \.isWhitespace)
        guard let first = parts.first else { return "?" }
        if parts.count == 1 { return String(first.prefix(2)).uppercased() }
        return "\(first.prefix(1))\(parts[1].prefix(1))".uppercased()
    }
}
