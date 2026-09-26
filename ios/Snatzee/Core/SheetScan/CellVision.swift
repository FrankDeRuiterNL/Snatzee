import CoreGraphics
import Foundation
import Vision

/// What Apple's text recognition reads in one box: the numbers it may
/// say, each with Vision's confidence.
enum CellVision {
    /// Characters handwriting recognition returns for digits.
    private static let lookalikes: [Character: Character] = [
        "O": "0", "o": "0", "Q": "0", "D": "0",
        "l": "1", "I": "1", "i": "1", "|": "1", "!": "1", "]": "1", "[": "1", "j": "1", "J": "1",
        "Z": "2", "z": "2", "S": "5", "s": "5", "b": "6", "G": "6", "T": "7", "B": "8", "g": "9", "q": "9",
    ]
    private static let ignorable: Set<Character> = [".", ",", "·", "'", "’", "`", "\"", ":", ";", " "]

    /// The number a piece of recognised text says, if it says one.
    static func number(in text: String) -> Int? {
        var digits = ""
        for character in text where !ignorable.contains(character) {
            if character.isASCII, character.isNumber {
                digits.append(character)
            } else if let digit = lookalikes[character] {
                digits.append(digit)
            } else {
                return nil
            }
        }
        guard !digits.isEmpty, digits.count <= 3 else { return nil }
        return Int(digits)
    }

    /// Per number, the best confidence Vision gave it for this box.
    ///
    /// The box is cut from the levelled greyscale page a little inside its
    /// border and put on a white margin, so the recogniser sees one
    /// number on paper and nothing of the grid.
    static func read(_ box: CellBox, in gray: GrayImage) -> [Int: Float] {
        let insetX = Int(Double(box.width) * 0.08), insetY = Int(Double(box.height) * 0.1)
        let x0 = max(0, box.x0 + insetX), x1 = min(gray.width - 1, box.x1 - insetX)
        let y0 = max(0, box.y0 + insetY), y1 = min(gray.height - 1, box.y1 - insetY)
        guard x1 > x0 + 2, y1 > y0 + 2 else { return [:] }

        // Up to a height Vision reads comfortably, on a white margin.
        let cellW = x1 - x0 + 1, cellH = y1 - y0 + 1
        let scale = max(1, 64 / cellH)
        let margin = cellH * scale / 2
        let outW = cellW * scale + margin * 2, outH = cellH * scale + margin * 2
        var pixels = [UInt8](repeating: 255, count: outW * outH)
        for y in 0..<(cellH * scale) {
            for x in 0..<(cellW * scale) {
                pixels[(y + margin) * outW + x + margin] = gray.data[(y0 + y / scale) * gray.width + x0 + x / scale]
            }
        }
        guard let image = SheetImage.cgImage(GrayImage(width: outW, height: outH, data: pixels)) else { return [:] }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.1
        let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
        guard (try? handler.perform([request])) != nil else { return [:] }

        var found: [Int: Float] = [:]
        for observation in request.results ?? [] {
            for candidate in observation.topCandidates(5) {
                guard let value = number(in: candidate.string) else { continue }
                found[value] = max(found[value] ?? 0, candidate.confidence)
            }
        }
        return found
    }
}
