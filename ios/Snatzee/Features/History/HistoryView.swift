import SwiftUI
import Supabase

/// Every game — the website's /app/history.
struct HistoryView: View {
    let profile: Profile

    @Environment(GameCoordinator.self) private var game

    enum Sort: String, CaseIterable {
        case newest, oldest, highest, lowest
        var label: String {
            switch self {
            case .newest: "Nieuwste"
            case .oldest: "Oudste"
            case .highest: "Hoogste"
            case .lowest: "Laagste"
            }
        }
    }

    private static let limit = 500

    @State private var filter: AppRoute.HistoryFilter
    @State private var sort: Sort = .newest
    @State private var entries: [ScoreEntry] = []
    @State private var total = 0
    @State private var loaded = false
    @State private var sortOpen = false
    @State private var detail: ScoreEntry?
    @State private var confirmDelete = false

    init(profile: Profile, initialFilter: AppRoute.HistoryFilter = .all) {
        self.profile = profile
        _filter = State(initialValue: initialFilter)
    }

    private var visible: [ScoreEntry] {
        let filtered = entries.filter {
            switch filter {
            case .all: true
            case .won: $0.isWin
            case .lost: !$0.isWin
            }
        }
        switch sort {
        case .newest: return filtered.sorted { $0.playedAt > $1.playedAt }
        case .oldest: return filtered.sorted { $0.playedAt < $1.playedAt }
        case .highest: return filtered.sorted { $0.score > $1.score }
        case .lowest: return filtered.sorted { $0.score < $1.score }
        }
    }

    private var subtitle: String {
        total > entries.count
            ? "\(total) potjes geregistreerd · laatste \(entries.count) hieronder"
            : "\(total) \(Formatting.pluralize(total, "potje", "potjes")) geregistreerd"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BackHeader(title: "Historie", subtitle: loaded ? subtitle : " ")

                HStack(spacing: 8) {
                    Segmented(options: [(value: AppRoute.HistoryFilter.all, label: "Alles"), (value: .won, label: "Gewonnen"), (value: .lost, label: "Verloren")], selection: $filter)
                    Button {
                        Haptics.play(.light)
                        sortOpen = true
                    } label: {
                        LucideIcon("arrow-up-down", size: 20)
                            .foregroundStyle(Theme.inkSoft)
                            .frame(width: 48, height: 48)
                            .background(Theme.surface, in: Circle())
                            .overlay(Circle().strokeBorder(Theme.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel("Sorteren: \(sort.label)")
                }
                .padding(.horizontal, Theme.gutter)

                content.padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !loaded { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
        .sheet(isPresented: $sortOpen) { sortSheet }
        .sheet(item: $detail) { entry in detailSheet(entry) }
    }

    @ViewBuilder
    private var content: some View {
        if !loaded {
            ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 40)
        } else if visible.isEmpty {
            EmptyStateView(
                title: filter == .all ? "Nog geen potjes" : "Niets gevonden",
                description: filter == .all
                    ? "Pak de dobbelstenen erbij en voeg na afloop je eerste score toe."
                    : "Er zijn geen potjes die aan dit filter voldoen."
            ) {
                if filter == .all {
                    Button("Eerste potje toevoegen") { game.addGame() }
                        .buttonStyle(.snatzee(.primary, full: true))
                }
            }
        } else if sort == .highest || sort == .lowest {
            // Day grouping only makes sense while the list is in date order.
            VStack(spacing: 8) {
                ForEach(visible) { entry in card(entry) }
            }
        } else {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(grouped, id: \.day) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(group.day.uppercased())
                                .font(.jakarta(TextSize.xs, .bold))
                                .tracking(0.6)
                            Spacer()
                            Text("\(group.entries.count)×")
                                .font(.jakarta(TextSize.xs, .semibold))
                                .monospacedDigit()
                        }
                        .foregroundStyle(Theme.inkMuted)
                        .padding(.horizontal, 4)
                        ForEach(group.entries) { entry in card(entry) }
                    }
                }
            }
        }
    }

    private func card(_ entry: ScoreEntry) -> some View {
        Button { detail = entry } label: { ScoreEntryCard(entry: entry) }
            .buttonStyle(.pressable)
    }

    private var grouped: [(day: String, entries: [ScoreEntry])] {
        var result: [(day: String, entries: [ScoreEntry])] = []
        for entry in visible {
            let day = Formatting.playedAt(entry.playedAt)
            if let last = result.indices.last, result[last].day == day {
                result[last].entries.append(entry)
            } else {
                result.append((day, [entry]))
            }
        }
        return result
    }

    // MARK: Sheets

    private var sortSheet: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sorteren")
                .font(.jakarta(TextSize.xl, .extrabold))
                .foregroundStyle(Theme.ink)
            Text("Kies de volgorde van je scorehistorie.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkMuted)
                .padding(.bottom, 8)
            ForEach(Sort.allCases, id: \.self) { option in
                Button {
                    Haptics.play(.light)
                    sort = option
                    sortOpen = false
                } label: {
                    Text(option.label)
                        .font(.jakarta(TextSize.base, .semibold))
                        .foregroundStyle(sort == option ? .white : Theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                        .padding(.horizontal, 16)
                        .background(
                            sort == option ? Theme.surfaceElevated : Theme.surface,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                                .strokeBorder(sort == option ? Theme.hairlineStrong : Theme.hairline, lineWidth: 1)
                        )
                }
                .buttonStyle(.pressable)
                .accessibilityAddTraits(sort == option ? .isSelected : [])
            }
        }
        .padding(24)
        .presentationDetents([.height(420)])
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
    }

    private func detailSheet(_ entry: ScoreEntry) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(entry.score) punten")
                        .font(.jakarta(TextSize.xl, .extrabold))
                        .foregroundStyle(Theme.ink)
                    Text("\(Formatting.playedAt(entry.playedAt)) om \(Formatting.time(entry.playedAt))")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                }

                VStack(spacing: 8) {
                    Text(Formatting.number(entry.score))
                        .font(.jakarta(60, .black))
                        .trackingTight(60)
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                    Text(entry.isWin ? "🏆 Gewonnen" : "🎲 Niet gewonnen")
                        .font(.jakarta(TextSize.sm, .bold))
                        .foregroundStyle(entry.isWin ? Theme.mint300 : Theme.inkSoft)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(entry.isWin ? Theme.mint500.opacity(0.15) : Theme.canvas, in: Capsule())
                }
                .frame(maxWidth: .infinity)
                .padding(24)
                .card(.surface)

                if let sheet = entry.sheet, ScoreSheet.isValid(sheet) {
                    SheetBreakdownView(entries: sheet, yahtzees: entry.yahtzeeCount, score: entry.score)
                }

                if let note = entry.note, !note.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("NOTITIE")
                            .font(.jakarta(TextSize.xs, .bold))
                            .tracking(0.6)
                            .foregroundStyle(Theme.inkMuted)
                        Text(note)
                            .font(.jakarta(TextSize.base15))
                            .foregroundStyle(Theme.inkSoft)
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .card(.surface, radius: Theme.Radius.xxl)
                }
            }
            .padding(24)
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 8) {
                Button {
                    detail = nil
                    game.edit(entry)
                } label: {
                    HStack(spacing: 8) { LucideIcon("pencil", size: 16); Text("Bewerken") }
                }
                .buttonStyle(.snatzee(.soft, size: .lg, full: true))
                Button { confirmDelete = true } label: {
                    HStack(spacing: 8) { LucideIcon("trash", size: 16); Text("Verwijderen") }
                }
                .buttonStyle(.snatzee(.dangerSoft, size: .lg, full: true))
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Theme.canvasSoft)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
        .alert("Potje verwijderen?", isPresented: $confirmDelete) {
            Button("Annuleren", role: .cancel) {}
            Button("Ja, verwijderen", role: .destructive) { Task { await delete(entry) } }
        } message: {
            Text("Dit potje verdwijnt uit je historie en telt niet meer mee in je statistieken en ranglijsten. Dit kan niet ongedaan worden gemaakt.")
        }
    }

    // MARK: Data

    private func load() async {
        let id = profile.id.uuidString
        do {
            async let rows = API.rows(ScoreEntry.self) {
                $0.from("score_entries").select()
                    .eq("user_id", value: id)
                    .order("played_at", ascending: false)
                    .order("created_at", ascending: false)
                    .limit(Self.limit)
            }
            async let stats = API.rows(UserStatistics.self) {
                $0.from("user_statistics").select().eq("user_id", value: id).limit(1)
            }
            entries = try await rows
            // The list stops at the limit; the count in the header should not.
            total = max(try await stats.first?.gamesPlayed ?? 0, entries.count)
        } catch {
            ToastCenter.shared.error("Laden is niet gelukt", description: API.translate(error).localizedDescription)
        }
        loaded = true
    }

    private func delete(_ entry: ScoreEntry) async {
        do {
            _ = try await API.client().from("score_entries").delete().eq("id", value: entry.id.uuidString).execute()
            Haptics.play(.warning)
            ToastCenter.shared.success("Potje verwijderd")
            detail = nil
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Verwijderen is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}
