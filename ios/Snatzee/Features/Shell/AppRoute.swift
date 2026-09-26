import SwiftUI

/// Screens that are pushed onto a tab's navigation stack, from anywhere.
enum AppRoute: Hashable {
    enum HistoryFilter: String, Hashable { case all, won, lost }

    case history(HistoryFilter)
    case statistics
    case achievements
}

private struct AppRoutes: ViewModifier {
    let profile: Profile

    func body(content: Content) -> some View {
        content.navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .history(let filter): HistoryView(profile: profile, initialFilter: filter)
            case .statistics: StatisticsView(profile: profile)
            case .achievements: AchievementsView(profile: profile)
            }
        }
    }
}

extension View {
    func appRoutes(profile: Profile) -> some View { modifier(AppRoutes(profile: profile)) }
}

/// The round back button every pushed screen has, instead of the system
/// navigation bar — the website's PageHeader with backHref.
struct BackHeader: View {
    let title: String
    var subtitle: String?
    var trailing: AnyView?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                RoundIconButton(icon: "chevron-left", label: "Terug") { dismiss() }
                Spacer()
                if let trailing { trailing }
            }
            PageHeader(title: title, subtitle: subtitle)
                .padding(.horizontal, -Theme.gutter)
                .padding(.top, -4)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, 12)
    }
}
