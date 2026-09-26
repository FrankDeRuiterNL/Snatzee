import SwiftUI

/// Home: the web app's /app page.
struct HomeView: View {
    let profile: Profile
    @Bindable var model: HomeModel
    let onAddGame: () -> Void
    let onOpenProfile: () -> Void
    let onOpenSettings: () -> Void

    @Environment(GameCoordinator.self) private var game
    @State private var confirmingFirstRoll = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header

                if let summary = model.summary {
                    HeroStatCard(summary: summary)
                    quickActions
                    if let insight = HomeInsight.build(summary: summary, achievements: model.achievements) {
                        InsightCard(text: insight.text)
                    }
                    statGrid(summary)
                    achievementsRow
                    RecentScoresSection(entries: model.recent, onAddGame: onAddGame, onOpen: { game.edit($0) })
                } else if let error = model.loadError {
                    EmptyStateView(emoji: "📡", title: "Laden is niet gelukt", description: error) {
                        Button("Opnieuw proberen") { Task { await model.load(userId: profile.id) } }
                            .buttonStyle(.snatzee(.primary, full: true))
                    }
                    .padding(.horizontal, Theme.gutter)
                } else {
                    ProgressView().tint(Theme.inkMuted).padding(.top, 60)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.load(userId: profile.id) }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !model.hasLoaded { await model.load(userId: profile.id) } }
        .alert("Yahtzee in 1 worp?", isPresented: $confirmingFirstRoll) {
            Button("Nee", role: .cancel) {}
            Button("Ja!") { Task { await game.recordFirstRollYahtzee() } }
        } message: {
            Text("Heb je in 1 worp Yahtzee gegooid?")
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onOpenProfile) {
                AvatarView(url: profile.avatarURL, name: profile.displayName, size: .md)
                    .snatzeeShadow(.soft)
            }
            .buttonStyle(.pressable)
            .accessibilityLabel("Naar je profiel")

            VStack(alignment: .leading, spacing: 4) {
                Text("Hey, \(Formatting.firstName(profile.displayName)) 👋")
                    .font(.jakarta(TextSize.xl, .extrabold))
                    .trackingTight(TextSize.xl)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if let level = model.stats?.levelName {
                    LevelChip(emoji: model.stats?.levelEmoji, name: level)
                } else {
                    Text("@\(profile.username)")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            RoundIconButton(icon: "settings", label: "Instellingen", action: onOpenSettings)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.top, 20)
    }

    // MARK: Quick actions

    private var quickActions: some View {
        VStack(spacing: 12) {
            Button {
                Haptics.play(.medium)
                onAddGame()
            } label: {
                HStack(spacing: 10) {
                    LucideIcon("plus", size: 24)
                    Text("Potje toevoegen")
                }
                .font(.jakarta(TextSize.lg, .extrabold))
                .trackingTight(TextSize.lg)
                .foregroundStyle(Theme.navy950)
                .frame(maxWidth: .infinity, minHeight: 64)
                .background(Theme.mint500, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                .snatzeeShadow(.mint)
            }
            .buttonStyle(.pressable)

            Button {
                Haptics.play(.medium)
                confirmingFirstRoll = true
            } label: {
                HStack(spacing: 10) {
                    LucideIcon("zap", size: 20).foregroundStyle(Theme.tangerine400)
                    Text("Yahtzee in 1 worp")
                }
                .font(.jakarta(TextSize.base15, .bold))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 56)
                .card(.elevated)
            }
            .buttonStyle(.pressable)
            .disabled(game.recordingFirstRoll)
            .opacity(game.recordingFirstRoll ? 0.6 : 1)
        }
        .padding(.horizontal, Theme.gutter)
    }

    // MARK: Stats

    private func statGrid(_ summary: HomeSummary) -> some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return VStack(spacing: 12) {
            LazyVGrid(columns: columns, spacing: 12) {
                StatCard(label: "Potjes", value: Formatting.number(summary.gamesPlayed), icon: "dice-5", accent: .navy)
                StatCard(label: "Gewonnen", value: Formatting.number(summary.wins),
                         hint: "\(Formatting.number(summary.winRate, decimals: 0))% winst", icon: "trophy", accent: .mint)
                StatCard(label: "Yahtzee's", value: Formatting.number(summary.yahtzeeCount),
                         hint: "\(Formatting.number(summary.firstRollYahtzeeCount)) in één worp", icon: "target", accent: .grape)
                StatCard(label: "Gemiddelde", value: average(summary.averageScore), icon: "trending-up", accent: .aqua)
            }
            StatCard(label: "Persoonlijk record",
                     value: summary.highestScore.map { Formatting.number($0) } ?? "—",
                     icon: "zap", accent: .tangerine)
        }
        .padding(.horizontal, Theme.gutter)
    }

    private func average(_ value: Double?) -> String {
        guard let value else { return "—" }
        return Formatting.number(value, decimals: value.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)
    }

    private var achievementsRow: some View {
        HStack(spacing: 16) {
            LucideIcon("award", size: 20)
                .foregroundStyle(Theme.mint400)
                .frame(width: 44, height: 44)
                .background(Theme.surface.opacity(0.10), in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Achievements")
                    .font(.jakarta(TextSize.base, .bold))
                    .trackingTight(TextSize.base)
                    .foregroundStyle(.white)
                Text("\(model.unlockedCount) van \(model.achievements.count) vrijgespeeld")
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
            }
            Spacer(minLength: 0)
            LucideIcon("chevron-right", size: 20).foregroundStyle(Theme.inkMuted)
        }
        .padding(16)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .snatzeeShadow(.soft)
        .padding(.horizontal, Theme.gutter)
    }
}

/// `<HeroStatCard>`: the big average with its month-on-month trend.
struct HeroStatCard: View {
    let summary: HomeSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Jouw gemiddelde")
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.inkMuted)
            Text(averageText)
                .font(.jakarta(56, .black))
                .trackingTight(56)
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.top, 4)
            HStack(spacing: 6) {
                LucideIcon(trendIcon, size: 16)
                Text(trendText)
            }
            .font(.jakarta(TextSize.sm, .semibold))
            .foregroundStyle(trendColor)
            .padding(.top, 12)

            HStack(spacing: 8) {
                miniStat("Potjes", Formatting.number(summary.gamesPlayed))
                miniStat("Gewonnen", Formatting.number(summary.wins))
                miniStat("Record", summary.highestScore.map { Formatting.number($0) } ?? "—")
            }
            .padding(.top, 24)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
        .snatzeeShadow(.lift)
        .padding(.horizontal, Theme.gutter)
    }

    private var averageText: String {
        guard let average = summary.averageScore else { return "—" }
        return Formatting.number(average, decimals: average.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)
    }

    private var delta: Double? {
        guard let now = summary.averageThisMonth, let before = summary.averageLastMonth else { return nil }
        return ((now - before) * 10).rounded() / 10
    }

    private var trendIcon: String {
        guard let delta, delta != 0 else { return "minus" }
        return delta > 0 ? "arrow-up-right" : "arrow-down-right"
    }

    private var trendColor: Color {
        guard let delta, delta != 0 else { return Theme.inkMuted }
        return delta > 0 ? Theme.mint400 : Theme.tangerine400
    }

    private var trendText: String {
        guard let delta else { return "Nog geen vergelijking met vorige maand" }
        if delta == 0 { return "Gelijk aan vorige maand" }
        let decimals = delta.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1
        return "\(delta > 0 ? "+" : "")\(Formatting.number(delta, decimals: decimals)) sinds vorige maand"
    }

    private func miniStat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.jakarta(TextSize.xl, .extrabold))
                .monospacedDigit()
                .foregroundStyle(.white)
            Text(label)
                .font(.jakarta(11.2, .semibold))
                .foregroundStyle(Theme.inkMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.surface.opacity(0.05), in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
    }
}

/// `<InsightCard>`
struct InsightCard: View {
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            LucideIcon("sparkles", size: 20)
                .foregroundStyle(Theme.mint400)
                .frame(width: 40, height: 40)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
                .snatzeeShadow(.soft)
            Text(text)
                .font(.jakarta(14.4, .semibold))
                .foregroundStyle(Theme.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(
            LinearGradient(colors: [Theme.mint500.opacity(0.20), Theme.surface], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .strokeBorder(Theme.mint500.opacity(0.30), lineWidth: 1)
        )
        .padding(.horizontal, Theme.gutter)
    }
}

/// `<RecentScores>`: the last games, grouped by day.
struct RecentScoresSection: View {
    let entries: [ScoreEntry]
    let onAddGame: () -> Void
    var onOpen: ((ScoreEntry) -> Void)?

    var body: some View {
        Group {
            if entries.isEmpty {
                EmptyStateView(
                    title: "Nog geen potjes gespeeld",
                    description: "Pak de dobbelstenen erbij en voeg na afloop je eerste score toe."
                ) {
                    Button("Eerste potje toevoegen", action: onAddGame)
                        .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Laatste potjes")
                        .font(.jakarta(TextSize.lg, .extrabold))
                        .trackingTight(TextSize.lg)
                        .foregroundStyle(Theme.ink)
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(groups, id: \.day) { group in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(group.day.uppercased())
                                    .font(.jakarta(TextSize.xs, .bold))
                                    .tracking(0.6)
                                    .foregroundStyle(Theme.inkMuted)
                                    .padding(.horizontal, 4)
                                ForEach(group.entries) { entry in
                                    Button { onOpen?(entry) } label: { ScoreEntryCard(entry: entry) }
                                        .buttonStyle(.pressable)
                                        .disabled(onOpen == nil)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.gutter)
    }

    private var groups: [(day: String, entries: [ScoreEntry])] {
        var result: [(day: String, entries: [ScoreEntry])] = []
        for entry in entries {
            let day = Formatting.playedAt(entry.playedAt)
            if let last = result.indices.last, result[last].day == day {
                result[last].entries.append(entry)
            } else {
                result.append((day, [entry]))
            }
        }
        return result
    }
}
