import SwiftUI

/// The signed-in app: one screen per tab, with the floating navigation
/// over the bottom of every one of them.
struct MainTabView: View {
    let profile: Profile

    @State private var selection: AppTab = .home
    @State private var home = HomeModel()
    @State private var game = GameCoordinator()
    @State private var paths: [AppTab: [AppRoute]] = [:]
    @State private var links = DeepLinks.shared
    @State private var push = PushManager.shared
    @State private var connectivity = Connectivity.shared
    @Environment(SessionStore.self) private var session

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            ForEach(AppTab.allCases) { tab in
                // Every tab stays alive (and keeps its scroll position),
                // like switching tabs in a native tab bar.
                NavigationStack(path: path(for: tab)) { screen(for: tab).appRoutes(profile: profile) }
                    // The floating bar covers the bottom of every screen:
                    // scrolled all the way down, content must end above it.
                    .contentMargins(.bottom, BottomNavigation.reservedHeight, for: .scrollContent)
                    .opacity(selection == tab ? 1 : 0)
                    .allowsHitTesting(selection == tab)
            }
        }
        .overlay(alignment: .bottom) {
            if !connectivity.isOnline {
                OfflineBanner()
                    .padding(.bottom, BottomNavigation.reservedHeight + 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: connectivity.isOnline)
        .overlay(alignment: .bottom) {
            BottomNavigation(
                selection: $selection,
                friendRequests: home.summary?.pendingFriendRequests ?? 0
            ) { game.addGame() }
        }
        .sheet(item: $game.sheet) { request in
            ScoreSheetView(entry: request.entry) { result in
                game.saved(result, isEdit: request.entry != nil)
            }
            .presentationBackground(Theme.canvasSoft)
            .presentationCornerRadius(Theme.Radius.xl2)
        }
        .overlay {
            // Above the tab bar and everything else, like the website's.
            if let celebration = game.celebration {
                CelebrationOverlay(celebration: celebration) {
                    withAnimation(.easeOut(duration: 0.22)) { game.dismissCelebration() }
                }
                .transition(.opacity)
                .id(celebration.id)
            } else if let achievement = game.unlockQueue.first {
                AchievementUnlockView(achievement: achievement, remaining: game.unlockQueue.count - 1) {
                    withAnimation(.easeOut(duration: 0.2)) { game.advanceUnlocks() }
                }
                .transition(.opacity)
                .id(achievement.id)
            }
        }
        .environment(game)
        // Keeps this device's push token current on the server.
        .task { await PushManager.shared.refresh() }
        .onChange(of: game.dataVersion) {
            Task { await home.load(userId: profile.id) }
        }
        // Back online: everything on screen may be stale or failed to
        // load, so reload it all (and the profile, if it came from the
        // offline copy).
        .onChange(of: connectivity.isOnline) { _, online in
            guard online else { return }
            Task { await session.reloadIfOffline() }
            game.dataChanged()
        }
        // Universal links and tapped notifications.
        .onChange(of: push.pendingPath, initial: true) { _, path in
            guard let path else { return }
            push.pendingPath = nil
            links.open(path: path)
        }
        .onChange(of: links.pending, initial: true) { _, destination in
            guard let destination else { return }
            links.pending = nil
            follow(destination)
        }
    }

    private func path(for tab: AppTab) -> Binding<[AppRoute]> {
        Binding(get: { paths[tab] ?? [] }, set: { paths[tab] = $0 })
    }

    private func follow(_ destination: DeepLinks.Destination) {
        game.sheet = nil
        if destination.onCurrentTab {
            // A player's profile: on top of what is showing, unless it is
            // already there.
            if paths[selection]?.last != destination.routes.last {
                paths[selection, default: []].append(contentsOf: destination.routes)
            }
            return
        }
        selection = destination.tab
        paths[destination.tab] = destination.routes
    }

    @ViewBuilder
    private func screen(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeView(
                profile: profile,
                model: home,
                onAddGame: { game.addGame() },
                onOpenProfile: { selection = .profile }
            )
        case .rankings:
            RankingsView()
        case .friends:
            FriendsView(profile: profile)
        case .profile:
            ProfileView(profile: profile)
        }
    }
}
