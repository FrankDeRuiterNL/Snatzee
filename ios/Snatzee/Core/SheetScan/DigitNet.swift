import Foundation

/// The website's small digit net, run by hand in Swift.
///
/// Two convolutions, two poolings and one fully connected layer — about
/// six thousand weights, trained on MNIST plus boxes from Snatzee's own
/// sheets (scripts/train-digits.py). The same bytes as the website's
/// `src/lib/scoresheet/digits/weights.ts`, stored as little-endian floats
/// in Resources/Digits/digit-weights.bin. Shapes fixed by the training
/// script: a 28x28 input, 8 and 16 filters of 5x5, ten outputs.
struct DigitNet: Sendable {
    static let input = 28
    private static let kernel = 5
    private static let conv1Count = 8
    private static let conv2Count = 16
    private static let classes = 10
    private static let pool1 = (input - kernel + 1) / 2   // 12
    private static let pool2 = (pool1 - kernel + 1) / 2   // 4
    private static let flat = conv2Count * pool2 * pool2

    private let conv1: [Float]
    private let conv1Bias: [Float]
    private let conv2: [Float]
    private let conv2Bias: [Float]
    /// [256][10], row-major.
    private let dense: [Float]
    private let denseBias: [Float]

    /// The shipped weights, loaded once.
    static let shared: DigitNet? = {
        guard let url = Bundle.main.url(forResource: "digit-weights", withExtension: "bin"),
              let data = try? Data(contentsOf: url) else { return nil }
        return DigitNet(data: data)
    }()

    /// Nil when the data is not the shape this net expects: a mismatched
    /// pair must fail loudly, not guess.
    init?(data: Data) {
        let sizes = [Self.conv1Count * Self.kernel * Self.kernel, Self.conv1Count,
                     Self.conv2Count * Self.conv1Count * Self.kernel * Self.kernel, Self.conv2Count,
                     Self.flat * Self.classes, Self.classes]
        guard data.count == sizes.reduce(0, +) * 4 else { return nil }
        let floats: [Float] = data.withUnsafeBytes { raw in
            (0..<data.count / 4).map { Float(bitPattern: UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: $0 * 4, as: UInt32.self))) }
        }
        var offset = 0
        func take(_ count: Int) -> [Float] {
            defer { offset += count }
            return Array(floats[offset..<offset + count])
        }
        conv1 = take(sizes[0]); conv1Bias = take(sizes[1])
        conv2 = take(sizes[2]); conv2Bias = take(sizes[3])
        dense = take(sizes[4]); denseBias = take(sizes[5])
    }

    /// The probability of each digit 0…9 for one 28x28 field (784 values
    /// in 0…1, ink as 1).
    func probabilities(_ field: [Float]) -> [Float] {
        let n = Self.input, k = Self.kernel, p1 = Self.pool1, p2 = Self.pool2
        var pooled1 = [Float](repeating: 0, count: Self.conv1Count * p1 * p1)
        for f in 0..<Self.conv1Count {
            let base = f * k * k
            for py in 0..<p1 {
                for px in 0..<p1 {
                    var best = -Float.infinity
                    for oy in 0..<2 {
                        for ox in 0..<2 {
                            let y0 = py * 2 + oy, x0 = px * 2 + ox
                            var sum = conv1Bias[f]
                            for ky in 0..<k {
                                let row = (y0 + ky) * n + x0, wrow = base + ky * k
                                for kx in 0..<k { sum += field[row + kx] * conv1[wrow + kx] }
                            }
                            best = max(best, sum)
                        }
                    }
                    pooled1[f * p1 * p1 + py * p1 + px] = max(0, best)
                }
            }
        }
        var pooled2 = [Float](repeating: 0, count: Self.flat)
        for f in 0..<Self.conv2Count {
            for py in 0..<p2 {
                for px in 0..<p2 {
                    var best = -Float.infinity
                    for oy in 0..<2 {
                        for ox in 0..<2 {
                            let y0 = py * 2 + oy, x0 = px * 2 + ox
                            var sum = conv2Bias[f]
                            for c in 0..<Self.conv1Count {
                                let channel = c * p1 * p1
                                let filter = (f * Self.conv1Count + c) * k * k
                                for ky in 0..<k {
                                    let row = channel + (y0 + ky) * p1 + x0, wrow = filter + ky * k
                                    for kx in 0..<k { sum += pooled1[row + kx] * conv2[wrow + kx] }
                                }
                            }
                            best = max(best, sum)
                        }
                    }
                    pooled2[f * p2 * p2 + py * p2 + px] = max(0, best)
                }
            }
        }
        var logits = [Float](repeating: 0, count: Self.classes)
        for c in 0..<Self.classes {
            var sum = denseBias[c]
            for i in 0..<Self.flat { sum += pooled2[i] * dense[i * Self.classes + c] }
            logits[c] = sum
        }
        let top = logits.max() ?? 0
        let exps = logits.map { exp($0 - top) }
        let total = exps.reduce(0, +)
        return exps.map { $0 / total }
    }
}

/// Scores every value a box may hold with the digit net: a port of the
/// website's `scoreCell` (src/lib/scoresheet/read.ts).
///
/// The ink is cut where it thins out between digits, every way of cutting
/// it into one, two or three pieces is classified once, and each allowed
/// value is scored by how well its digits match the pieces.
enum DigitScorer {
    /// Ignore this much of the box's edge, where the printed border bleeds.
    private static let inset = 0.1
    private static let edgeMargin = 3
    private static let maxCuts = 5
    /// The score for a value the box says nothing about.
    static let unseen = -12.0

    static func score(_ mask: BinaryImage, box: CellBox, allowed: [Int], net: DigitNet) -> [Int: Double] {
        var scores = Dictionary(uniqueKeysWithValues: allowed.map { ($0, unseen) })
        let x0 = max(0, Int((Double(box.x0) + Double(box.width) * inset).rounded()))
        let x1 = min(mask.width - 1, Int((Double(box.x1) - Double(box.width) * inset).rounded()))
        let y0 = max(0, Int((Double(box.y0) + Double(box.height) * inset).rounded()))
        let y1 = min(mask.height - 1, Int((Double(box.y1) - Double(box.height) * inset).rounded()))
        guard x1 > x0, y1 > y0 else { return scores }

        let width = x1 - x0 + 1
        var profile = [Int](repeating: 0, count: width)
        for x in x0...x1 { for y in y0...y1 where mask[x, y] { profile[x - x0] += 1 } }
        var left = 0, right = width - 1
        while left < width, profile[left] == 0 { left += 1 }
        while right > left, profile[right] == 0 { right -= 1 }
        guard right > left else { return scores }

        let cuts = cutPoints(profile, from: left, to: right)
        var cache: [String: [Double]?] = [:]
        func spread(_ a: Int, _ b: Int) -> [Double]? {
            let key = "\(a):\(b)"
            if let known = cache[key] { return known }
            var result: [Double]?
            if let input = field(mask, x0: x0 + a, y0: y0, x1: x0 + b, y1: y1) {
                let p = net.probabilities(input).map(Double.init)
                // Its two best; the rest share what is left, so an
                // unexpected digit is unlikely rather than impossible.
                let ranked = p.indices.sorted { p[$0] > p[$1] }
                let rest = max(0, 1 - p[ranked[0]] - p[ranked[1]]) / 8
                var s = [Double](repeating: rest, count: 10)
                s[ranked[0]] = p[ranked[0]]
                s[ranked[1]] = p[ranked[1]]
                result = s
            }
            cache[key] = result
            return result
        }

        var segmentations: [[Int]] = [[]]
        for cut in cuts { segmentations.append([cut]) }
        for i in cuts.indices { for j in (i + 1)..<cuts.count { segmentations.append([cuts[i], cuts[j]]) } }

        for points in segmentations {
            let bounds = [left] + points + [right]
            var parts: [(Int, Int)] = []
            for i in 0..<(bounds.count - 1) { parts.append((bounds[i] + (i > 0 ? 1 : 0), bounds[i + 1])) }
            let spreads = parts.map { spread($0.0, $0.1) }
            guard spreads.allSatisfy({ $0 != nil }) else { continue }
            for value in allowed {
                let digits = String(value).compactMap(\.wholeNumberValue)
                guard digits.count == parts.count else { continue }
                var total = 0.0
                for (index, digit) in digits.enumerated() { total += log(spreads[index]![digit] + 1e-6) }
                total /= Double(digits.count)
                if total > scores[value] ?? unseen { scores[value] = total }
            }
        }
        return scores
    }

    /// Where the ink thins out: the likeliest places between digits.
    private static func cutPoints(_ profile: [Int], from: Int, to: Int) -> [Int] {
        let width = profile.count
        let window = max(4, Int((Double(width) * 0.1).rounded()))
        var found: [(at: Int, depth: Int)] = []
        if to - edgeMargin >= from + edgeMargin {
            for x in (from + edgeMargin)...(to - edgeMargin) {
                var l = 0, r = 0
                for i in max(from, x - window)..<x { l = max(l, profile[i]) }
                if x + 1 <= min(to, x + window) { for i in (x + 1)...min(to, x + window) { r = max(r, profile[i]) } }
                let depth = min(l, r) - profile[x]
                if depth > 0 { found.append((x, depth)) }
            }
        }
        found.sort { $0.depth > $1.depth }
        var kept: [Int] = []
        for candidate in found {
            if kept.allSatisfy({ Double(abs($0 - candidate.at)) > Double(width) * 0.12 }) { kept.append(candidate.at) }
            if kept.count >= maxCuts { break }
        }
        return kept.sorted()
    }

    /// One slice of a box as MNIST's shape: its ink scaled so the longest
    /// side is 20px, averaged down (MNIST strokes have grey edges), and
    /// placed by its centre of mass in 28x28.
    private static func field(_ mask: BinaryImage, x0: Int, y0: Int, x1: Int, y1: Int) -> [Float]? {
        var top = -1, bottom = -1
        for y in y0...y1 where (x0...x1).contains(where: { mask[$0, y] }) {
            if top < 0 { top = y }
            bottom = y
        }
        guard top >= 0 else { return nil }
        let width = x1 - x0 + 1, height = bottom - top + 1
        let scale = 20 / Double(max(width, height))
        let sw = max(1, Int((Double(width) * scale).rounded())), sh = max(1, Int((Double(height) * scale).rounded()))
        var sum = [Float](repeating: 0, count: sw * sh), count = [Float](repeating: 0, count: sw * sh)
        for y in 0..<height {
            for x in 0..<width {
                let dx = min(sw - 1, Int(Double(x) * scale)), dy = min(sh - 1, Int(Double(y) * scale))
                count[dy * sw + dx] += 1
                if mask[x + x0, y + top] { sum[dy * sw + dx] += 1 }
            }
        }
        for i in sum.indices where count[i] > 0 { sum[i] /= count[i] }
        var mass: Float = 0, cx: Float = 0, cy: Float = 0
        for y in 0..<sh { for x in 0..<sw { let v = sum[y * sw + x]; mass += v; cx += Float(x) * v; cy += Float(y) * v } }
        guard mass > 0 else { return nil }
        let size = DigitNet.input
        let ox = Int((Float(size) / 2 - cx / mass).rounded()), oy = Int((Float(size) / 2 - cy / mass).rounded())
        var out = [Float](repeating: 0, count: size * size)
        for y in 0..<sh {
            for x in 0..<sw {
                let fx = x + ox, fy = y + oy
                guard fx >= 0, fy >= 0, fx < size, fy < size else { continue }
                out[fy * size + fx] = sum[y * sw + x]
            }
        }
        return out
    }
}
