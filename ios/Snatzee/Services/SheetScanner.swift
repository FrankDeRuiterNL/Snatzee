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
    struct Scan: Sendable {
        let layout: SheetLayout
        /// Per game number, what was read in each row.
        let columns: [Int: [SheetLine: [CellReading]]]
        /// Game numbers with anything written in them, in order.
        let filledColumns: [Int]
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
            columns[column.number] = try readColumn(column, of: page, layout: layout)
        }

        let filled = layout.columns.map(\.number).filter { number in
            let rows = columns[number] ?? [:]
            let entries = rows.filter { if case .entry = $0.key { return !$0.value.isEmpty }; return false }
            return entries.count >= 3
        }
        guard !filled.isEmpty else { throw ScanError.empty }
        return Scan(layout: layout, columns: columns, filledColumns: filled)
    }

    static func solve(_ scan: Scan, column: Int) -> SheetSolver.Result {
        SheetSolver.solve(scan.columns[column] ?? [:])
    }

    /// One column's strip, read on its own and sorted into rows.
    private static func readColumn(_ column: SheetLayout.Column, of page: CGImage, layout: SheetLayout) throws -> [SheetLine: [CellReading]] {
        let strip = layout.strip(for: column)
        let width = CGFloat(page.width), height = CGFloat(page.height)
        let pixels = CGRect(x: strip.minX * width, y: strip.minY * height,
                            width: strip.width * width, height: strip.height * height).integral
        guard let crop = page.cropping(to: pixels) else { return [:] }

        var byRow: [SheetLine: [(x: CGFloat, candidates: [OCRLine.Candidate])]] = [:]
        for line in try recognize(crop) {
            // Back to page coordinates.
            let midY = strip.minY + line.box.midY * strip.height
            let midX = strip.minX + line.box.midX * strip.width
            guard let row = layout.row(atY: midY) else { continue }
            byRow[row.line, default: []].append((midX, line.candidates))
        }

        var readings: [SheetLine: [CellReading]] = [:]
        for (line, pieces) in byRow {
            let ordered = pieces.sorted { $0.x < $1.x }
            if ordered.count == 1 {
                readings[line] = CellParser.readings(from: ordered[0].candidates)
            } else {
                // Split over two readings ("2" "0"): join the best guesses,
                // and keep each piece's own alternatives too.
                let joined = ordered.compactMap { $0.candidates.first?.text }.joined()
                let confidence = ordered.compactMap { $0.candidates.first?.confidence }.min() ?? 0
                var candidates = [OCRLine.Candidate(text: joined, confidence: confidence)]
                candidates += ordered.flatMap(\.candidates)
                readings[line] = CellParser.readings(from: candidates)
            }
        }
        return readings
    }

    // MARK: Vision

    /// All text on an image, in page coordinates (0…1, top left).
    static func recognize(_ image: CGImage) throws -> [OCRLine] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
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
