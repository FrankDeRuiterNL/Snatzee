import SwiftUI
import Supabase

/// The Ranking tab — the website's /app/rankings.
struct RankingsView: View {
    @Environment(GameCoordinator.self) private var game

    enum Scope: String, CaseIterable { case global, friends, group }

    enum Metric: String, CaseIterable {
        case highestScore = "highest_score"
        case averageScore = "average_score"
        case gamesPlayed = "games_played"
        case wins
        case yahtzeeCount = "yahtzee_count"
        case firstRollYahtzeeCount = "first_roll_yahtzee_count"

        var label: String {
            switch self {
            case .highestScore: "Score"
            case .averageScore: "Gemiddelde"
            case .gamesPlayed: "Potjes"
            case .wins: "Wins"
            case .yahtzeeCount: "Yahtzee"
            case .firstRollYahtzeeCount: "1 worp"
            }
        }

        var title: String {
            switch self {
            case .highestScore: "Hoogste score ooit"
            case .averageScore: "Hoogste gemiddelde score"
            case .gamesPlayed: "Meeste gespeelde potjes"
            case .wins: "Meeste overwinningen"
            case .yahtzeeCount: "Meeste Yahtzee's"
            case .firstRollYahtzeeCount: "Meeste Yahtzee's in één worp"
            }
        }

        var decimals: Int { self == .averageScore ? 1 : 0 }
    }

    struct Row: Decodable, Identifiable, Equatable {
        let rank: Int
        let userId: UUID
        let username: String
        let displayName: String
        let avatarUrl: String?
        let value: Double
        let gamesPlayed: Int
        let isCurrentUser: Bool
        var id: UUID { userId }
    }

    private struct GroupOption: Decodable, Identifiable, Hashable {
        let id: UUID
        let name: String
        let emoji: String?
    }

    @State private var metric: Metric = .highestScore
    @State private var scope: Scope = .global
    @State private var groupId: UUID?
    @State private var groups: [GroupOption] = []
    @State private var minGames = 5
    @State private var result: (key: String, rows: [Row], error: String?)?

    private var queryKey: String { "\(metric.rawValue)|\(scope.rawValue)|\(scope == .group ? groupId?.uuidString ?? "" : "")|\(game.dataVersion)" }

    var body: some View {
        let current = result?.key == queryKey ? result : nil
        let rows = current?.rows
        let me = rows?.first { $0.isCurrentUser }
        let visible = Array(rows?.prefix(50) ?? [])
        let showStickyMe = me.map { mine in !visible.contains { $0.isCurrentUser && $0.rank <= 50 } && mine.rank > 0 } ?? false

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Ranglijsten", subtitle: "Wie is er echt goed met de dobbelstenen?")

                Segmented(
                    options: [(value: Scope.global, label: "Wereldwijd"), (value: .friends, label: "Vrienden"), (value: .group, label: "Groep")],
                    selection: Binding(get: { scope }, set: { next in
                        guard next == .group, groups.isEmpty else {
                            scope = next
                            return
                        }
                        // No groups known (yet): look again before saying so.
                        Task {
                            await loadGroups(reportErrors: true)
                            if groups.isEmpty {
                                ToastCenter.shared.info("Je zit nog in geen groep", description: "Maak of join een groep via Vrienden → Groepen.")
                            } else {
                                scope = .group
                            }
                        }
                    })
                )
                .padding(.horizontal, Theme.gutter)

                if scope == .group && !groups.isEmpty {
                    ChipScroller(
                        options: groups.map { (value: $0.id, label: "\($0.emoji ?? "🎲") \($0.name)") },
                        selection: Binding(get: { groupId ?? groups[0].id }, set: { groupId = $0 })
                    )
                }

                ChipScroller(options: Metric.allCases.map { (value: $0, label: $0.label) }, selection: $metric)

                VStack(alignment: .leading, spacing: 4) {
                    Text(metric.title)
                        .font(.jakarta(TextSize.lg, .extrabold))
                        .trackingTight(TextSize.lg)
                        .foregroundStyle(Theme.ink)
                    if metric == .averageScore {
                        HStack(spacing: 6) {
                            LucideIcon("info", size: 16)
                            Text("Minimaal \(minGames) potjes nodig")
                        }
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                    }
                }
                .padding(.horizontal, Theme.gutter)

                Group {
                    if rows == nil {
                        ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 32)
                    } else if let error = current?.error {
                        EmptyStateView(emoji: "⚠️", title: "Ranglijst kon niet laden", description: error)
                    } else if visible.isEmpty {
                        EmptyStateView(emoji: "🏆", title: "Nog niets te ranken", description: emptyText)
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(visible) { row in LeaderboardRowView(row: row, decimals: metric.decimals) }
                        }
                    }
                }
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, showStickyMe ? 96 : 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load(force: true) }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .bottom) {
            if showStickyMe, let me {
                LeaderboardRowView(row: me, decimals: metric.decimals)
                    .padding(4)
                    .background(Theme.canvas.opacity(0.8), in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                    .padding(.horizontal, Theme.gutter)
                    // Just above the floating tab bar.
                    .padding(.bottom, BottomNavigation.reservedHeight - 8)
            }
        }
        .task { await loadGroups(reportErrors: true) }
        .task(id: queryKey) { await load() }
    }

    private var emptyText: String {
        switch scope {
        case .friends: "Voeg vrienden toe om jullie cijfers naast elkaar te zien."
        case .group: "Zodra groepsleden potjes registreren verschijnt hier de ranglijst."
        case .global: "Er zijn nog geen scores geregistreerd voor deze categorie."
        }
    }

    private func loadGroups(reportErrors: Bool = false) async {
        do {
            groups = try await API.rows(GroupOption.self) {
                $0.from("groups").select("id, name, emoji").order("created_at", ascending: false)
            }
        } catch {
            // Said out loud: a silent failure here looked like "Groep does
            // nothing".
            if reportErrors {
                ToastCenter.shared.error("Groepen laden is niet gelukt", description: API.translate(error).localizedDescription)
            }
        }
        if groupId == nil || !groups.contains(where: { $0.id == groupId }) { groupId = groups.first?.id }
        if let value = try? await API.rpc(
            "app_setting_int",
            ["p_key": .string("min_games_for_average_ranking"), "p_default": .integer(5)],
            as: Int.self
        ) {
            minGames = value
        }
    }

    private func load(force: Bool = false) async {
        let key = queryKey
        if !force, result?.key == key { return }
        if scope == .group && (groupId ?? groups.first?.id) == nil {
            result = (key, [], nil)
            return
        }
        var params: [String: AnyJSON] = [
            "p_metric": .string(metric.rawValue),
            "p_scope": .string(scope.rawValue),
            "p_limit": .integer(50),
        ]
        if scope == .group, let id = groupId ?? groups.first?.id {
            params["p_group_id"] = .string(id.uuidString)
        }
        do {
            let rows = try await API.rpc("get_leaderboard", params, as: [Row].self)
            guard key == queryKey else { return }
            result = (key, rows, nil)
        } catch {
            guard key == queryKey else { return }
            result = (key, [], API.translate(error).localizedDescription)
        }
    }
}

/// `<LeaderboardRow>`
struct LeaderboardRowView: View {
    let row: RankingsView.Row
    var decimals = 0

    var body: some View {
        let mine = row.isCurrentUser

        HStack(spacing: 12) {
            Text("\(row.rank)")
                .font(.jakarta(TextSize.sm, .extrabold))
                .monospacedDigit()
                .foregroundStyle(mine ? .white : medal.foreground)
                .frame(width: 36, height: 36)
                .background(mine ? Theme.surface.opacity(0.10) : medal.background,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))

            AvatarView(url: row.avatarUrl.flatMap(URL.init(string:)), name: row.displayName, size: .sm)
                .overlay(alignment: .topTrailing) {
                    if row.rank == 1 {
                        LucideIcon("crown", size: 16)
                            .foregroundStyle(Theme.tangerine400)
                            .rotationEffect(.degrees(12))
                            .offset(x: 4, y: -8)
                            .accessibilityLabel("Eerste plaats")
                    }
                }

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(row.displayName)
                        .font(.jakarta(TextSize.base, .bold))
                        .trackingTight(TextSize.base)
                        .foregroundStyle(mine ? .white : Theme.ink)
                        .lineLimit(1)
                    if mine {
                        Text("jij").font(.jakarta(TextSize.xs, .semibold)).foregroundStyle(Theme.mint400)
                    }
                }
                Text("@\(row.username)")
                    .font(.jakarta(TextSize.xs))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(Formatting.number(row.value, decimals: decimals))
                .font(.jakarta(TextSize.lg, .extrabold))
                .trackingTight(TextSize.lg)
                .monospacedDigit()
                .foregroundStyle(mine ? Theme.mint400 : Theme.ink)
        }
        .padding(12)
        .padding(.trailing, 4)
        .background(mine ? Theme.surfaceElevated : Theme.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .strokeBorder(mine ? Theme.hairlineStrong : Theme.hairline, lineWidth: 1)
        )
        .snatzeeShadow(mine ? .lift : .soft)
        .accessibilityElement(children: .combine)
    }

    private var medal: (background: Color, foreground: Color) {
        switch row.rank {
        case 1: (Theme.tangerine500.opacity(0.15), Theme.tangerine300)
        case 2: (.white.opacity(0.08), Theme.inkSoft)
        case 3: (Theme.grape500.opacity(0.15), Theme.grape300)
        default: (Theme.canvas, Theme.inkMuted)
        }
    }
}
