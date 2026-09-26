import Foundation

/// A Yahtzee sheet's own rules — the Swift twin of `src/lib/scoresheet/sheet.ts`
/// and of `sheet_total()` in the database, which checks every saved game.
enum ScoreSheet {
    struct Row {
        let label: String
        /// What the row counts, for the hint under the label.
        let hint: String
        /// Every value the row may hold, in order.
        let values: [Int]

        /// The points a yes-or-no row is worth (full house, the straights,
        /// the Topscore), or nil for a row with a range. The form offers
        /// those as a checkbox instead of a list with two entries.
        var fixedPoints: Int? {
            values.count == 2 && values[0] == 0 ? values[1] : nil
        }
    }

    private static func step(_ from: Int, _ to: Int, by: Int) -> [Int] {
        Array(stride(from: from, through: to, by: by))
    }

    /// Zero, or anything five dice can add up to.
    private static let anyThrow = [0] + step(5, 30, by: 1)

    /// The thirteen rows people fill in, in sheet order.
    static let rows: [Row] = [
        Row(label: "Enen", hint: "Tel alle enen", values: step(0, 5, by: 1)),
        Row(label: "Tweeën", hint: "Tel alle tweeën", values: step(0, 10, by: 2)),
        Row(label: "Drieën", hint: "Tel alle drieën", values: step(0, 15, by: 3)),
        Row(label: "Vieren", hint: "Tel alle vieren", values: step(0, 20, by: 4)),
        Row(label: "Vijven", hint: "Tel alle vijven", values: step(0, 25, by: 5)),
        Row(label: "Zessen", hint: "Tel alle zessen", values: step(0, 30, by: 6)),
        Row(label: "Three of a kind", hint: "3 dezelfde · totaal van 5 stenen", values: anyThrow),
        Row(label: "Carré", hint: "4 dezelfde · totaal van 5 stenen", values: anyThrow),
        Row(label: "Full house", hint: "3 + 2 dezelfde · 25 punten", values: [0, 25]),
        Row(label: "Kleine straat", hint: "4 opeenvolgende · 30 punten", values: [0, 30]),
        Row(label: "Grote straat", hint: "5 opeenvolgende · 40 punten", values: [0, 40]),
        Row(label: "Topscore", hint: "5 dezelfde · 50 punten", values: [0, 50]),
        Row(label: "Chance", hint: "Vrije keus · totaal van 5 stenen", values: anyThrow),
    ]

    static let upperRows = 6
    static let upperBonus = 35
    static let bonusFrom = 63
    /// The row that means a Yahtzee was thrown.
    static let topscoreRow = 11
    /// Every Yahtzee after the first, with the Yahtzee box scored at 50.
    static let yahtzeeBonus = 100

    static let scoreMin = 0
    static let scoreMax = 1575

    struct Totals: Equatable {
        let subtotal: Int
        let bonus: Int
        let upper: Int
        let lower: Int
        let yahtzeeBonus: Int
        let total: Int
    }

    static func empty() -> [Int] { Array(repeating: 0, count: rows.count) }

    static func yahtzeeBonus(_ entries: [Int], yahtzees: Int) -> Int {
        guard entries.indices.contains(topscoreRow), entries[topscoreRow] == 50 else { return 0 }
        return max(0, yahtzees - 1) * yahtzeeBonus
    }

    /// The totals a sheet works out to; `yahtzees` is the game's Yahtzee
    /// count, which is not one of the thirteen boxes.
    static func totals(_ entries: [Int], yahtzees: Int = 0) -> Totals {
        let subtotal = entries.prefix(upperRows).reduce(0, +)
        let bonus = subtotal >= bonusFrom ? upperBonus : 0
        let lower = entries.dropFirst(upperRows).reduce(0, +)
        let extra = yahtzeeBonus(entries, yahtzees: yahtzees)
        return Totals(
            subtotal: subtotal,
            bonus: bonus,
            upper: subtotal + bonus,
            lower: lower,
            yahtzeeBonus: extra,
            total: subtotal + bonus + lower + extra
        )
    }

    /// Whether every value is one its row allows — the database's check.
    static func isValid(_ entries: [Int]?) -> Bool {
        guard let entries, entries.count == rows.count else { return false }
        return entries.enumerated().allSatisfy { rows[$0.offset].values.contains($0.element) }
    }
}
