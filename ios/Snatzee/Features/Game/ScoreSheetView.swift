import SwiftUI
import Supabase

/// Adding or editing a game — the website's `<ScoreSheet>`.
///
/// A game is entered box by box; the score is never typed, it is what
/// the boxes add up to (with both bonuses). The exception is editing a
/// game from before the sheet existed, saved only as a number: that one
/// keeps a number wheel, because inventing thirteen boxes for it would be
/// making up a game that was never recorded.
struct ScoreSheetView: View {
    let entry: ScoreEntry?
    let onSaved: (RecordScoreResult) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var sheet: [Int]
    @State private var score: Int
    @State private var isWin: Bool
    @State private var threwYahtzee: Bool
    @State private var yahtzeeCount: Int
    @State private var playedAt: Date
    @State private var note: String
    @State private var error: String?
    @State private var saving = false

    private let scoreOnly: Bool

    init(entry: ScoreEntry?, onSaved: @escaping (RecordScoreResult) -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        let stored = entry?.sheet
        scoreOnly = entry != nil && !ScoreSheet.isValid(stored)
        _sheet = State(initialValue: ScoreSheet.isValid(stored) ? stored! : ScoreSheet.empty())
        _score = State(initialValue: entry?.score ?? 0)
        _isWin = State(initialValue: entry?.isWin ?? false)
        _threwYahtzee = State(initialValue: (entry?.yahtzeeCount ?? 0) > 0)
        _yahtzeeCount = State(initialValue: max(entry?.yahtzeeCount ?? 0, 1))
        _playedAt = State(initialValue: entry?.playedAt ?? Date())
        _note = State(initialValue: entry?.note ?? "")
    }

    private var isEdit: Bool { entry != nil }
    /// The stepper keeps its value while the toggle is off; only counted
    /// when the player says they threw one.
    private var yahtzees: Int { threwYahtzee ? yahtzeeCount : 0 }
    private var totals: ScoreSheet.Totals { ScoreSheet.totals(sheet, yahtzees: yahtzees) }
    private var finalScore: Int { scoreOnly ? score : totals.total }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(isEdit ? "Pas je geregistreerde resultaat aan." : "Vul je blad in — de eindscore rekent zichzelf uit.")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)

                    scoreSection
                    winSection
                    yahtzeeSection
                    dateSection
                    noteSection
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .contentMargins(.bottom, 0, for: .scrollContent)
            .background(Theme.canvasSoft)
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await save() }
                } label: {
                    HStack(spacing: 8) {
                        LucideIcon("check", size: 20)
                        Text(isEdit ? "Wijzigingen opslaan" : "Potje opslaan")
                    }
                }
                .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: saving))
                .disabled(saving)
                .padding(.horizontal, Theme.gutter)
                .padding(.vertical, 12)
                .background(Theme.canvasSoft)
            }
            .navigationTitle(isEdit ? "Potje bewerken" : "Potje toevoegen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { LucideIcon("x", size: 20).foregroundStyle(Theme.inkSoft) }
                        .disabled(saving)
                        .accessibilityLabel("Sluiten")
                }
            }
            .toolbarBackground(Theme.canvasSoft, for: .navigationBar)
        }
        // A long form: losing a half-filled game to a swipe that started at
        // the wrong pixel is worse than one tap on the cross.
        .interactiveDismissDisabled()
    }

    // MARK: Sections

    private var scoreSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Eindscore")
                    .font(.jakarta(TextSize.sm, .semibold))
                    .foregroundStyle(Theme.inkSoft)
                Spacer()
                Text("\(finalScore)")
                    .font(.jakarta(TextSize.xxl, .black))
                    .trackingTight(TextSize.xxl)
                    .monospacedDigit()
                    .foregroundStyle(Theme.mint400)
                    .contentTransition(.numericText(value: Double(finalScore)))
                    .animation(.snappy, value: finalScore)
            }
            if scoreOnly {
                Picker("Eindscore", selection: $score) {
                    ForEach(ScoreSheet.scoreMin...ScoreSheet.scoreMax, id: \.self) { Text("\($0)").tag($0) }
                }
                .pickerStyle(.wheel)
                .frame(height: 150)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                Text("Dit potje is destijds als eindscore opgeslagen, zonder de losse vakjes · \(ScoreSheet.scoreMin)–\(ScoreSheet.scoreMax) punten")
                    .font(.jakarta(TextSize.xs))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            } else {
                SheetFormView(entries: Binding(
                    get: { sheet },
                    set: { next in
                        sheet = next
                        // A Yahtzee in the box means one was thrown.
                        if next[ScoreSheet.topscoreRow] > 0 && !threwYahtzee {
                            threwYahtzee = true
                            yahtzeeCount = max(yahtzeeCount, 1)
                        }
                    }
                ), yahtzees: yahtzees)
            }
            FieldError(message: error)
        }
    }

    private var winSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel("Gewonnen?")
            HStack(spacing: 8) {
                winOption("Gewonnen", icon: "trophy", selected: isWin, win: true) { isWin = true }
                winOption("Niet gewonnen", icon: "dice-5", selected: !isWin, win: false) { isWin = false }
            }
        }
    }

    private func winOption(_ label: String, icon: String, selected: Bool, win: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.play(.light)
            action()
        } label: {
            HStack(spacing: 8) {
                LucideIcon(icon, size: 20)
                Text(label)
            }
            .font(.jakarta(TextSize.base15, .semibold))
            .foregroundStyle(selected ? (win ? Theme.navy950 : .white) : Theme.inkSoft)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(
                selected ? (win ? Theme.mint500 : Theme.surfaceElevated) : Theme.canvas,
                in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                    .strokeBorder(selected ? (win ? Theme.mint500 : Theme.hairlineStrong) : Theme.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var yahtzeeSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ToggleRow(
                label: "Yahtzee gegooid?",
                description: "Tel de Yahtzees die je tijdens dit potje gooide.",
                isOn: Binding(get: { threwYahtzee }, set: { next in
                    withAnimation(.easeOut(duration: 0.25)) { threwYahtzee = next }
                    if next && yahtzeeCount < 1 { yahtzeeCount = 1 }
                })
            )
            if threwYahtzee {
                VStack(alignment: .leading, spacing: 0) {
                    FieldLabel("Hoeveel Yahtzee's?").padding(.top, 16)
                    NumberStepper(label: "Aantal Yahtzee's", value: $yahtzeeCount, range: 1...30)
                    if !scoreOnly && totals.yahtzeeBonus > 0 {
                        Text("+\(totals.yahtzeeBonus) Yahtzee-bonus in je eindscore")
                            .font(.jakarta(TextSize.xs))
                            .foregroundStyle(Theme.mint300)
                            .padding(.top, 8)
                    }
                    if !scoreOnly && yahtzeeCount > 1 && sheet[ScoreSheet.topscoreRow] != 50 {
                        Text("Geen Yahtzee-bonus: die telt alleen als je Topscore-vak 50 punten heeft.")
                            .font(.jakarta(TextSize.xs))
                            .foregroundStyle(Theme.inkMuted)
                            .padding(.top, 8)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .card(.surface, radius: Theme.Radius.xxl)
    }

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel("Datum gespeeld")
            DatePicker("Datum gespeeld", selection: $playedAt, in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(Theme.mint500)
                .environment(\.locale, Formatting.locale)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .frame(minHeight: 48)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                        .strokeBorder(Theme.hairline, lineWidth: 1)
                )
        }
    }

    private var noteSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Notitie").font(.jakarta(TextSize.sm, .semibold)).foregroundStyle(Theme.inkSoft)
                Text("(optioneel)").font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
            }
            .padding(.bottom, 8)
            TextField("", text: Binding(get: { note }, set: { note = String($0.prefix(280)) }),
                      prompt: Text("Bijv. vakantiepotje met het hele gezin").foregroundColor(Theme.inkMuted),
                      axis: .vertical)
                .lineLimit(3...6)
                .font(.jakarta(TextSize.base))
                .foregroundStyle(Theme.ink)
                .padding(12)
                .frame(minHeight: 96, alignment: .topLeading)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                        .strokeBorder(Theme.hairline, lineWidth: 1)
                )
        }
    }

    // MARK: Saving

    /// Today keeps the clock time so "just played" sorts right; another day
    /// lands at midday; an edited game whose date was not touched keeps
    /// its own time — the same rules as the website.
    private func timestamp() -> Date {
        let calendar = Calendar.current
        if let original = entry?.playedAt, calendar.isDate(original, inSameDayAs: playedAt) {
            return original
        }
        if calendar.isDateInToday(playedAt) { return Date() }
        return calendar.date(bySettingHour: 12, minute: 0, second: 0, of: playedAt) ?? playedAt
    }

    private func save() async {
        guard !saving else { return }
        let value = finalScore
        guard (ScoreSheet.scoreMin...ScoreSheet.scoreMax).contains(value) else {
            error = "Score moet tussen \(ScoreSheet.scoreMin) en \(ScoreSheet.scoreMax) liggen"
            return
        }
        saving = true
        error = nil
        defer { saving = false }

        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        var params: [String: AnyJSON] = [
            "p_score": .integer(value),
            "p_is_win": .bool(isWin),
            "p_played_at": .string(PostgresDate.string(timestamp())),
            "p_note": trimmedNote.isEmpty ? .null : .string(trimmedNote),
            "p_yahtzee_count": .integer(yahtzees),
            "p_sheet": scoreOnly ? .null : .array(sheet.map { .integer($0) }),
        ]

        do {
            let result: RecordScoreResult
            if let entry {
                params["p_id"] = .string(entry.id.uuidString)
                // A game saved from the wheel has no sheet behind it.
                params["p_clear_sheet"] = .bool(scoreOnly)
                result = try await API.rpc("update_score_entry", params, as: RecordScoreResult.self)
            } else {
                result = try await API.rpc("record_score_entry", params, as: RecordScoreResult.self)
            }
            dismiss()
            onSaved(result)
        } catch {
            self.error = API.translate(error).localizedDescription
            ToastCenter.shared.error("Opslaan is niet gelukt", description: self.error)
        }
    }
}
