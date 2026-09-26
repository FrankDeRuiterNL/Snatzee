import SwiftUI

/// The signed-in app: one screen per tab, with the floating navigation
/// over the bottom of every one of them.
struct MainTabView: View {
    let profile: Profile

    @State private var selection: AppTab = .home
    @State private var showingSettings = false
    @State private var home = HomeModel()
    @State private var game = GameCoordinator()

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            ForEach(AppTab.allCases) { tab in
                // Every tab stays alive (and keeps its scroll position),
                // like switching tabs in a native tab bar.
                NavigationStack { screen(for: tab).appRoutes(profile: profile) }
                    // The floating bar covers the bottom of every screen:
                    // scrolled all the way down, content must end above it.
                    .contentMargins(.bottom, BottomNavigation.reservedHeight, for: .scrollContent)
                    .opacity(selection == tab ? 1 : 0)
                    .allowsHitTesting(selection == tab)
            }
        }
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
        .onChange(of: game.dataVersion) {
            Task { await home.load(userId: profile.id) }
        }
        .sheet(isPresented: $showingSettings) {
            InterimSettingsSheet(profile: profile)
                .presentationDetents([.medium])
                .presentationBackground(Theme.canvasSoft)
                .presentationCornerRadius(Theme.Radius.xl2)
        }
    }

    @ViewBuilder
    private func screen(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeView(
                profile: profile,
                model: home,
                onAddGame: { game.addGame() },
                onOpenProfile: { selection = .profile },
                onOpenSettings: { showingSettings = true }
            )
        case .rankings:
            RankingsView()
        default:
            PlaceholderScreen(tab: tab)
        }
    }
}

/// Stand-in screens until the features arrive in steps 3 and 4.
private struct PlaceholderScreen: View {
    let tab: AppTab

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                PageHeader(title: tab.label, subtitle: "Komt in een volgende stap")
                EmptyStateView(emoji: "🛠️", title: "In aanbouw", description: "Dit scherm staat al op de website en komt binnenkort ook hier.")
                    .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Account basics until the full settings screen arrives in step 4.
private struct InterimSettingsSheet: View {
    let profile: Profile
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var signingOut = false

    var body: some View {
        VStack(spacing: 16) {
            AvatarView(url: profile.avatarURL, name: profile.displayName, size: .lg)
            VStack(spacing: 2) {
                Text(profile.displayName)
                    .font(.jakarta(TextSize.lg, .extrabold))
                    .foregroundStyle(Theme.ink)
                Text("@\(profile.username)")
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
            }
            Button {
                Task {
                    signingOut = true
                    await session.signOut()
                    dismiss()
                }
            } label: {
                HStack(spacing: 8) {
                    LucideIcon("log-out", size: 18)
                    Text("Uitloggen")
                }
            }
            .buttonStyle(.snatzee(.dangerSoft, size: .lg, full: true, loading: signingOut))
            Text("Snatzee! \(AppConfig.versionString)")
                .font(.jakarta(TextSize.xs))
                .foregroundStyle(Theme.inkMuted)
        }
        .padding(24)
    }
}
