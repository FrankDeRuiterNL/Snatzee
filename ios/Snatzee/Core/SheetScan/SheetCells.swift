import Foundation

/// What is in a box: nothing, a stroke, or something written. A port of
/// the website's `src/lib/scoresheet/cells.ts`.
///
/// A stroke (dash, slash) is how people write "scored nothing", and on a
/// Yahtzee sheet that is zero, not missing. It is told from a number by
/// two measurements of the ink: how close it all lies to one straight
/// line, and how wide it is (which separates a stroke from a lone 1).
struct CellKind: Sendable {
    enum Kind: Sendable { case empty, scratched, written }

    let kind: Kind
    /// Fraction of the box's interior that is ink.
    let ink: Double
    /// 0 = on one straight line, 1 = round.
    let linearity: Double
    /// Width of the ink as a fraction of the box's.
    let spread: Double
    /// Close to the line between two answers: worth a look.
    let uncertain: Bool

    private static let inset = 0.12
    private static let emptyInk = 0.006
    private static let maxStrokeLinearity = 0.3
    private static let unsureLinearity = 0.22...0.42
    private static let unsureInk = 0.025
    private static let minStrokeSpread = 0.38
    private static let maxStrokeInk = 0.1

    static func of(_ box: CellBox, in mask: BinaryImage) -> CellKind {
        let x0 = max(0, Int((Double(box.x0) + Double(box.width - 1) * inset).rounded()))
        let x1 = min(mask.width - 1, Int((Double(box.x1) - Double(box.width - 1) * inset).rounded()))
        let y0 = max(0, Int((Double(box.y0) + Double(box.height - 1) * inset).rounded()))
        let y1 = min(mask.height - 1, Int((Double(box.y1) - Double(box.height - 1) * inset).rounded()))
        let innerWidth = x1 - x0 + 1, innerHeight = y1 - y0 + 1
        guard innerWidth >= 3, innerHeight >= 3 else {
            return CellKind(kind: .empty, ink: 0, linearity: 1, spread: 0, uncertain: false)
        }

        var count = 0, sumX = 0.0, sumY = 0.0, left = x1, right = x0
        for y in y0...y1 {
            for x in x0...x1 where mask[x, y] {
                count += 1; sumX += Double(x); sumY += Double(y)
                left = min(left, x); right = max(right, x)
            }
        }
        let ink = Double(count) / Double(innerWidth * innerHeight)
        guard count > 0, ink >= emptyInk else {
            return CellKind(kind: .empty, ink: ink, linearity: 1, spread: 0, uncertain: false)
        }

        let meanX = sumX / Double(count), meanY = sumY / Double(count)
        var varX = 0.0, varY = 0.0, covariance = 0.0
        for y in y0...y1 {
            let dy = Double(y) - meanY
            for x in x0...x1 where mask[x, y] {
                let dx = Double(x) - meanX
                varX += dx * dx; varY += dy * dy; covariance += dx * dy
            }
        }
        varX /= Double(count); varY /= Double(count); covariance /= Double(count)
        // The covariance's eigenvalues: spread along the ink's long and
        // short axes; their ratio is how much like a line it is.
        let trace = varX + varY
        let determinant = varX * varY - covariance * covariance
        let root = sqrt(max(0, trace * trace / 4 - determinant))
        let major = trace / 2 + root, minor = max(0, trace / 2 - root)
        let linearity = major > 0 ? sqrt(minor / major) : 1
        let spread = Double(right - left + 1) / Double(innerWidth)

        let scratched = linearity <= maxStrokeLinearity && spread >= minStrokeSpread && ink <= maxStrokeInk
        let uncertain = ink < unsureInk || unsureLinearity.contains(linearity)
        return CellKind(kind: scratched ? .scratched : .written, ink: ink, linearity: linearity, spread: spread, uncertain: uncertain)
    }
}
