import Foundation

/// The website's small digit net, run by hand in Swift.
///
/// Two convolutions, two poolings and one fully connected layer — about
/// six thousand weights, trained on MNIST plus boxes from Snatzee's own
/// sheets (scripts/train-digits.py). It reads one handwritten digit at a
/// time, which is exactly where Vision is weakest: a lone "4" in a box.
/// So it is used as a second opinion for boxes with ink Vision could not
/// read, never instead of it.
///
/// The shapes are fixed by the training script: a 28x28 input, 8 filters
/// of 5x5, 16 filters of 5x5, ten outputs. The weights are the same bytes
/// as src/lib/scoresheet/digits/weights.ts, stored as little-endian
/// floats in Resources/Digits/digit-weights.bin.
struct DigitNet: Sendable {
    static let input = 28
    private static let kernel = 5
    private static let conv1Count = 8
    private static let conv2Count = 16
    private static let classes = 10
    private static let size1 = input - kernel + 1   // 24
    private static let pool1 = size1 / 2             // 12
    private static let size2 = pool1 - kernel + 1   // 8
    private static let pool2 = size2 / 2             // 4
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
        guard let url = Bundle.main.url(forResource: "digit-weights", withExtension: "bin")
                ?? Bundle(for: BundleToken.self).url(forResource: "digit-weights", withExtension: "bin"),
              let data = try? Data(contentsOf: url) else { return nil }
        return DigitNet(data: data)
    }()

    private final class BundleToken {}

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

    /// The probability of each digit 0…9 for one 28x28 field, given as
    /// 784 values in 0…1 with ink as 1.
    func probabilities(_ field: [Float]) -> [Float] {
        let n = Self.input, k = Self.kernel, p1 = Self.pool1, p2 = Self.pool2

        // Convolution + ReLU + 2x2 max pooling, in one go.
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

/// A box's ink cut into digits and shaped the way MNIST is, for the net.
enum DigitCutter {
    /// A black-and-white picture of one box, row by row, ink as true.
    struct Mask {
        let width: Int
        let height: Int
        let ink: [Bool]

        subscript(x: Int, y: Int) -> Bool { ink[y * width + x] }
    }

    /// Ink smaller than this fraction of the box is a speck.
    private static let minBlob = 0.004
    /// Blobs overlapping this much of the narrower one's width are one digit.
    private static let mergeOverlap = 0.45

    struct Piece {
        var x0: Int, y0: Int, x1: Int, y1: Int
        var pixels: [Int]
        var width: Int { x1 - x0 + 1 }
        var height: Int { y1 - y0 + 1 }
    }

    /// The digits in a box, left to right, each a 28x28 field. Empty when
    /// there is no ink, nil when it is not something a box would hold as
    /// digits (more than three pieces).
    static func digits(in mask: Mask) -> (fields: [[Float]], pieces: [Piece])? {
        let pieces = groupIntoDigits(blobs(in: mask))
        guard pieces.count <= 3 else { return nil }
        return (pieces.map { field(for: $0, in: mask) }, pieces)
    }

    /// 8-connected blobs of ink.
    static func blobs(in mask: Mask) -> [Piece] {
        var seen = [Bool](repeating: false, count: mask.ink.count)
        var found: [Piece] = []
        for start in mask.ink.indices where mask.ink[start] && !seen[start] {
            seen[start] = true
            var stack = [start]
            var piece = Piece(x0: start % mask.width, y0: start / mask.width,
                              x1: start % mask.width, y1: start / mask.width, pixels: [])
            while let p = stack.popLast() {
                let x = p % mask.width, y = p / mask.width
                piece.pixels.append(p)
                piece.x0 = min(piece.x0, x); piece.x1 = max(piece.x1, x)
                piece.y0 = min(piece.y0, y); piece.y1 = max(piece.y1, y)
                for dy in -1...1 {
                    for dx in -1...1 {
                        let nx = x + dx, ny = y + dy
                        guard nx >= 0, ny >= 0, nx < mask.width, ny < mask.height else { continue }
                        let q = ny * mask.width + nx
                        guard mask.ink[q], !seen[q] else { continue }
                        seen[q] = true
                        stack.append(q)
                    }
                }
            }
            found.append(piece)
        }
        let area = Double(mask.width * mask.height)
        return found.filter { Double($0.pixels.count) >= area * minBlob }
    }

    /// Blobs above or below one another (the two strokes of a 4, a 5's
    /// loose top bar) belong to one digit.
    static func groupIntoDigits(_ blobs: [Piece]) -> [Piece] {
        var groups: [Piece] = []
        for blob in blobs.sorted(by: { $0.x0 < $1.x0 }) {
            if var last = groups.last {
                let overlap = min(last.x1, blob.x1) - max(last.x0, blob.x0) + 1
                let narrower = min(last.width, blob.width)
                if overlap > 0, Double(overlap) >= Double(narrower) * mergeOverlap {
                    last.x0 = min(last.x0, blob.x0); last.y0 = min(last.y0, blob.y0)
                    last.x1 = max(last.x1, blob.x1); last.y1 = max(last.y1, blob.y1)
                    last.pixels += blob.pixels
                    groups[groups.count - 1] = last
                    continue
                }
            }
            groups.append(blob)
        }
        return groups
    }

    /// One digit scaled so its longest side is 20 pixels, averaged down
    /// (MNIST's strokes have grey edges) and placed by its centre of mass
    /// in a 28x28 field — the shape the net was trained on.
    static func field(for piece: Piece, in mask: Mask) -> [Float] {
        let size = DigitNet.input
        let scale = 20 / Double(max(piece.width, piece.height))
        let smallWidth = max(1, Int((Double(piece.width) * scale).rounded()))
        let smallHeight = max(1, Int((Double(piece.height) * scale).rounded()))
        var sum = [Float](repeating: 0, count: smallWidth * smallHeight)
        var count = [Float](repeating: 0, count: smallWidth * smallHeight)
        let own = Set(piece.pixels)
        for y in 0..<piece.height {
            for x in 0..<piece.width {
                let dx = min(smallWidth - 1, Int(Double(x) * scale))
                let dy = min(smallHeight - 1, Int(Double(y) * scale))
                count[dy * smallWidth + dx] += 1
                if own.contains((y + piece.y0) * mask.width + x + piece.x0) { sum[dy * smallWidth + dx] += 1 }
            }
        }
        for i in sum.indices where count[i] > 0 { sum[i] /= count[i] }

        var mass: Float = 0, cx: Float = 0, cy: Float = 0
        for y in 0..<smallHeight {
            for x in 0..<smallWidth {
                let v = sum[y * smallWidth + x]
                mass += v; cx += Float(x) * v; cy += Float(y) * v
            }
        }
        var out = [Float](repeating: 0, count: size * size)
        guard mass > 0 else { return out }
        let ox = Int((Float(size) / 2 - cx / mass).rounded())
        let oy = Int((Float(size) / 2 - cy / mass).rounded())
        for y in 0..<smallHeight {
            for x in 0..<smallWidth {
                let fx = x + ox, fy = y + oy
                guard fx >= 0, fy >= 0, fx < size, fy < size else { continue }
                out[fy * size + fx] = sum[y * smallWidth + x]
            }
        }
        return out
    }

    /// What the net makes of a box: a stroke for one long flat mark,
    /// otherwise the likeliest numbers its digits spell, best first.
    static func readings(for mask: Mask, net: DigitNet) -> [CellReading] {
        guard let cut = digits(in: mask), !cut.pieces.isEmpty else { return [] }
        let pieces = cut.pieces
        // "—" or "/" across the box: struck out.
        if pieces.count == 1, pieces[0].width > pieces[0].height * 5 / 2 {
            return [CellReading(mark: .stroke, confidence: 0.6)]
        }

        // Per digit its two likeliest values; every combination of those.
        var numbers: [(digits: String, probability: Float)] = [("", 1)]
        for field in cut.fields {
            let probabilities = net.probabilities(field)
            let ranked = probabilities.indices.sorted { probabilities[$0] > probabilities[$1] }.prefix(2)
            numbers = numbers.flatMap { number in
                ranked.map { (digits: number.digits + String($0), probability: number.probability * probabilities[$0]) }
            }
        }
        // The net is weaker than Vision; its word counts for less, and a
        // number is only as sure as its least sure digit.
        let weight: Float = 0.7
        return numbers
            .compactMap { number -> CellReading? in
                guard let value = Int(number.digits) else { return nil }
                let perDigit = pow(number.probability, 1 / Float(max(1, number.digits.count)))
                return CellReading(mark: .number(value), confidence: perDigit * weight)
            }
            .sorted { $0.confidence > $1.confidence }
    }
}
