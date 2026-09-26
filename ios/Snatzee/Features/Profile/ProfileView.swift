import SwiftUI

/// The Profile tab — the website's /app/profile.
struct ProfileView: View {
    let profile: Profile

    @Environment(GameCoordinator.self) private var game

    @State private var stats: UserStatistics?
    @State private var achievements: [Achievement] = []
    @State private var friendCount = 0
    @State private var groupCount = 0
    @State private var loaded = false

    private struct GroupId: Decodable { let id: UUID }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                HStack {
                    Spacer()
                    NavigationLink(value: AppRoute.settings) {
                        LucideIcon("settings", size: 20)
                            .foregroundStyle(Theme.inkSoft)
                            .frame(width: 44, height: 44)
                            .background(Theme.surface, in: Circle())
                            .overlay(Circle().strokeBorder(Theme.hairline, lineWidth: 1))
                            .snatzeeShadow(.soft)
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel("Instellingen")
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.top, 12)

                ProfileHeaderCard(
                    displayName: profile.displayName,
                    username: profile.username,
                    avatarURL: profile.avatarURL,
                    bio: profile.bio,
                    stats: stats,
                    friendCount: friendCount
                ) {
                    NavigationLink(value: AppRoute.publicProfile(profile.username)) {
                        Text("Bekijk publiek profiel")
                    }
                    .buttonStyle(.snatzee(.soft, size: .sm, full: true))
                }
                .padding(.horizontal, Theme.gutter)

                if let stats { LevelCard(stats: stats).padding(.horizontal, Theme.gutter) }

                AchievementPreview(achievements: achievements).padding(.horizontal, Theme.gutter)

                VStack(spacing: 8) {
                    let games = stats?.gamesPlayed ?? 0
                    link(.history(.all), icon: "rotate-ccw-clock", accent: .aqua, title: "Scorehistorie",
                         subtitle: "\(games) \(Formatting.pluralize(games, "potje", "potjes"))")
                    link(.statistics, icon: "chart-column", accent: .mint, title: "Statistieken",
                         subtitle: "Grafieken, gemiddelden en records")
                    link(.friends, icon: "users", accent: .tangerine, title: "Vrienden",
                         subtitle: "\(friendCount) \(Formatting.pluralize(friendCount, "vriend", "vrienden"))")
                    link(.groups, icon: "users-round", accent: .grape, title: "Groepen",
                         subtitle: "\(groupCount) \(Formatting.pluralize(groupCount, "groep", "groepen"))")
                }
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !loaded { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
    }

    private func link(_ route: AppRoute, icon: String, accent: Accent, title: String, subtitle: String) -> some View {
        NavigationLink(value: route) {
            NavCard(icon: icon, accent: accent, title: title, subtitle: subtitle)
        }
        .buttonStyle(.pressable)
    }

    private func load() async {
        let id = profile.id.uuidString
        async let stats = try? API.rows(UserStatistics.self) {
            $0.from("user_statistics").select().eq("user_id", value: id).limit(1)
        }
        async let achievements = try? AchievementStore.load(userId: profile.id)
        async let overview = try? API.rpc("get_friends_overview", as: FriendsOverview.self)
        async let groups = try? API.rows(GroupId.self) { $0.from("groups").select("id") }

        self.stats = await stats??.first
        self.achievements = await achievements ?? []
        self.friendCount = await overview?.friends.count ?? 0
        self.groupCount = await groups?.count ?? 0
        loaded = true
    }
}
