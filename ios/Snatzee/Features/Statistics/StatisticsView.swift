import SwiftUI

/// The website's /app/statistics.
struct StatisticsView: View {
    let profile: Profile

    @Environment(GameCoordinator.self) private var game

    @State private var stats: UserStatistics?
    @State private var summary: HomeSummary?
    @State private var scores: [ScoreEntry] = []
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                BackHeader(title: "Statistieken", subtitle: "Alles wat je cijfers te vertellen hebben.")

                if !loaded {
                    ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 40)
                } else if let stats, stats.gamesPlayed > 0 {
                    content(stats)
                } else {
                    EmptyStateView(
                        emoji: "📊",
                        title: "Nog geen statistieken",
                        description: "Zodra je je eerste potjes registreert verschijnen hier je cijfers en grafieken."
                    )
                    .padding(.horizontal, Theme.gutter)
                }
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

    @ViewBuilder
    private func content(_ stats: UserStatistics) -> some View {
        formCard(stats).padding(.horizontal, Theme.gutter)
        LevelCard(stats: stats).padding(.horizontal, Theme.gutter)

        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Scoreontwikkeling")
            ScoreChartView(scores: scores, average: stats.averageScore)
        }
        .padding(.horizontal, Theme.gutter)

        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Alle cijfers")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                StatCard(label: "Gespeelde potjes", value: Formatting.number(stats.gamesPlayed), icon: "dice-5", accent: .navy)
                StatCard(label: "Overwinningen", value: Formatting.number(stats.wins), icon: "trophy", accent: .mint)
                StatCard(label: "Winpercentage", value: "\(oneDecimal(stats.winRate ?? 0))%", icon: "percent", accent: .mint)
                StatCard(label: "Gemiddelde score", value: stats.averageScore.map(oneDecimal) ?? "—", icon: "trending-up", accent: .aqua)
                StatCard(label: "Hoogste score", value: stats.highestScore.map { Formatting.number($0) } ?? "—", icon: "arrow-up", accent: .tangerine)
                StatCard(label: "Laagste score", value: stats.lowestScore.map { Formatting.number($0) } ?? "—", icon: "arrow-down", accent: .rose)
                StatCard(label: "Yahtzee's", value: Formatting.number(stats.yahtzeeCount), icon: "target", accent: .grape)
                StatCard(label: "In één worp", value: Formatting.number(stats.firstRollYahtzeeCount), icon: "zap", accent: .tangerine)
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    private func formCard(_ stats: UserStatistics) -> some View {
        let last10 = summary?.averageLast10
        let delta: Double? = {
            guard let last10, let allTime = stats.averageScore else { return nil }
            return ((last10 - allTime) * 10).rounded() / 10
        }()

        return VStack(alignment: .leading, spacing: 0) {
            Text("Gemiddelde laatste 10 potjes")
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.inkMuted)
            Text(last10.map(oneDecimal) ?? "—")
                .font(.jakarta(48, .black))
                .trackingTight(48)
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.top, 4)
            if let delta {
                HStack(spacing: 6) {
                    LucideIcon(delta >= 0 ? "arrow-up" : "arrow-down", size: 16)
                    Text("\(delta >= 0 ? "+" : "")\(oneDecimal(delta)) t.o.v. je all-time gemiddelde")
                }
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(delta >= 0 ? Theme.mint400 : Theme.tangerine400)
                .padding(.top, 12)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
        .snatzeeShadow(.lift)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.jakarta(TextSize.lg, .extrabold))
            .trackingTight(TextSize.lg)
            .foregroundStyle(Theme.ink)
    }

    private func oneDecimal(_ value: Double) -> String {
        Formatting.number(value, decimals: value.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)
    }

    private func load() async {
        let id = profile.id.uuidString
        do {
            async let stats = API.rows(UserStatistics.self) {
                $0.from("user_statistics").select().eq("user_id", value: id).limit(1)
            }
            async let summary = API.rpc("get_home_summary", as: HomeSummary.self)
            async let scores = API.rows(ScoreEntry.self) {
                $0.from("score_entries").select()
                    .eq("user_id", value: id)
                    .order("played_at", ascending: false)
                    .order("created_at", ascending: false)
                    .limit(100)
            }
            self.stats = try await stats.first
            self.summary = try await summary
            self.scores = try await scores
        } catch {
            ToastCenter.shared.error("Laden is niet gelukt", description: API.translate(error).localizedDescription)
        }
        loaded = true
    }
}
