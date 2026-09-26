import CoreGraphics
import Foundation

/// One channel, row-major, one byte per pixel.
struct GrayImage: Sendable {
    let width: Int
    let height: Int
    var data: [UInt8]
}

/// 1 = ink, 0 = paper.
struct BinaryImage: Sendable {
    let width: Int
    let height: Int
    var data: [UInt8]

    subscript(x: Int, y: Int) -> Bool { data[y * width + x] == 1 }
}

/// Turning a photo of a scoresheet into something the grid detection can
/// read — the same steps, in the same order, as the website's
/// `src/lib/scoresheet/preprocess.ts`, each for a property of a photo
/// taken by hand on a table:
///
/// 1. greyscale — ink is darker than paper; hue says nothing useful.
/// 2. downscale — a 12MP photo has far more pixels than the boxes need.
/// 3. flatten — a lamp on one side makes the far paper darker than the
///    near ink; dividing by a blurred copy of the page removes that.
/// 4. deskew — a degree or two of tilt smears every row of boxes.
/// 5. binarise — after flattening, one Otsu threshold is enough.
enum SheetImage {
    /// Longest side the reading works at: a row is still ~25px tall.
    static let workSize = 1600
    private static let maxSkew = 10.0
    private static let coarseStep = 0.5
    private static let fineStep = 0.05
    private static let skewWidth = 600
    private static let backgroundFraction = 1.0 / 16

    struct Prepared: Sendable {
        /// Flattened, deskewed greyscale.
        let gray: GrayImage
        /// Ink = 1, from `gray`.
        let mask: BinaryImage
        /// Degrees the image was rotated by to level it.
        let skew: Double
        /// Work pixels per pixel of the image it was made from.
        let scale: Double

        /// Where a point of the work image was in the image it was made
        /// from: the rotation undone, then the scaling.
        func sourcePoint(x: Double, y: Double) -> CGPoint {
            let rad = -skew * .pi / 180
            let cx = Double(gray.width - 1) / 2, cy = Double(gray.height - 1) / 2
            let dx = x - cx, dy = y - cy
            let sx = cos(rad) * dx + sin(rad) * dy + cx
            let sy = -sin(rad) * dx + cos(rad) * dy + cy
            return CGPoint(x: sx / scale, y: sy / scale)
        }
    }

    /// greyscale → downscale → flatten → deskew → threshold.
    static func prepare(_ image: CGImage, maxSide: Int = workSize) -> Prepared? {
        guard let small = gray(from: image, maxSide: maxSide) else { return nil }
        let flat = flattenLighting(small)
        let skew = estimateSkew(flat)
        // Rotating after flattening: the rotation's white corners would
        // otherwise brighten the background estimate along the edges.
        let level = rotate(flat, degrees: -skew)
        let threshold = otsuThreshold(level)
        return Prepared(gray: level, mask: binarise(level, threshold: threshold), skew: skew,
                        scale: Double(small.width) / Double(image.width))
    }

    /// The photo as greyscale, its longest side at most `maxSide`.
    /// Core Graphics averages when it scales down, which keeps thin
    /// printed lines present rather than dropping them.
    static func gray(from image: CGImage, maxSide: Int) -> GrayImage? {
        let longest = max(image.width, image.height)
        let scale = min(1, Double(maxSide) / Double(longest))
        let width = max(1, Int((Double(image.width) * scale).rounded()))
        let height = max(1, Int((Double(image.height) * scale).rounded()))
        var data = [UInt8](repeating: 255, count: width * height)
        let drawn = data.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                                          bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.interpolationQuality = .high
            context.setFillColor(gray: 1, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? GrayImage(width: width, height: height, data: data) : nil
    }

    /// Area-average downscale of a greyscale image.
    static func downscale(_ image: GrayImage, maxSide: Int) -> GrayImage {
        let longest = max(image.width, image.height)
        guard longest > maxSide else { return image }
        let scale = Double(maxSide) / Double(longest)
        let outW = max(1, Int((Double(image.width) * scale).rounded()))
        let outH = max(1, Int((Double(image.height) * scale).rounded()))
        var out = [UInt8](repeating: 0, count: outW * outH)
        image.data.withUnsafeBufferPointer { src in
            for y in 0..<outH {
                let y0 = y * image.height / outH
                let y1 = max(y0 + 1, (y + 1) * image.height / outH)
                for x in 0..<outW {
                    let x0 = x * image.width / outW
                    let x1 = max(x0 + 1, (x + 1) * image.width / outW)
                    var sum = 0, count = 0
                    for sy in y0..<y1 {
                        let row = sy * image.width
                        for sx in x0..<x1 { sum += Int(src[row + sx]); count += 1 }
                    }
                    out[y * outW + x] = UInt8(sum / count)
                }
            }
        }
        return GrayImage(width: outW, height: outH, data: out)
    }

    /// Box blur via a summed-area table: cost independent of the radius.
    static func boxBlur(_ image: GrayImage, radius: Double) -> [Double] {
        let w = image.width, h = image.height
        let r = max(1, Int(radius.rounded()))
        var table = [Double](repeating: 0, count: (w + 1) * (h + 1))
        image.data.withUnsafeBufferPointer { src in
            table.withUnsafeMutableBufferPointer { sat in
                for y in 0..<h {
                    var rowSum = 0.0
                    let cur = (y + 1) * (w + 1), prev = y * (w + 1)
                    for x in 0..<w {
                        rowSum += Double(src[y * w + x])
                        sat[cur + x + 1] = sat[prev + x + 1] + rowSum
                    }
                }
            }
        }
        var out = [Double](repeating: 0, count: w * h)
        table.withUnsafeBufferPointer { sat in
            for y in 0..<h {
                let y0 = max(0, y - r), y1 = min(h - 1, y + r)
                let top = y0 * (w + 1), bottom = (y1 + 1) * (w + 1)
                for x in 0..<w {
                    let x0 = max(0, x - r), x1 = min(w - 1, x + r)
                    let area = Double((x1 - x0 + 1) * (y1 - y0 + 1))
                    out[y * w + x] = (sat[bottom + x1 + 1] - sat[bottom + x0] - sat[top + x1 + 1] + sat[top + x0]) / area
                }
            }
        }
        return out
    }

    /// Divides the page by a blurred copy of itself: 255 wherever there
    /// is only paper, whatever its local brightness; well below where
    /// there is a mark.
    static func flattenLighting(_ image: GrayImage) -> GrayImage {
        let background = boxBlur(image, radius: Double(min(image.width, image.height)) * backgroundFraction)
        var out = [UInt8](repeating: 0, count: image.data.count)
        for i in out.indices {
            let bg = max(background[i], 16)
            out[i] = UInt8(min(255, Double(image.data[i]) / bg * 255))
        }
        return GrayImage(width: image.width, height: image.height, data: out)
    }

    /// Otsu: the split that best separates the histogram in two.
    static func otsuThreshold(_ image: GrayImage) -> Int {
        var histogram = [Double](repeating: 0, count: 256)
        for value in image.data { histogram[Int(value)] += 1 }
        let total = Double(image.data.count)
        var sum = 0.0
        for v in 0..<256 { sum += Double(v) * histogram[v] }
        var weightBelow = 0.0, sumBelow = 0.0, best = 0, bestVariance = -1.0
        for t in 0..<256 {
            weightBelow += histogram[t]
            guard weightBelow > 0 else { continue }
            let weightAbove = total - weightBelow
            guard weightAbove > 0 else { break }
            sumBelow += Double(t) * histogram[t]
            let between = weightBelow * weightAbove * pow(sumBelow / weightBelow - (sum - sumBelow) / weightAbove, 2)
            if between > bestVariance { bestVariance = between; best = t }
        }
        return best
    }

    /// At or below the threshold is ink.
    static func binarise(_ image: GrayImage, threshold: Int) -> BinaryImage {
        BinaryImage(width: image.width, height: image.height,
                    data: image.data.map { Int($0) <= threshold ? 1 : 0 })
    }

    /// How sharply the rows of ink line up at an angle: ink per row
    /// after shearing, summed squared differences between neighbours.
    private static func skewScore(_ mask: BinaryImage, radians: Double) -> Double {
        let w = mask.width, h = mask.height
        let slope = tan(radians)
        var profile = [Double](repeating: 0, count: h)
        mask.data.withUnsafeBufferPointer { data in
            for y in 0..<h {
                let row = y * w
                for x in 0..<w where data[row + x] == 1 {
                    let target = y - Int((Double(x - w / 2) * slope).rounded())
                    if target >= 0, target < h { profile[target] += 1 }
                }
            }
        }
        var score = 0.0
        for y in 1..<max(1, h) { let d = profile[y] - profile[y - 1]; score += d * d }
        return score
    }

    /// The sheet's rotation in degrees, positive clockwise: half a degree
    /// across the range, then a twentieth around the winner.
    static func estimateSkew(_ image: GrayImage) -> Double {
        let small = downscale(image, maxSide: skewWidth)
        let mask = binarise(small, threshold: otsuThreshold(small))
        var best = 0.0, bestScore = -1.0
        for deg in stride(from: -maxSkew, through: maxSkew, by: coarseStep) {
            let score = skewScore(mask, radians: deg * .pi / 180)
            if score > bestScore { bestScore = score; best = deg }
        }
        for deg in stride(from: best - coarseStep, through: best + coarseStep, by: fineStep) {
            let score = skewScore(mask, radians: deg * .pi / 180)
            if score > bestScore { bestScore = score; best = deg }
        }
        return best
    }

    /// Rotates about the centre, bilinear; what comes in from outside is
    /// paper-white.
    static func rotate(_ image: GrayImage, degrees: Double) -> GrayImage {
        guard abs(degrees) >= 0.01 else { return image }
        let w = image.width, h = image.height
        let rad = degrees * .pi / 180
        let c = cos(rad), s = sin(rad)
        let cx = Double(w - 1) / 2, cy = Double(h - 1) / 2
        var out = [UInt8](repeating: 255, count: w * h)
        image.data.withUnsafeBufferPointer { src in
            for y in 0..<h {
                let dy = Double(y) - cy
                for x in 0..<w {
                    let dx = Double(x) - cx
                    let sx = c * dx + s * dy + cx
                    let sy = -s * dx + c * dy + cy
                    guard sx >= 0, sy >= 0, sx <= Double(w - 1), sy <= Double(h - 1) else { continue }
                    let x0 = Int(sx), y0 = Int(sy)
                    let x1 = min(x0 + 1, w - 1), y1 = min(y0 + 1, h - 1)
                    let fx = sx - Double(x0), fy = sy - Double(y0)
                    let top = Double(src[y0 * w + x0]) * (1 - fx) + Double(src[y0 * w + x1]) * fx
                    let bottom = Double(src[y1 * w + x0]) * (1 - fx) + Double(src[y1 * w + x1]) * fx
                    out[y * w + x] = UInt8(max(0, min(255, top * (1 - fy) + bottom * fy)))
                }
            }
        }
        return GrayImage(width: w, height: h, data: out)
    }

    /// A greyscale image back as a CGImage, for Vision.
    static func cgImage(_ image: GrayImage) -> CGImage? {
        guard let provider = CGDataProvider(data: Data(image.data) as CFData) else { return nil }
        return CGImage(width: image.width, height: image.height, bitsPerComponent: 8, bitsPerPixel: 8,
                       bytesPerRow: image.width, space: CGColorSpaceCreateDeviceGray(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
