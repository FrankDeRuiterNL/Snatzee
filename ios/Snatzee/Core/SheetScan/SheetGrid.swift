import Foundation

/// A box on the work image, inclusive pixel bounds.
struct CellBox: Sendable, Equatable {
    var x0: Int, y0: Int, x1: Int, y1: Int

    var width: Int { x1 - x0 + 1 }
    var height: Int { y1 - y0 + 1 }
    var midX: Double { Double(x0 + x1) / 2 }
    var midY: Double { Double(y0 + y1) / 2 }
}

/// The playing grid of a scoresheet: its game columns and its two blocks
/// of rows, found from the boxes themselves — no printed names needed.
///
/// A port of the website's `src/lib/scoresheet/grid.ts`. After
/// binarising, every box is a rectangle of paper surrounded by ink (the
/// dark panel on Snatzee's sheet, the ruled lines on others). So this
/// looks for paper rectangles of about the right size, and then for the
/// lattice they form: a column is a dozen boxes at one x, a row up to six
/// at one y, so the boxes that were found place the ones that were not.
/// Every cell handed on is a crossing of a column and a row.
struct SheetGrid: Sendable {
    /// Row blocks, top to bottom: the upper half, then the lower half.
    /// `blocks[b][r][c]`: row r, game column c.
    let blocks: [[[CellBox]]]
    /// Game columns, left to right.
    let columns: Int
    /// Rows actually found per block, before the known shape filled in.
    let rowsFound: [Int]

    /// Nine rows above (six boxes, subtotal, bonus, total), ten below
    /// (seven boxes and three totals): what the game is, on any sheet.
    static let expectedRows = [9, 10]

    /// Everything the grid covers, on the work image.
    var bounds: CellBox? {
        let cells = blocks.flatMap { $0.flatMap { $0 } }
        guard let first = cells.first else { return nil }
        return cells.dropFirst().reduce(first) { box, cell in
            CellBox(x0: min(box.x0, cell.x0), y0: min(box.y0, cell.y0), x1: max(box.x1, cell.x1), y1: max(box.y1, cell.y1))
        }
    }

    // MARK: Tuning — the website's values

    private static let minAreaFraction = 0.0003
    private static let maxAreaFraction = 0.01
    private static let minAspect = 0.8
    private static let maxAspect = 5.0
    private static let minFill = 0.45
    private static let lineTolerance = 0.35
    private static let lineSeparation = 0.7
    private static let lineStrength = 0.4
    private static let minLineExtent = 0.55
    private static let blockGapPitches = 1.6
    private static let maxColumns = 6
    private static let columnMinPaper = 0.6
    private static let columnMinGutterInk = 0.5

    private struct Component {
        var x0: Int, y0: Int, x1: Int, y1: Int, area: Int
        var midX: Double { Double(x0 + x1) / 2 }
        var midY: Double { Double(y0 + y1) / 2 }
    }

    private struct Line { let at: Double; let count: Int }
    private struct Extent { var lo: Double; var hi: Double; var mid: Double { (lo + hi) / 2 } }

    // MARK: Detection

    /// The grid, or nil when the image does not hold one.
    static func detect(in mask: BinaryImage) -> SheetGrid? {
        let imageArea = Double(mask.width * mask.height)
        let candidates = paperComponents(mask).filter { c in
            let w = Double(c.x1 - c.x0 + 1), h = Double(c.y1 - c.y0 + 1)
            let aspect = w / h
            return Double(c.area) >= imageArea * minAreaFraction && Double(c.area) <= imageArea * maxAreaFraction
                && aspect >= minAspect && aspect <= maxAspect && Double(c.area) / (w * h) >= minFill
        }
        guard candidates.count >= 12 else { return nil }

        let cellWidth = median(candidates.map { Double($0.x1 - $0.x0 + 1) })
        let cellHeight = median(candidates.map { Double($0.y1 - $0.y0 + 1) })
        guard cellWidth >= 4, cellHeight >= 4 else { return nil }

        // Columns: the strong ones fix the spacing; weaker lines on that
        // spacing are columns too — the played column has the fewest
        // clean boxes, because writing breaks them.
        let allColumnLines = findLines(candidates.map(\.midX), cellSize: cellWidth, strength: 0)
        let strongest = allColumnLines.map(\.count).max() ?? 0
        let strongColumns = allColumnLines.filter { Double($0.count) >= Double(strongest) * lineStrength }
        guard !strongColumns.isEmpty else { return nil }

        var columnLines = strongColumns
        if strongColumns.count >= 2 {
            let pitch = median(zip(strongColumns.dropFirst(), strongColumns).map { $0.at - $1.at })
            if pitch > 0 {
                let anchor = strongColumns[0].at
                let onTheLadder = allColumnLines.filter { line in
                    let rung = ((line.at - anchor) / pitch).rounded()
                    return abs(line.at - (anchor + rung * pitch)) <= cellWidth * lineTolerance
                }
                if onTheLadder.count >= strongColumns.count {
                    columnLines = onTheLadder.count > maxColumns
                        ? Array(onTheLadder.sorted { $0.count > $1.count }.prefix(maxColumns)).sorted { $0.at < $1.at }
                        : onTheLadder
                }
            }
        }

        // Only boxes in those columns place the rows: that keeps the
        // sheet's own printing (the wordmark's letters) out of the lattice.
        let inColumns = candidates.filter { c in
            columnLines.contains { abs(c.midX - $0.at) <= cellWidth * lineTolerance }
        }
        let rowLines = findLines(inColumns.map(\.midY), cellSize: cellHeight)
            .filter { $0.count >= max(3, Int((Double(columnLines.count) * 0.6).rounded())) }
        guard rowLines.count >= 6 else { return nil }

        func extent(at position: Double, size: Double, _ pick: (Component) -> (lo: Double, hi: Double, at: Double)) -> Extent {
            let members = inColumns.map(pick).filter { abs($0.at - position) <= size * lineTolerance }
            guard !members.isEmpty else { return Extent(lo: position - size / 2, hi: position + size / 2) }
            return Extent(lo: median(members.map(\.lo)), hi: median(members.map(\.hi)))
        }
        // A line whose boxes are a sliver of a cell (the white margin above
        // the panel) is not a row of cells.
        func keepFull(_ extents: [Extent]) -> [Extent] {
            let typical = median(extents.map { $0.hi - $0.lo })
            return extents.filter { $0.hi - $0.lo >= typical * minLineExtent }
        }
        var columnExtents = keepFull(columnLines.map { line in
            extent(at: line.at, size: cellWidth) { (Double($0.x0), Double($0.x1), $0.midX) }
        })
        let rowExtents = keepFull(rowLines.map { line in
            extent(at: line.at, size: cellHeight) { (Double($0.y0), Double($0.y1), $0.midY) }
        })
        guard rowExtents.count >= 6, !columnExtents.isEmpty else { return nil }

        // The played column is the one most likely to be missing: step out
        // by the pitch and ask the image whether a column of cells is
        // there — paper in the boxes, ink in the gutters between them
        // (which the white label column beside the table does not have).
        let columnPitch = median(zip(columnExtents.dropFirst(), columnExtents).map { $0.mid - $1.mid })
        if columnPitch > 0, rowExtents.count >= 4 {
            let columnWidth = median(columnExtents.map { $0.hi - $0.lo })
            func looksLikeCells(_ lo: Double, _ hi: Double) -> Bool {
                guard lo >= 0, hi < Double(mask.width) else { return false }
                let cells = rowExtents.map { CellBox(x0: Int(lo.rounded()), y0: Int($0.lo.rounded()), x1: Int(hi.rounded()), y1: Int($0.hi.rounded())) }
                guard paperFraction(mask, cells) >= columnMinPaper else { return false }
                var gutters: [CellBox] = []
                for i in 1..<rowExtents.count {
                    let top = Int(rowExtents[i - 1].hi.rounded()), bottom = Int(rowExtents[i].lo.rounded())
                    if bottom - top < 2 { continue }
                    gutters.append(CellBox(x0: Int(lo.rounded()), y0: top, x1: Int(hi.rounded()), y1: bottom))
                }
                guard !gutters.isEmpty else { return false }
                return 1 - paperFraction(mask, gutters) >= columnMinGutterInk
            }
            while columnExtents.count < maxColumns {
                let lo = columnExtents[0].lo - columnPitch
                guard looksLikeCells(lo, lo + columnWidth) else { break }
                columnExtents.insert(Extent(lo: lo, hi: lo + columnWidth), at: 0)
            }
            while columnExtents.count < maxColumns {
                let lo = columnExtents[columnExtents.count - 1].lo + columnPitch
                guard looksLikeCells(lo, lo + columnWidth) else { break }
                columnExtents.append(Extent(lo: lo, hi: lo + columnWidth))
            }
        }

        // Two blocks, split where the gap between rows jumps.
        let rowCentres = rowExtents.map(\.mid)
        let pitch = median(zip(rowCentres.dropFirst(), rowCentres).map { $0 - $1 })
        var blockStarts = [0]
        for i in 1..<rowCentres.count where rowCentres[i] - rowCentres[i - 1] > pitch * blockGapPitches {
            blockStarts.append(i)
        }
        // Exactly two: stitch the narrowest extra split, or cut one block
        // at its widest gap.
        while blockStarts.count > expectedRows.count {
            var narrowest = 1, narrowestGap = Double.infinity
            for i in 1..<blockStarts.count {
                let index = blockStarts[i]
                let gap = rowCentres[index] - rowCentres[index - 1]
                if gap < narrowestGap { narrowestGap = gap; narrowest = i }
            }
            blockStarts.remove(at: narrowest)
        }
        if blockStarts.count == 1, rowCentres.count >= 4 {
            var widest = 1, widestGap = -Double.infinity
            for i in 1..<rowCentres.count {
                let gap = rowCentres[i] - rowCentres[i - 1]
                if gap > widestGap { widestGap = gap; widest = i }
            }
            blockStarts.append(widest)
        }

        // Where a box really was found under a lattice cell, that box wins
        // (a photo slightly off square is not a perfect lattice).
        func snap(_ cell: CellBox) -> CellBox {
            var x0 = Int.max, y0 = Int.max, x1 = Int.min, y1 = Int.min
            for box in inColumns {
                let cx = box.midX, cy = box.midY
                guard cx >= Double(cell.x0), cx <= Double(cell.x1), cy >= Double(cell.y0), cy <= Double(cell.y1) else { continue }
                x0 = min(x0, box.x0); y0 = min(y0, box.y0); x1 = max(x1, box.x1); y1 = max(y1, box.y1)
            }
            guard x0 != Int.max else { return cell }
            return CellBox(x0: max(x0, Int((Double(cell.x0) - cellWidth * 0.2).rounded())),
                           y0: max(y0, Int((Double(cell.y0) - cellHeight * 0.2).rounded())),
                           x1: min(x1, Int((Double(cell.x1) + cellWidth * 0.2).rounded())),
                           y1: min(y1, Int((Double(cell.y1) + cellHeight * 0.2).rounded())))
        }

        var rowsFound: [Int] = []
        var blocks: [[[CellBox]]] = []
        for (index, start) in blockStarts.enumerated() {
            let end = index + 1 < blockStarts.count ? blockStarts[index + 1] : rowExtents.count
            let slice = Array(rowExtents[start..<end])
            rowsFound.append(slice.count)

            // The rows this block should have, on the ladder the found
            // ones describe; each rung takes the measured row nearest it.
            let wanted = index < expectedRows.count ? expectedRows[index] : slice.count
            let height = median(slice.map { $0.hi - $0.lo }) > 0 ? median(slice.map { $0.hi - $0.lo }) : cellHeight
            let ladder = fitLadder(slice.map(\.mid), count: wanted) { rungs in
                paperFraction(mask, rungs.flatMap { centre in
                    columnExtents.map {
                        CellBox(x0: Int($0.lo.rounded()), y0: Int((centre - height / 2).rounded()),
                                x1: Int($0.hi.rounded()), y1: Int((centre + height / 2).rounded()))
                    }
                })
            }
            let rows: [Extent] = ladder.map { rungs -> [Extent] in
                rungs.map { centre -> Extent in
                    let nearest = slice.min { abs($0.mid - centre) < abs($1.mid - centre) }
                    if let nearest, abs(nearest.mid - centre) <= height * lineTolerance { return nearest }
                    return Extent(lo: centre - height / 2, hi: centre + height / 2)
                }
            } ?? slice

            blocks.append(rows.map { row in
                columnExtents.map { column in
                    snap(CellBox(x0: Int(column.lo.rounded()), y0: Int(row.lo.rounded()),
                                 x1: Int(column.hi.rounded()), y1: Int(row.hi.rounded())))
                }
            })
        }

        return SheetGrid(blocks: blocks, columns: columnExtents.count, rowsFound: rowsFound)
    }

    // MARK: Pieces

    /// Paper regions, 4-connected, iteratively.
    private static func paperComponents(_ mask: BinaryImage) -> [Component] {
        let w = mask.width, h = mask.height
        var seen = [Bool](repeating: false, count: w * h)
        var stack = [Int]()
        stack.reserveCapacity(4096)
        var components: [Component] = []
        mask.data.withUnsafeBufferPointer { data in
            seen.withUnsafeMutableBufferPointer { seen in
                for start in 0..<(w * h) where data[start] == 0 && !seen[start] {
                    seen[start] = true
                    stack.removeAll(keepingCapacity: true)
                    stack.append(start)
                    var c = Component(x0: w, y0: h, x1: 0, y1: 0, area: 0)
                    while let p = stack.popLast() {
                        let x = p % w, y = p / w
                        c.area += 1
                        if x < c.x0 { c.x0 = x }; if x > c.x1 { c.x1 = x }
                        if y < c.y0 { c.y0 = y }; if y > c.y1 { c.y1 = y }
                        if x > 0, data[p - 1] == 0, !seen[p - 1] { seen[p - 1] = true; stack.append(p - 1) }
                        if x < w - 1, data[p + 1] == 0, !seen[p + 1] { seen[p + 1] = true; stack.append(p + 1) }
                        if y > 0, data[p - w] == 0, !seen[p - w] { seen[p - w] = true; stack.append(p - w) }
                        if y < h - 1, data[p + w] == 0, !seen[p + w] { seen[p + w] = true; stack.append(p + w) }
                    }
                    components.append(c)
                }
            }
        }
        return components
    }

    /// How much of some rectangles is paper rather than ink.
    private static func paperFraction(_ mask: BinaryImage, _ cells: [CellBox]) -> Double {
        var paper = 0, total = 0
        mask.data.withUnsafeBufferPointer { data in
            for cell in cells {
                let x0 = max(0, cell.x0), y0 = max(0, cell.y0)
                let x1 = min(mask.width - 1, cell.x1), y1 = min(mask.height - 1, cell.y1)
                guard x1 >= x0, y1 >= y0 else { continue }
                for y in y0...y1 {
                    let row = y * mask.width
                    for x in x0...x1 {
                        total += 1
                        if data[row + x] == 0 { paper += 1 }
                    }
                }
            }
        }
        return total > 0 ? Double(paper) / Double(total) : 0
    }

    /// The evenly spaced ladder of `count` rows that best explains the
    /// rows found; every placement tried, the image decides.
    private static func fitLadder(_ found: [Double], count: Int, score: ([Double]) -> Double) -> [Double]? {
        guard found.count >= 2, count >= 2 else { return nil }
        let pitch = median(zip(found.dropFirst(), found).map { $0 - $1 })
        guard pitch > 0 else { return nil }
        let span = Int(((found[found.count - 1] - found[0]) / pitch).rounded())
        let slack = max(0, count - 1 - span)
        var best: (rungs: [Double], score: Double)?
        for offset in 0...slack {
            let start = found[0] - pitch * Double(offset)
            let rungs = (0..<count).map { start + pitch * Double($0) }
            let value = score(rungs)
            if best == nil || value > best!.score { best = (rungs, value) }
        }
        return best?.rungs
    }

    /// Lines a set of centres falls on, by repeated peak picking (which,
    /// unlike clustering, cannot chain two neighbouring columns).
    private static func findLines(_ centres: [Double], cellSize: Double, strength: Double = lineStrength) -> [Line] {
        guard !centres.isEmpty else { return [] }
        let tolerance = cellSize * lineTolerance
        let separation = cellSize * lineSeparation
        var remaining = centres.sorted()
        var lines: [Line] = []
        for _ in 0..<64 where !remaining.isEmpty {
            var best = remaining[0], bestCount = 0
            for candidate in remaining {
                // Sorted: count the window around the candidate.
                let count = remaining.lazy.filter { abs($0 - candidate) <= tolerance }.count
                if count > bestCount { bestCount = count; best = candidate }
            }
            let members = remaining.filter { abs($0 - best) <= tolerance }
            lines.append(Line(at: median(members), count: members.count))
            remaining.removeAll { abs($0 - best) <= separation }
        }
        let strongest = lines.map(\.count).max() ?? 0
        return lines.filter { Double($0.count) >= Double(strongest) * strength }.sorted { $0.at < $1.at }
    }

    private static func median(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        return sorted[sorted.count / 2]
    }
}
