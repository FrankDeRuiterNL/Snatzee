import UIKit
import XCTest
@testable import Snatzee

/// The yardstick: real photos of filled-in sheets (Fixtures/Sheets), with
/// what is really written on them (truth.json). Prints a report prefixed
/// "SCAN" so CI shows how well the scanner does on every change.
///
/// Step 1 — the grid: is it found, cropped to, and does every box sit
/// where the game says it is? Checked by ink: a box the player filled in
/// should hold ink, a box in a game nobody played should not.
final class SheetScanFixtureTests: XCTestCase {
    private struct Truth: Decodable {
        struct Sheet: Decodable {
            let file: String
            /// "own" (Snatzee's sheets, must work) or "other" (measured).
            let set: String
            let columns: [String: [Int]]
        }
        let sheets: [Sheet]
    }

    private func image(_ name: String) throws -> CGImage {
        let bundle = Bundle(for: Self.self)
        let parts = name.split(separator: ".")
        let url = try XCTUnwrap(bundle.url(forResource: String(parts[0]), withExtension: String(parts[1])), "missing fixture \(name)")
        let ui = try XCTUnwrap(UIImage(contentsOfFile: url.path))
        return try XCTUnwrap(ui.cgImage)
    }

    /// Fraction of ink in a box, a little inside its edges.
    private func ink(_ box: CellBox, in mask: BinaryImage) -> Double {
        let inset = 0.12
        let x0 = max(0, box.x0 + Int(Double(box.width) * inset)), x1 = min(mask.width - 1, box.x1 - Int(Double(box.width) * inset))
        let y0 = max(0, box.y0 + Int(Double(box.height) * inset)), y1 = min(mask.height - 1, box.y1 - Int(Double(box.height) * inset))
        guard x1 > x0, y1 > y0 else { return 0 }
        var count = 0
        for y in y0...y1 { for x in x0...x1 where mask[x, y] { count += 1 } }
        return Double(count) / Double((x1 - x0 + 1) * (y1 - y0 + 1))
    }

    func testFindsTheGrid() throws {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: "truth", withExtension: "json"))
        let truth = try JSONDecoder().decode(Truth.self, from: Data(contentsOf: url))

        var tallies: [String: (sheets: Int, found: Int, filled: Int, filledInk: Int, unplayed: Int, unplayedInk: Int)] = [:]
        for sheet in truth.sheets {
            var tally = tallies[sheet.set] ?? (0, 0, 0, 0, 0, 0)
            defer { tallies[sheet.set] = tally }
            tally.sheets += 1

            let started = Date()
            let photo = SheetScanner.straighten(try image(sheet.file))
            guard let located = SheetScanner.locate(photo) else {
                print("SCAN \(sheet.file): no grid found")
                if sheet.set == "own" { XCTFail("\(sheet.file): no grid") }
                continue
            }
            tally.found += 1
            let grid = located.grid
            let mask = located.prepared.mask
            let crop = located.crop.map { "cropped to \(Int($0.width))x\(Int($0.height)) at \(Int($0.minX)),\(Int($0.minY)) of \(photo.width)x\(photo.height)" } ?? "whole photo"
            print("SCAN \(sheet.file): \(grid.columns) columns, rows found \(grid.rowsFound) → \(grid.blocks.map(\.count)), \(crop), skew \(String(format: "%.1f", located.prepared.skew))°, \(String(format: "%.1f", Date().timeIntervalSince(started)))s")

            // Every box where the game says it is: ink where the player
            // wrote, none in games nobody played.
            let played = Set(sheet.columns.keys.compactMap { Int($0) })
            var misses: [String] = []
            for (b, block) in grid.blocks.enumerated() {
                for (r, row) in block.enumerated() {
                    guard case .entry(let index)? = SheetLine.at(block: b, row: r, rowsInBlock: block.count) else { continue }
                    for (c, box) in row.enumerated() {
                        let amount = ink(box, in: mask)
                        let hasInk = amount > 0.006
                        if let values = sheet.columns[String(c + 1)] {
                            guard values[index] > 0 else { continue }
                            tally.filled += 1
                            if hasInk { tally.filledInk += 1 } else { misses.append("game \(c + 1) \(ScoreSheet.rows[index].label) empty (is \(values[index]))") }
                        } else if !played.contains(c + 1) {
                            tally.unplayed += 1
                            if hasInk { tally.unplayedInk += 1; misses.append("game \(c + 1) \(ScoreSheet.rows[index].label) ink \(String(format: "%.3f", amount)) (unplayed)") }
                        }
                    }
                }
            }
            for miss in misses.prefix(12) { print("SCAN    \(miss)") }
        }

        for (set, t) in tallies.sorted(by: { $0.key > $1.key }) {
            print("SCAN TOTAL \(set): grid on \(t.found)/\(t.sheets) sheets; ink in \(t.filledInk)/\(t.filled) filled boxes; ink in \(t.unplayedInk)/\(t.unplayed) boxes of unplayed games")
        }
        let own = tallies["own"]
        XCTAssertEqual(own?.found, own?.sheets, "the grid must be found on every Snatzee sheet")
    }

    func testRowsByPlace() {
        XCTAssertEqual(SheetLine.at(block: 0, row: 0, rowsInBlock: 9), .entry(0))
        XCTAssertEqual(SheetLine.at(block: 0, row: 5, rowsInBlock: 9), .entry(5))
        XCTAssertEqual(SheetLine.at(block: 0, row: 7, rowsInBlock: 9), .bonus)
        XCTAssertEqual(SheetLine.at(block: 1, row: 0, rowsInBlock: 10), .entry(6))
        XCTAssertEqual(SheetLine.at(block: 1, row: 6, rowsInBlock: 10), .entry(12))
        XCTAssertEqual(SheetLine.at(block: 1, row: 9, rowsInBlock: 10), .grandTotal)
        // A sheet with Yahtzee bonus rows: the totals are still the last three.
        XCTAssertNil(SheetLine.at(block: 1, row: 7, rowsInBlock: 12))
        XCTAssertEqual(SheetLine.at(block: 1, row: 9, rowsInBlock: 12), .lowerTotal)
        XCTAssertEqual(SheetLine.at(block: 1, row: 11, rowsInBlock: 12), .grandTotal)
    }
}
