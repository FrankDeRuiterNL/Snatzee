import SwiftUI

/// The scoresheet as a form — `<SheetForm>`: the thirteen rows people fill
/// in, each offering only the values its row can hold, and the totals the
/// paper sheet prints, worked out rather than typed.
struct SheetFormView: View {
    @Binding var entries: [Int]
    /// Yahtzees thrown this game, for the bonus on every one after the first.
    var yahtzees: Int = 0

    var body: some View {
        let totals = ScoreSheet.totals(entries, yahtzees: yahtzees)

        VStack(spacing: 16) {
            block("Deel 1") {
                ForEach(0..<ScoreSheet.upperRows, id: \.self) { index in row(index) }
                computed("Totaal aantal punten", totals.subtotal)
                computed("Extra bonus", totals.bonus, hint: "Vanaf \(ScoreSheet.bonusFrom) punten · \(ScoreSheet.upperBonus) punten")
                computed("Totaal bovenste helft", totals.upper, strong: true)
            }
            block("Deel 2") {
                ForEach(ScoreSheet.upperRows..<ScoreSheet.rows.count, id: \.self) { index in row(index) }
                computed("Totaal onderste helft", totals.lower)
                if totals.yahtzeeBonus > 0 {
                    computed("Yahtzee-bonus", totals.yahtzeeBonus, hint: "\(ScoreSheet.yahtzeeBonus) per extra Yahtzee")
                }
                computed("Totaal bovenste helft", totals.upper)
                computed("Totaal generaal", totals.total, strong: true)
            }
        }
    }

    private func block<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            Text(title.uppercased())
                .font(.jakarta(TextSize.xs, .bold))
                .tracking(0.6)
                .foregroundStyle(Theme.inkSoft)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Theme.surfaceElevated)
            VStack(spacing: 0) {
                content()
            }
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 1)
        )
    }

    private func row(_ index: Int) -> some View {
        let definition = ScoreSheet.rows[index]
        let value = entries.indices.contains(index) ? entries[index] : 0

        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(definition.label)
                    .font(.jakarta(TextSize.base15, .semibold))
                    .foregroundStyle(Theme.ink)
                Text(definition.hint)
                    .font(.jakarta(TextSize.xs))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let points = definition.fixedPoints {
                PointsCheckbox(label: definition.label, points: points, isOn: Binding(
                    get: { value == points },
                    set: { on in
                        Haptics.play(.light)
                        entries[index] = on ? points : 0
                    }
                ))
            } else {
                // A menu of exactly the values this row allows: it cannot offer
                // a number that is not possible, like the web's native select.
                Menu {
                    Picker(definition.label, selection: Binding(
                        get: { value },
                        set: { newValue in
                            Haptics.play(.light)
                            entries[index] = newValue
                        }
                    )) {
                        ForEach(definition.values.reversed(), id: \.self) { option in
                            Text("\(option)").tag(option)
                        }
                    }
                } label: {
                    Text("\(value)")
                        .font(.jakarta(TextSize.base, .bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .frame(minWidth: 56, alignment: .trailing)
                        .padding(.horizontal, 12)
                        .frame(minWidth: 80, minHeight: 44)
                        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                                .strokeBorder(Theme.hairline, lineWidth: 1)
                        )
                }
                .accessibilityLabel("\(definition.label): \(value)")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hairline).frame(height: 1) }
    }

    private func computed(_ label: String, _ value: Int, hint: String? = nil, strong: Bool = false) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.jakarta(TextSize.base15, strong ? .bold : .semibold))
                    .foregroundStyle(strong ? Theme.ink : Theme.inkSoft)
                if let hint {
                    Text(hint)
                        .font(.jakarta(TextSize.xs))
                        .foregroundStyle(Theme.inkMuted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text("\(value)")
                .font(.jakarta(strong ? TextSize.lg : TextSize.base, strong ? .black : .bold))
                .monospacedDigit()
                .foregroundStyle(strong ? Theme.mint400 : Theme.inkSoft)
                .frame(minWidth: 80, alignment: .trailing)
                .padding(.horizontal, 12)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.canvas.opacity(0.4))
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hairline).frame(height: 1) }
    }
}

/// A row that is either scored or not: one tap instead of a menu with two
/// values. Same footprint as the menu button beside it, so the column of
/// values stays lined up — `<PointsCheckbox>` on the web.
private struct PointsCheckbox: View {
    let label: String
    let points: Int
    @Binding var isOn: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            withAnimation(reduceMotion || Preferences.shared.reducedMotion ? nil : .spring(response: 0.28, dampingFraction: 0.62)) {
                isOn.toggle()
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(.white.opacity(0.25), lineWidth: 2)
                        .opacity(isOn ? 0 : 1)
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Theme.mint500)
                        .opacity(isOn ? 1 : 0)
                    if isOn {
                        LucideIcon("check", size: 16)
                            .foregroundStyle(Theme.navy950)
                            .fontWeight(.black)
                            .transition(.scale(scale: 0.4).combined(with: .opacity))
                    }
                }
                .frame(width: 24, height: 24)
                .shadow(color: Theme.mint500.opacity(isOn ? 0.45 : 0), radius: 6, y: 2)

                Text("\(points)")
                    .font(.jakarta(TextSize.base, .bold))
                    .monospacedDigit()
                    .foregroundStyle(isOn ? Theme.mint300 : Theme.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .frame(width: 80, height: 44)
            .background(isOn ? Theme.mint500.opacity(0.15) : Theme.canvas,
                        in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .strokeBorder(isOn ? Theme.mint500 : Theme.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(points) punten")
        .accessibilityValue(isOn ? "Aangevinkt" : "Niet aangevinkt")
        .accessibilityAddTraits(.isToggle)
        .accessibilityAction { isOn.toggle() }
    }
}

/// Read-only version for looking back at a game — `<SheetBreakdown>`.
struct SheetBreakdownView: View {
    let entries: [Int]
    var yahtzees = 0
    /// Games saved before the bonus was counted add up without it and are
    /// shown the way they were saved.
    var score: Int?

    var body: some View {
        let withBonus = ScoreSheet.totals(entries, yahtzees: yahtzees)
        let totals = score == nil || withBonus.total == score ? withBonus : ScoreSheet.totals(entries)

        VStack(spacing: 0) {
            Text("SCOREBLAD")
                .font(.jakarta(TextSize.xs, .bold))
                .tracking(0.6)
                .foregroundStyle(Theme.inkSoft)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Theme.surfaceElevated)

            ForEach(0..<ScoreSheet.upperRows, id: \.self) { line(ScoreSheet.rows[$0].label, entries[$0]) }
            line("Totaal aantal punten", totals.subtotal, muted: true)
            line("Extra bonus", totals.bonus, muted: true, hint: "Vanaf \(ScoreSheet.bonusFrom) punten · \(ScoreSheet.upperBonus) punten")
            line("Totaal bovenste helft", totals.upper, muted: true, strong: true)
            ForEach(ScoreSheet.upperRows..<ScoreSheet.rows.count, id: \.self) { line(ScoreSheet.rows[$0].label, entries[$0]) }
            line("Totaal onderste helft", totals.lower, muted: true)
            if totals.yahtzeeBonus > 0 {
                line("Yahtzee-bonus", totals.yahtzeeBonus, muted: true, hint: "\(ScoreSheet.yahtzeeBonus) per extra Yahtzee")
            }
            line("Totaal bovenste helft", totals.upper, muted: true)
            line("Totaal generaal", totals.total, muted: true, strong: true)
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 1)
        )
    }

    private func line(_ label: String, _ value: Int, muted: Bool = false, strong: Bool = false, hint: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.jakarta(TextSize.base15, strong ? .bold : (muted ? .semibold : .regular)))
                    .foregroundStyle(strong ? Theme.ink : Theme.inkSoft)
                if let hint {
                    Text(hint).font(.jakarta(TextSize.xs)).foregroundStyle(Theme.inkMuted).lineLimit(1)
                }
            }
            Spacer()
            Text("\(value)")
                .font(.jakarta(strong ? TextSize.lg : TextSize.base, strong ? .black : .bold))
                .monospacedDigit()
                .foregroundStyle(strong ? Theme.mint400 : Theme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(muted ? Theme.canvas.opacity(0.4) : .clear)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hairline).frame(height: 1) }
    }
}
