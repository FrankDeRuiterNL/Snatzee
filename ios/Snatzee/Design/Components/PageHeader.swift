import SwiftUI

/// Big bold page title with an optional subtitle, as on every web page.
struct PageHeader: View {
    let title: String
    var subtitle: String?
    /// A button on the right, level with the title (Profiel's settings).
    var trailing: AnyView?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.jakarta(TextSize.xxxl, .black))
                    .trackingTight(TextSize.xxxl)
                    .foregroundStyle(Theme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(.jakarta(TextSize.base15))
                        .foregroundStyle(Theme.inkSoft)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let trailing { trailing }
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, 20)
        .padding(.bottom, 16)
    }
}
