import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import Vision

/// Reads a photographed paper scoresheet with Apple's Vision framework.
///
/// 1. `prepare`: finds the sheet in the photo and straightens it
///    (VNDetectDocumentSegmentationRequest + perspective correction) —
///    already done for pictures from the document camera.
/// 2. `scan`: reads the whole page (VNRecognizeTextRequest) to find the
///    rows and game columns from what is printed on it, then reads each
///    game column's strip on its own so handwriting in neighbouring boxes
///    can never run together.
/// 3. `solve`: turns one column's readings into the thirteen boxes.
///
/// Everything runs on the device; the photo is never stored or sent.
enum SheetScanner {
    /// Immutable once made, and handed from the background reader to the
    /// screen and back — hence `@unchecked`: CGImage is thread-safe to read.
    struct Scan: @unchecked Sendable {
        let layout: SheetLayout
        /// The straightened page, for the closer look at one column.
        let page: CGImage
        /// Per game number, what the whole-strip reading found in each row.
        let columns: [Int: [SheetLine: [CellReading]]]
        /// Game numbers with anything written in them, in order.
        let filledColumns: [Int]
    }

    /// One game column, fully read.
    struct ColumnReading {
        let readings: [SheetLine: [CellReading]]
        /// Rows with writing in them that could not be read.
        let unreadable: Set<SheetLine>
    }

    enum ScanError: LocalizedError {
        case unreadableImage
        case noSheet
        case noColumns
        case empty

        var errorDescription: String? {
            switch self {
            case .unreadableImage: "Deze foto kon niet worden geopend."
            case .noSheet: "Geen scoreblad herkend. Zorg dat het hele blad in beeld is, met de namen van de vakken leesbaar."
            case .noColumns: "De kolommen per spel zijn niet gevonden. Maak de foto recht van boven, met de bovenste rij in beeld."
            case .empty: "Er staat nog niets ingevuld op dit blad."
            }
        }
    }

    /// Photos larger than this are scaled down first: more pixels only make
    /// recognition slower, not better.
    private static let maxDimension: CGFloat = 2400

    // MARK: Pipeline

    /// Reads the sheet: layout, then every game column.
    static func scan(_ image: CGImage) throws -> Scan {
        let page = scaledDown(image)
        let lines = try recognize(page)

        let layout: SheetLayout
        switch SheetLayout.detect(in: lines) {
        case .success(let found): layout = found
        case .failure(.noRows): throw ScanError.noSheet
        case .failure(.noColumns): throw ScanError.noColumns
        }

        var columns: [Int: [SheetLine: [CellReading]]] = [:]
        for column in layout.columns {
            columns[column.number] = try readStrip(column, of: page, layout: layout)
        }

        // Filled in: at least a few boxes with something legible.
        let filled = layout.columns.map(\.number).filter { number in
            (columns[number] ?? [:]).filter { if case .entry = $0.key { return !$0.value.isEmpty }; return false }.count >= 3
        }
        guard !filled.isEmpty else { throw ScanError.empty }
        return Scan(layout: layout, page: page, columns: columns, filledColumns: filled)
    }

    /// Reads one game column completely — the strip reading plus a closer
    /// look at every box it missed — and picks its values.
    static func read(_ scan: Scan, column number: Int) throws -> (reading: ColumnReading, result: SheetSolver.Result) {
        guard let column = scan.layout.columns.first(where: { $0.number == number }) else {
            return (ColumnReading(readings: [:], unreadable: []), SheetSolver.solve([:]))
        }
        let reading = try readColumn(column, of: scan.page, layout: scan.layout, strip: scan.columns[number] ?? [:])
        return (reading, SheetSolver.solve(reading.readings, inked: reading.unreadable))
    }

    /// One column's strip, read on its own and sorted into rows; then a
    /// closer look at every box with writing in it that was not read.
    private static func readColumn(_ column: SheetLayout.Column, of page: CGImage, layout: SheetLayout,
                                   strip: [SheetLine: [CellReading]]) throws -> ColumnReading {
        var readings = strip
        var unreadable = Set<SheetLine>()
        for row in layout.rows where (readings[row.line] ?? []).isEmpty {
            let cell = cellRect(column: column, row: row, layout: layout)
            guard hasInk(in: cell, of: page) else { continue }
            let second = try readCell(cell, of: page)
            if second.isEmpty {
                unreadable.insert(row.line)
            } else {
                readings[row.line] = second
            }
        }
        return ColumnReading(readings: readings, unreadable: unreadable)
    }

    /// One box, in page coordinates: a little inside its column and row so
    /// the printed borders stay out.
    private static func cellRect(column: SheetLayout.Column, row: SheetLayout.Row, layout: SheetLayout) -> CGRect {
        CGRect(x: column.centerX - column.width * 0.44, y: row.midY - layout.rowHeight * 0.42,
               width: column.width * 0.88, height: layout.rowHeight * 0.84)
    }

    private static func pixelRect(_ rect: CGRect, in image: CGImage) -> CGRect {
        let width = CGFloat(image.width), height = CGFloat(image.height)
        return CGRect(x: rect.minX * width, y: rect.minY * height, width: rect.width * width, height: rect.height * height)
            .integral
            .intersection(CGRect(x: 0, y: 0, width: width, height: height))
    }

    /// Whether anything is written in a box: dark marks on the paper at
    /// its centre, where the printed edges do not reach.
    static func hasInk(in cell: CGRect, of page: CGImage) -> Bool {
        // The middle of the box only: its printed edges, the gaps between
        // boxes and shadows along them stay out.
        let centre = cell.insetBy(dx: cell.width * 0.28, dy: cell.height * 0.3)
        guard let crop = page.cropping(to: pixelRect(centre, in: page)) else { return false }
        let width = 48, height = 24
        var pixels = [UInt8](repeating: 0, count: width * height)
        guard let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                                      bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
        context.interpolationQuality = .medium
        context.draw(crop, in: CGRect(x: 0, y: 0, width: width, height: height))
        // The paper is the brighter half; ink is what is much darker.
        let sorted = pixels.sorted()
        let paper = Double(sorted[sorted.count * 3 / 4])
        guard paper > 110 else { return false } // not a white box at all
        let threshold = paper * 0.55
        let dark = pixels.filter { Double($0) < threshold }.count
        return Double(dark) / Double(pixels.count) > 0.03
    }

    /// A second look at one box: cut out, enlarged, on a white margin, read
    /// by both of Vision's recognisers. Single digits standing alone are
    /// what the whole-strip reading misses most.
    private static func readCell(_ cell: CGRect, of page: CGImage) throws -> [CellReading] {
        guard let crop = page.cropping(to: pixelRect(cell, in: page)) else { return [] }
        let scale: CGFloat = max(1, 96 / CGFloat(max(crop.height, 1)))
        let inner = CIImage(cgImage: crop).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let w = inner.extent.width, h = inner.extent.height
        let margin = h * 0.6

        // The box three times side by side: "4 4 4" is read far more
        // reliably than a lone "4", and three copies agreeing is evidence
        // in itself.
        let copies = 3
        let gap = h * 0.5
        let canvas = CGRect(x: 0, y: 0, width: margin * 2 + w * CGFloat(copies) + gap * CGFloat(copies - 1),
                            height: h + margin * 2)
        var composed = CIImage(color: .white).cropped(to: canvas)
        for copy in 0..<copies {
            let x = margin + CGFloat(copy) * (w + gap)
            composed = inner
                .transformed(by: CGAffineTransform(translationX: x - inner.extent.minX, y: margin - inner.extent.minY))
                .composited(over: composed)
        }
        guard let image = CIContext().createCGImage(composed, from: canvas) else { return [] }

        var candidates: [OCRLine.Candidate] = []
        for level in [VNRequestTextRecognitionLevel.accurate, .fast] {
            let lines = try recognize(image, level: level).sorted { $0.box.minX < $1.box.minX }
            for line in lines {
                for candidate in line.candidates {
                    let tokens = candidate.text.split(whereSeparator: \.isWhitespace).map(String.init)
                    // Copies that agree: one reading, with their confidence.
                    if tokens.count >= 2, Set(tokens).count == 1 {
                        candidates.append(.init(text: tokens[0], confidence: min(1, candidate.confidence + 0.2)))
                    } else if tokens.count >= 2 {
                        // They disagree: each is a guess, less sure.
                        candidates += tokens.map { .init(text: $0, confidence: candidate.confidence * 0.5) }
                    } else if let only = tokens.first {
                        // Run together ("444"): a repeated pattern is one copy.
                        candidates.append(.init(text: repeatedUnit(only, copies: copies) ?? only, confidence: candidate.confidence * 0.7))
                    }
                }
            }
        }
        return CellParser.readings(from: candidates)
    }

    /// "444" → "4", "121212" → "12": the one copy a run-together reading
    /// of the tiled box repeats, or nil when it does not repeat.
    static func repeatedUnit(_ text: String, copies: Int) -> String? {
        guard text.count % copies == 0 else { return nil }
        let length = text.count / copies
        let unit = String(text.prefix(length))
        return String(repeating: unit, count: copies) == text ? unit : nil
    }

    /// One column's strip, read on its own and sorted into rows.
    private static func readStrip(_ column: SheetLayout.Column, of page: CGImage, layout: SheetLayout) throws -> [SheetLine: [CellReading]] {
        let strip = layout.strip(for: column)
        let width = CGFloat(page.width), height = CGFloat(page.height)
        let pixels = CGRect(x: strip.minX * width, y: strip.minY * height,
                            width: strip.width * width, height: strip.height * height).integral
        guard let crop = page.cropping(to: pixels) else { return [:] }

        // Grouped per printed row, not per kind of box: "Totaal van de
        // bovenste helft" is printed twice, and those are two readings of
        // the same number, not one long one.
        var byRow: [CGFloat: (line: SheetLine, pieces: [(x: CGFloat, candidates: [OCRLine.Candidate])])] = [:]
        for line in try recognize(crop) {
            // Back to page coordinates.
            let midY = strip.minY + line.box.midY * strip.height
            let midX = strip.minX + line.box.midX * strip.width
            guard let row = layout.row(atY: midY) else { continue }
            byRow[row.midY, default: (row.line, [])].pieces.append((midX, line.candidates))
        }

        var readings: [SheetLine: [CellReading]] = [:]
        for (_, row) in byRow {
            let ordered = row.pieces.sorted { $0.x < $1.x }
            var candidates: [OCRLine.Candidate] = []
            if ordered.count > 1 {
                // Split over two readings ("2" "0"): join the best guesses,
                // and keep each piece's own alternatives too.
                let joined = ordered.compactMap { $0.candidates.first?.text }.joined()
                let confidence = ordered.compactMap { $0.candidates.first?.confidence }.min() ?? 0
                candidates.append(OCRLine.Candidate(text: joined, confidence: confidence))
            }
            candidates += ordered.flatMap(\.candidates)
            let parsed = CellParser.readings(from: candidates)
            readings[row.line] = ((readings[row.line] ?? []) + parsed).sorted { $0.confidence > $1.confidence }
        }
        return readings
    }

    // MARK: Vision

    /// All text on an image, in page coordinates (0…1, top left).
    static func recognize(_ image: CGImage, level: VNRequestTextRecognitionLevel = .accurate) throws -> [OCRLine] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = level
        // Scores are numbers, not words: correcting them towards a
        // dictionary only does harm.
        request.usesLanguageCorrection = false
        let wanted = ["nl-NL", "en-US"]
        if let supported = try? request.supportedRecognitionLanguages() {
            let languages = wanted.filter(supported.contains)
            if !languages.isEmpty { request.recognitionLanguages = languages }
        }

        let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
        try handler.perform([request])

        return (request.results ?? []).compactMap { observation in
            let top = observation.topCandidates(5)
            guard let first = top.first else { return nil }
            var line = OCRLine(
                candidates: top.map { OCRLine.Candidate(text: $0.string, confidence: $0.confidence) },
                box: pageRect(observation.boundingBox)
            )
            line.words = words(in: first)
            return line
        }
    }

    /// The best reading split at its spaces, each word with its own box.
    private static func words(in text: VNRecognizedText) -> [(text: String, box: CGRect)] {
        let string = text.string
        var result: [(text: String, box: CGRect)] = []
        var index = string.startIndex
        while index < string.endIndex {
            guard let start = string[index...].firstIndex(where: { !$0.isWhitespace }) else { break }
            let end = string[start...].firstIndex(where: \.isWhitespace) ?? string.endIndex
            if let box = try? text.boundingBox(for: start..<end)?.boundingBox {
                result.append((text: String(string[start..<end]), box: pageRect(box)))
            }
            index = end
        }
        return result
    }

    /// Vision's normalised rectangles start bottom left; ours top left.
    private static func pageRect(_ box: CGRect) -> CGRect {
        CGRect(x: box.minX, y: 1 - box.maxY, width: box.width, height: box.height)
    }

    // MARK: Preparing a photo

    /// Finds the sheet in a photo and straightens it. Returns the photo
    /// as it was when no sheet-shaped outline is found.
    static func prepare(_ image: CGImage) -> CGImage {
        let scaled = scaledDown(image)
        let request = VNDetectDocumentSegmentationRequest()
        let handler = VNImageRequestHandler(cgImage: scaled, orientation: .up)
        guard (try? handler.perform([request])) != nil,
              let document = request.results?.first,
              document.confidence > 0.5 else { return scaled }

        // Too small to be the sheet: probably a detail on it.
        let area = polygonArea([document.topLeft, document.topRight, document.bottomRight, document.bottomLeft])
        guard area > 0.25 else { return scaled }

        let size = CGSize(width: scaled.width, height: scaled.height)
        func point(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * size.width, y: p.y * size.height) }

        let filter = CIFilter.perspectiveCorrection()
        filter.inputImage = CIImage(cgImage: scaled)
        filter.topLeft = point(document.topLeft)
        filter.topRight = point(document.topRight)
        filter.bottomLeft = point(document.bottomLeft)
        filter.bottomRight = point(document.bottomRight)
        guard let output = filter.outputImage,
              let corrected = CIContext().createCGImage(output, from: output.extent) else { return scaled }
        return corrected
    }

    private static func polygonArea(_ points: [CGPoint]) -> CGFloat {
        var sum: CGFloat = 0
        for i in points.indices {
            let a = points[i], b = points[(i + 1) % points.count]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2
    }

    private static func scaledDown(_ image: CGImage) -> CGImage {
        let longest = CGFloat(max(image.width, image.height))
        guard longest > maxDimension else { return image }
        let scale = maxDimension / longest
        let input = CIImage(cgImage: image).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        return CIContext().createCGImage(input, from: input.extent) ?? image
    }
}
