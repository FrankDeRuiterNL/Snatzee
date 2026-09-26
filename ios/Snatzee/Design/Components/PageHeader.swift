import SwiftUI

/// Big bold page title with an optional subtitle, as on every web page.
struct PageHeader: View {
    let title: String
    var subtitle: String?

    var body: some View {
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
        .padding(.horizontal, Theme.gutter)
        .padding(.top, 20)
        .padding(.bottom, 16)
    }
}
