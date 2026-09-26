import Foundation

/// What a row of the grid holds, known from its place alone.
///
/// Every Yahtzee sheet prints the same rows in the same order, whatever
/// it calls them: six boxes, the subtotal, the bonus and the upper total
/// above; seven boxes and three totals below. So the first box of the
/// upper block is always the ones, the one under it the twos, and so on
/// — no printed name has to be read.
enum SheetLine: Hashable, Sendable {
    /// One of the thirteen boxes, as an index into `ScoreSheet.rows`.
    case entry(Int)
    /// The six upper boxes added up.
    case upperSubtotal
    /// 35 from 63 up.
    case bonus
    /// Subtotal plus bonus (printed at the end of the upper block, and
    /// again above the grand total).
    case upperTotal
    /// The seven lower boxes added up.
    case lowerTotal
    /// The score.
    case grandTotal

    /// What row `row` of block `block` holds, or nil for a row the game
    /// does not define (extra rows some sheets print, like Yahtzee bonus
    /// marks).
    static func at(block: Int, row: Int, rowsInBlock: Int) -> SheetLine? {
        switch block {
        case 0:
            switch row {
            case 0..<ScoreSheet.upperRows: return .entry(row)
            case 6: return .upperSubtotal
            case 7: return .bonus
            case 8: return .upperTotal
            default: return nil
            }
        case 1:
            let lowerRows = ScoreSheet.rows.count - ScoreSheet.upperRows
            if row < lowerRows { return .entry(ScoreSheet.upperRows + row) }
            // The three totals are always the block's last three rows.
            switch rowsInBlock - row {
            case 3: return .lowerTotal
            case 2: return .upperTotal
            case 1: return .grandTotal
            default: return nil
            }
        default:
            return nil
        }
    }
}
