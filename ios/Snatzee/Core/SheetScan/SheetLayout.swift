import CoreGraphics
import Foundation

/// A piece of text Vision found, in page coordinates: 0…1 from the top
/// left, so the maths reads like the page does.
struct OCRLine: Sendable {
    struct Candidate: Sendable {
        let text: String
        let confidence: Float
    }

    /// Best guess first.
    let candidates: [Candidate]
    let box: CGRect
    /// The line split at its spaces, each word with its own box — "1e 2e
    /// 3e" across a header row becomes three words in three places.
    var words: [(text: String, box: CGRect)] = []

    var text: String { candidates.first?.text ?? "" }
}

/// Where the rows and the game columns of a paper scoresheet are.
///
/// Found from what is printed on it: the row names ("Enen", "Full house",
/// "Totaal generaal") give the rows, the column headings ("1e spel",
/// "Game 2") give the columns. That is why any standard sheet works, in
/// any design, without knowing it in advance.
struct SheetLayout: Sendable {
    struct Column: Sendable, Equatable {
        /// 1-based game number as printed.
        let number: Int
        let centerX: CGFloat
        let width: CGFloat
    }

    struct Row: Sendable {
        let line: SheetLine
        let midY: CGFloat
        let text: String
    }

    let columns: [Column]
    let rows: [Row]
    /// Typical distance between two rows.
    let rowHeight: CGFloat

    /// The part of the page that holds the boxes of one column.
    func strip(for column: Column) -> CGRect {
        let top = (rows.map(\.midY).min() ?? 0) - rowHeight
        let bottom = (rows.map(\.midY).max() ?? 1) + rowHeight
        return CGRect(x: column.centerX - column.width * 0.5, y: max(0, top),
                      width: column.width, height: min(1, bottom) - max(0, top))
            .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    /// The row a piece of handwriting at this height belongs to.
    func row(atY y: CGFloat) -> Row? {
        guard let nearest = rows.min(by: { abs($0.midY - y) < abs($1.midY - y) }),
              abs(nearest.midY - y) < rowHeight * 0.6 else { return nil }
        return nearest
    }

    enum Failure: Error, Equatable {
        /// Not enough of the row names were readable to call it a scoresheet.
        case noRows
        /// The game columns' headings were not found.
        case noColumns
    }

    /// Works the layout out from a whole-page reading.
    static func detect(in lines: [OCRLine]) -> Result<SheetLayout, Failure> {
        // 1. Anchors: lines that clearly name one of the thirteen boxes.
        let anchors = lines.compactMap { line -> (index: Int, line: OCRLine)? in
            if case .entry(let index)? = SheetVocabulary.line(for: line.text) { return (index, line) }
            return nil
        }
        let distinct = Set(anchors.map(\.index))
        guard distinct.count >= 6 else { return .failure(.noRows) }

        let rowHeight = estimateRowHeight(anchors: anchors)
        let firstRowY = anchors.map(\.line.box.midY).min() ?? 0

        // 2. Columns from their headings, above the first row.
        guard let columns = detectColumns(in: lines, above: firstRowY - rowHeight * 0.3, rowHeight: rowHeight) else {
            return .failure(.noColumns)
        }

        // 3. Rows: everything printed left of the first column, grouped by
        //    height, and each group read for what it names.
        let labelRight = columns[0].centerX - columns[0].width * 0.45
        let labelLines = lines
            .filter { $0.box.midX < labelRight && $0.box.midY > firstRowY - rowHeight * 0.6 }
            .sorted { $0.box.midY < $1.box.midY }

        var bands: [[OCRLine]] = []
        for line in labelLines {
            if let first = bands.last?.first, line.box.midY - first.box.midY < rowHeight * 0.6 {
                bands[bands.count - 1].append(line)
            } else {
                bands.append([line])
            }
        }

        var rows: [Row] = []
        var bareTotals: [(midY: CGFloat, text: String)] = []
        for band in bands {
            let text = band.sorted { ($0.box.minY, $0.box.minX) < ($1.box.minY, $1.box.minX) }.map(\.text).joined(separator: " ")
            // The row's height is its name's, not its hint's.
            let midY = band.map(\.box.midY).reduce(0, +) / CGFloat(band.count)
            if let line = SheetVocabulary.line(for: text) {
                rows.append(Row(line: line, midY: midY, text: text))
            } else if SheetVocabulary.isBareTotal(text) {
                bareTotals.append((midY, text))
            }
        }

        // 4. A bare "Totaal" is named by its neighbours.
        for total in bareTotals {
            let above = rows.filter { $0.midY < total.midY }.max { $0.midY < $1.midY }
            let line: SheetLine
            switch above?.line {
            case .entry(5)?: line = .upperSubtotal
            case .bonus?, .upperSubtotal?: line = .upperTotal
            case .entry(12)?, .yahtzeeBonus?: line = .lowerTotal
            case .lowerTotal?, .upperTotal?:
                line = rows.contains { $0.line == .lowerTotal && $0.midY > total.midY } ? .upperTotal : .grandTotal
            default: continue
            }
            rows.append(Row(line: line, midY: total.midY, text: total.text))
        }

        // One row per line kept (upper total may appear twice, which is
        // fine: both are evidence); drop duplicates of the same box.
        rows.sort { $0.midY < $1.midY }
        var seenEntries = Set<Int>()
        rows = rows.filter { row in
            if case .entry(let index) = row.line { return seenEntries.insert(index).inserted }
            return true
        }

        return .success(SheetLayout(columns: columns, rows: rows, rowHeight: rowHeight))
    }

    /// The usual step between two consecutive box names.
    private static func estimateRowHeight(anchors: [(index: Int, line: OCRLine)]) -> CGFloat {
        let byIndex = Dictionary(anchors.map { ($0.index, $0.line.box.midY) }, uniquingKeysWith: { first, _ in first })
        var steps: [CGFloat] = []
        for index in 0..<12 {
            guard let a = byIndex[index], let b = byIndex[index + 1], index != 5 else { continue }
            let step = b - a
            if step > 0 { steps.append(step) }
        }
        if steps.isEmpty {
            // Fall back on the spread of what was found.
            let ys = anchors.map(\.line.box.midY).sorted()
            return max(0.01, ((ys.last ?? 0) - (ys.first ?? 0)) / CGFloat(max(1, ys.count)))
        }
        steps.sort()
        return steps[steps.count / 2]
    }

    /// Game columns from headings like "1e spel" or "Game 2", filled in
    /// between: headings found for 1, 2, 4 and 6 still give all six.
    private static func detectColumns(in lines: [OCRLine], above limitY: CGFloat, rowHeight: CGFloat) -> [Column]? {
        var found: [Int: [CGFloat]] = [:]
        for line in lines where line.box.midY < limitY {
            let words = line.words.isEmpty ? [(text: line.text, box: line.box)] : line.words
            // The whole line first ("1e spel"), then word by word ("1e 2e 3e").
            if let number = SheetVocabulary.gameNumber(for: line.text) {
                found[number, default: []].append(line.box.midX)
                continue
            }
            for word in words {
                if let number = SheetVocabulary.gameNumber(for: word.text) {
                    found[number, default: []].append(word.box.midX)
                }
            }
        }
        // Headings are printed once per column; use the lowest reading of
        // each so a repeated header row does not pull it sideways.
        let points = found.compactMap { number, xs -> (n: CGFloat, x: CGFloat)? in
            xs.isEmpty ? nil : (CGFloat(number), xs.sorted()[xs.count / 2])
        }
        guard points.count >= 2 else { return nil }

        // x = a + b·n, least squares.
        let count = CGFloat(points.count)
        let meanN = points.map(\.n).reduce(0, +) / count
        let meanX = points.map(\.x).reduce(0, +) / count
        let covariance = points.map { ($0.n - meanN) * ($0.x - meanX) }.reduce(0, +)
        let variance = points.map { ($0.n - meanN) * ($0.n - meanN) }.reduce(0, +)
        guard variance > 0 else { return nil }
        let step = covariance / variance
        let origin = meanX - step * meanN
        guard step > 0.02 else { return nil }

        let last = max(6, Int(points.map(\.n).max() ?? 6))
        return (1...last).compactMap { number in
            let x = origin + step * CGFloat(number)
            guard x - step * 0.5 > -0.02, x + step * 0.5 < 1.02 else { return nil }
            return Column(number: number, centerX: x, width: step)
        }
    }
}
