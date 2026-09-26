import Foundation

/// Reads one game column as a whole. A port of the website's
/// `readColumn` (src/lib/scoresheet/read.ts), with Apple's text
/// recognition as a second witness next to the digit net.
///
/// A sheet is not nineteen independent numbers: "Drieën" can only hold 0,
/// 3, 6 … 15, the bonus is 35 or nothing, and every total is the sum of
/// the boxes above it. So each box scores every value it may hold, and the
/// column is chosen as the combination whose own scores, plus the
/// agreement of the totals the player wrote, is best.
enum ColumnReader {
    struct Result: Equatable, Sendable {
        /// The thirteen boxes in Snatzee's order.
        let entries: [Int]
        /// Boxes worth checking.
        let flagged: Set<Int>
        /// Yahtzees after the first, when the grand total shows them.
        let extraYahtzees: Int
        /// Whether the totals the player wrote agree with the result.
        let totalsAgree: Bool
    }

    /// One box's evidence.
    struct Evidence: Sendable {
        /// Log-likelihood per allowed value.
        let scores: [Int: Double]
        let best: Int
        /// How far ahead of the runner-up.
        let margin: Double
        let kind: CellKind
        /// What Vision read there, for the report.
        let vision: [Int: Float]
    }

    /// How much the totals the player wrote may pull the answer.
    private static let totalWeight = 2.0
    private static let unseen = DigitScorer.unseen
    /// How much Vision's reading counts next to the digit net's.
    private static let visionShare = 0.6

    /// The evidence of one box for the values it may hold. Nil for a
    /// total that was left empty (it says nothing either way).
    static func evidence(_ box: CellBox, allowed: [Int], in located: SheetScanner.Located,
                         net: DigitNet?, isTotal: Bool = false) -> Evidence? {
        let mask = located.prepared.mask
        let kind = CellKind.of(box, in: mask)
        guard kind.kind == .written else {
            if isTotal { return nil }
            // A stroke means zero, and so does a blank box.
            let scores = Dictionary(uniqueKeysWithValues: allowed.map { ($0, $0 == 0 ? 0 : unseen) })
            return Evidence(scores: scores, best: 0, margin: -unseen, kind: kind, vision: [:])
        }

        let fromNet = net.map { DigitScorer.score(mask, box: box, allowed: allowed, net: $0) }
        let vision = CellVision.read(box, in: located.prepared.gray)
        let visionAllowed = vision.filter { allowed.contains($0.key) }

        var scores: [Int: Double] = [:]
        for value in allowed {
            let pNet = fromNet.map { exp($0[value] ?? unseen) }
            let pVision = visionAllowed.isEmpty ? nil : Double(visionAllowed[value] ?? 0.01)
            let p: Double
            switch (pNet, pVision) {
            case let (n?, v?): p = (1 - visionShare) * n + visionShare * v
            case let (n?, nil): p = n
            case let (nil, v?): p = v
            case (nil, nil): p = 0
            }
            scores[value] = p > 1e-6 ? log(p) : unseen
        }
        let ranked = scores.sorted { $0.value > $1.value }
        let best = ranked.first?.key ?? 0
        let margin = ranked.count > 1 ? ranked[0].value - ranked[1].value : 0
        return Evidence(scores: scores, best: best, margin: margin, kind: kind, vision: vision)
    }

    /// Reads game column `column` (0-based) of the located grid.
    static func read(_ located: SheetScanner.Located, column: Int, net: DigitNet? = DigitNet.shared) -> (result: Result, boxes: [Evidence])? {
        let grid = located.grid
        guard grid.blocks.count == 2, column < grid.columns else { return nil }
        let upper = grid.blocks[0], lower = grid.blocks[1]
        guard upper.count >= 9, lower.count >= 10 else { return nil }

        func box(_ line: SheetLine) -> CellBox? {
            for (b, block) in grid.blocks.enumerated() {
                for (r, row) in block.enumerated() where SheetLine.at(block: b, row: r, rowsInBlock: block.count) == line {
                    return row[column]
                }
            }
            return nil
        }

        let boxes: [Evidence] = ScoreSheet.rows.indices.map { index in
            evidence(box(.entry(index))!, allowed: ScoreSheet.rows[index].values, in: located, net: net)!
        }
        let upperScores = Array(boxes.prefix(ScoreSheet.upperRows))
        let lowerScores = Array(boxes.dropFirst(ScoreSheet.upperRows))
        let upperTable = sumTable(upperScores)
        let lowerTable = sumTable(lowerScores)

        func withBonus(_ sum: Int) -> Int { sum + (sum >= ScoreSheet.bonusFrom ? ScoreSheet.upperBonus : 0) }
        let reachableUpper = Array(upperTable.keys)
        let reachableLower = Array(lowerTable.keys)
        var reachableGrand = Set<Int>()
        for u in reachableUpper {
            for l in reachableLower {
                for extra in 0...3 { reachableGrand.insert(withBonus(u) + l + extra * ScoreSheet.yahtzeeBonus) }
            }
        }

        func said(_ line: SheetLine, _ candidates: [Int]) -> [Int: Double]? {
            guard let box = box(line) else { return nil }
            return evidence(box, allowed: candidates, in: located, net: net, isTotal: true)?.scores
        }
        let subtotalSaid = said(.upperSubtotal, reachableUpper)
        let upperTotalSaid = said(.upperTotal, reachableUpper.map(withBonus))
        let lowerTotalSaid = said(.lowerTotal, reachableLower)
        let grandSaid = said(.grandTotal, Array(reachableGrand))

        var best: (upper: Int, lower: Int, extra: Int, score: Double)?
        for (u, upperScore) in upperTable {
            let upperWithBonus = withBonus(u)
            var upperPart = upperScore
            if let subtotalSaid { upperPart += totalWeight * (subtotalSaid[u] ?? unseen) }
            if let upperTotalSaid { upperPart += totalWeight * (upperTotalSaid[upperWithBonus] ?? unseen) }
            for (l, lowerScore) in lowerTable {
                var score = upperPart + lowerScore
                if let lowerTotalSaid { score += totalWeight * (lowerTotalSaid[l] ?? unseen) }
                var extra = 0
                if let grandSaid {
                    // The grand total may include Yahtzee bonuses, which
                    // are not one of the thirteen boxes.
                    var bestGrand = -Double.infinity
                    for k in 0...3 {
                        let value = (grandSaid[upperWithBonus + l + k * ScoreSheet.yahtzeeBonus] ?? unseen) - Double(k) * 0.5
                        if value > bestGrand { bestGrand = value; extra = k }
                    }
                    score += totalWeight * bestGrand
                }
                if best == nil || score > best!.score { best = (u, l, extra, score) }
            }
        }
        guard let best else { return nil }

        let entries = backtrack(upperScores, target: best.upper) + backtrack(lowerScores, target: best.lower)
        // Worth checking: the box's own evidence disagrees with what the
        // arithmetic settled on, or it barely preferred what it chose, or
        // its ink was hard to tell a stroke from a number.
        var flagged = Set<Int>()
        for (index, value) in entries.enumerated() {
            let e = boxes[index]
            if e.best != value || e.margin < 0.35 || e.kind.uncertain { flagged.insert(index) }
        }
        let extra = entries[ScoreSheet.topscoreRow] == 50 ? best.extra : 0
        let grand = withBonus(best.upper) + best.lower + extra * ScoreSheet.yahtzeeBonus
        let agrees = (grandSaid.map { ($0[grand] ?? unseen) > unseen } ?? true)
            && (subtotalSaid.map { ($0[best.upper] ?? unseen) > unseen } ?? true)
        return (Result(entries: entries, flagged: flagged, extraYahtzees: extra, totalsAgree: agrees), boxes)
    }

    // MARK: Sums

    /// Best log-likelihood per reachable sum, one row at a time.
    private static func sumTable(_ rows: [Evidence]) -> [Int: Double] {
        var table: [Int: Double] = [0: 0]
        for row in rows {
            var next: [Int: Double] = [:]
            for (sum, running) in table {
                for (value, score) in row.scores {
                    let candidate = running + score
                    if candidate > next[sum + value] ?? -.infinity { next[sum + value] = candidate }
                }
            }
            table = next
        }
        return table
    }

    /// Which values produced a sum.
    private static func backtrack(_ rows: [Evidence], target: Int) -> [Int] {
        var tables: [[Int: Double]] = [[0: 0]]
        for row in rows {
            var next: [Int: Double] = [:]
            for (sum, running) in tables[tables.count - 1] {
                for (value, score) in row.scores {
                    let candidate = running + score
                    if candidate > next[sum + value] ?? -.infinity { next[sum + value] = candidate }
                }
            }
            tables.append(next)
        }
        var values: [Int] = []
        var remaining = target
        for index in stride(from: rows.count - 1, through: 0, by: -1) {
            var chosen = 0, bestScore = -Double.infinity
            for (value, score) in rows[index].scores {
                guard let before = tables[index][remaining - value] else { continue }
                if before + score > bestScore { bestScore = before + score; chosen = value }
            }
            values.insert(chosen, at: 0)
            remaining -= chosen
        }
        return values
    }
}
