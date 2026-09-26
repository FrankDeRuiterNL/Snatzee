import Foundation

/// What one box on paper says, as far as the reading goes.
enum CellMark: Equatable, Sendable {
    /// A number.
    case number(Int)
    /// Struck out ("/", "—"): the box was scored as nothing.
    case stroke
}

/// One reading of a box, with how sure the reader was.
struct CellReading: Equatable, Sendable {
    let mark: CellMark
    let confidence: Float
}

enum CellParser {
    /// Characters handwriting recognition often returns for digits.
    private static let lookalikes: [Character: Character] = [
        "O": "0", "o": "0", "Q": "0", "D": "0", "°": "0",
        "l": "1", "I": "1", "i": "1", "|": "1", "!": "1", "]": "1", "[": "1", "j": "1", "J": "1",
        "Z": "2", "z": "2",
        "S": "5", "s": "5",
        "b": "6", "G": "6",
        "T": "7",
        "B": "8",
        "g": "9", "q": "9",
    ]

    private static let strokes: Set<Character> = ["/", "\\", "-", "—", "–", "_", "~", "‒", "−", "⁄"]
    /// Left over from a pen tapping the paper, or a player's own habit of
    /// ending a number with a dot: "12.".
    private static let ignorable: Set<Character> = [".", ",", "·", "'", "’", "`", "´", "\"", ":", ";", " ", "•"]

    /// What a piece of recognised text means, or nil when it is not a mark
    /// a scoresheet box would hold.
    static func parse(_ text: String) -> CellMark? {
        let kept = text.filter { !ignorable.contains($0) }
        guard !kept.isEmpty else { return nil }
        if kept.allSatisfy({ strokes.contains($0) }) { return .stroke }

        var digits = ""
        for character in kept {
            if character.isASCII, character.isNumber {
                digits.append(character)
            } else if let digit = lookalikes[character] {
                digits.append(digit)
            } else if strokes.contains(character) {
                continue
            } else {
                return nil
            }
        }
        guard !digits.isEmpty, digits.count <= 4, let value = Int(digits) else { return nil }
        return .number(value)
    }

    /// Every reading a box's recognised text allows, best first, one per
    /// distinct mark.
    static func readings(from candidates: [OCRLine.Candidate]) -> [CellReading] {
        var best: [CellMark: Float] = [:]
        var order: [CellMark] = []
        for candidate in candidates {
            guard let mark = parse(candidate.text) else { continue }
            if best[mark] == nil { order.append(mark) }
            best[mark] = max(best[mark] ?? 0, candidate.confidence)
        }
        return order.map { CellReading(mark: $0, confidence: best[$0] ?? 0) }
            .sorted { $0.confidence > $1.confidence }
    }
}

extension CellMark: Hashable {}

/// Picks the values of one game column as a whole.
///
/// A box read on its own is often unsure — a 1 or a 7, a 3 or an 8. But a
/// scoresheet is not thirteen independent numbers: "Drieën" can only hold
/// 0, 3, 6 … 15, Full house is 0 or 25, and the totals the player wrote
/// have to add up. So every box scores every value it may hold, and the
/// column is chosen as the combination whose own readings, plus the
/// agreement of the totals, is best. The same idea as the website's
/// reader, fed by Apple's text recognition.
enum SheetSolver {
    struct Result: Equatable, Sendable {
        /// The thirteen boxes in Snatzee's order.
        let entries: [Int]
        /// Boxes worth a second look.
        let flagged: Set<Int>
        /// Yahtzees after the first, when the sheet's totals show them.
        let extraYahtzees: Int
        /// Whether the totals the player wrote agree with the result.
        let totalsAgree: Bool
    }

    /// Log-score for a value nothing on paper points to.
    private static let unseen: Double = -4
    /// How much the totals the player wrote may pull the answer.
    private static let totalWeight: Double = 2.5

    /// - Parameter inked: rows where something is written that could not
    ///   be read. Those are open: any value the box may hold, decided by
    ///   the totals, and always flagged.
    static func solve(_ readings: [SheetLine: [CellReading]], inked: Set<SheetLine> = []) -> Result {
        // Per box, a score for every value it may hold.
        let entryScores: [[Int: Double]] = (0..<ScoreSheet.rows.count).map { index in
            scores(for: ScoreSheet.rows[index].values, readings: readings[.entry(index)] ?? [],
                   unreadable: inked.contains(.entry(index)))
        }

        // Upper half: best score per subtotal, and how to get there.
        let upper = bestCombinations(rows: Array(0..<ScoreSheet.upperRows), scores: entryScores)
        let lower = bestCombinations(rows: Array(ScoreSheet.upperRows..<ScoreSheet.rows.count), scores: entryScores)

        var best: (score: Double, subtotal: Int, lowerSum: Int, extra: Int)?
        for (subtotal, upperScore) in upper.best {
            let bonus = subtotal >= ScoreSheet.bonusFrom ? ScoreSheet.upperBonus : 0
            let upperTotal = subtotal + bonus
            let upperAgreement = agreement(readings[.upperSubtotal], subtotal)
                + agreement(readings[.bonus], bonus, emptyMeans: inked.contains(.bonus) ? nil : 0)
                + agreement(readings[.upperTotal], upperTotal)
            for (lowerSum, lowerScore) in lower.best {
                let lowerAgreement = agreement(readings[.lowerTotal], lowerSum)
                // The grand total may include the Yahtzee bonus, which is
                // not one of the thirteen boxes.
                var grand = -Double.infinity
                var extra = 0
                for k in 0...3 {
                    let value = agreement(readings[.grandTotal], upperTotal + lowerSum + k * ScoreSheet.yahtzeeBonus) - Double(k) * 0.4
                    if value > grand { grand = value; extra = k }
                }
                let total = upperScore + lowerScore + totalWeight * (upperAgreement + lowerAgreement + grand)
                if best == nil || total > best!.score {
                    best = (total, subtotal, lowerSum, extra)
                }
            }
        }

        guard let best else {
            return Result(entries: ScoreSheet.empty(), flagged: Set(0..<ScoreSheet.rows.count), extraYahtzees: 0, totalsAgree: false)
        }

        var entries = ScoreSheet.empty()
        for (row, value) in upper.path(to: best.subtotal) { entries[row] = value }
        for (row, value) in lower.path(to: best.lowerSum) { entries[row] = value }

        // A Yahtzee bonus only counts with 50 in the Topscore box.
        let extra = entries[ScoreSheet.topscoreRow] == 50 ? best.extra : 0

        // Flag what the chosen value does not rest on firmly: nothing read
        // there, or the box's own best reading said something else.
        var flagged = Set<Int>()
        for index in entries.indices {
            let rowReadings = readings[.entry(index)] ?? []
            let value = entries[index]
            let own = rowReadings.first
            let agreesWithOwn: Bool = {
                guard let own else { return value == 0 }
                switch own.mark {
                case .number(let n): return n == value
                case .stroke: return value == 0
                }
            }()
            let unreadable = rowReadings.isEmpty && inked.contains(.entry(index))
            if unreadable || !agreesWithOwn || (own?.confidence ?? 1) < 0.35 { flagged.insert(index) }
        }

        let totals = ScoreSheet.totals(entries, yahtzees: extra > 0 ? extra + 1 : 0)
        let written = readings[.grandTotal]?.first.flatMap { reading -> Int? in
            if case .number(let n) = reading.mark { return n }
            return nil
        }
        return Result(entries: entries, flagged: flagged, extraYahtzees: extra,
                      totalsAgree: written == nil || written == totals.total)
    }

    // MARK: Scores

    /// A box's evidence for each value it may hold.
    static func scores(for allowed: [Int], readings: [CellReading], unreadable: Bool = false) -> [Int: Double] {
        var result: [Int: Double] = [:]
        for value in allowed { result[value] = unseen }
        if readings.isEmpty && unreadable {
            // Written in, but not legible: every value is as likely, and
            // the totals choose.
            for value in allowed { result[value] = log(0.3) }
            return result
        }
        if readings.isEmpty {
            // Nothing legible: most often an empty or struck-out box.
            result[0] = log(0.5)
            return result
        }
        for reading in readings {
            let score = log(Double(max(reading.confidence, 0.05)))
            switch reading.mark {
            case .stroke:
                result[0] = max(result[0] ?? unseen, score)
            case .number(let n):
                if result[n] != nil {
                    result[n] = max(result[n]!, score)
                } else if n == 1, result[0] != nil {
                    // A lone stroke is often read as a 1.
                    result[0] = max(result[0]!, score - 1)
                }
            }
        }
        return result
    }

    /// How well a written total agrees with a value: positive when it
    /// matches, negative when it clearly says something else, nothing when
    /// the total was not filled in or not read.
    static func agreement(_ readings: [CellReading]?, _ value: Int, emptyMeans empty: Int? = nil) -> Double {
        guard let readings, !readings.isEmpty else {
            if let empty { return empty == value ? 0.3 : -0.3 }
            return 0
        }
        for reading in readings {
            switch reading.mark {
            case .number(let n) where n == value: return Double(reading.confidence)
            case .stroke where value == 0: return Double(reading.confidence)
            default: continue
            }
        }
        return -Double(readings[0].confidence)
    }

    // MARK: Dynamic programming over sums

    private struct Combinations {
        /// Best score per reachable sum.
        var best: [Int: Double]
        /// Per row, per sum after it: the value chosen and the sum before.
        var steps: [(row: Int, choice: [Int: (value: Int, previous: Int)])]

        func path(to sum: Int) -> [(Int, Int)] {
            var result: [(Int, Int)] = []
            var current = sum
            for step in steps.reversed() {
                guard let choice = step.choice[current] else { break }
                result.append((step.row, choice.value))
                current = choice.previous
            }
            return result
        }
    }

    private static func bestCombinations(rows: [Int], scores: [[Int: Double]]) -> Combinations {
        var best: [Int: Double] = [0: 0]
        var steps: [(row: Int, choice: [Int: (value: Int, previous: Int)])] = []
        for row in rows {
            var next: [Int: Double] = [:]
            var choice: [Int: (value: Int, previous: Int)] = [:]
            for (sum, score) in best {
                for (value, valueScore) in scores[row] {
                    let candidate = score + valueScore
                    let key = sum + value
                    if candidate > next[key] ?? -.infinity {
                        next[key] = candidate
                        choice[key] = (value, sum)
                    }
                }
            }
            best = next
            steps.append((row, choice))
        }
        return Combinations(best: best, steps: steps)
    }
}
