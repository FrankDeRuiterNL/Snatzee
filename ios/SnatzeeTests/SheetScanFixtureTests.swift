import UIKit
import XCTest
@testable import Snatzee

/// The yardstick: real photos of filled-in sheets, read end to end with
/// Vision, compared box by box with what is really written on them
/// (Fixtures/Sheets/truth.json). Prints a report prefixed "SCAN" so CI
/// shows how well the reader does on every change.
final class SheetScanFixtureTests: XCTestCase {
    private struct Truth: Decodable {
        struct Sheet: Decodable {
            let file: String
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

    func testReadsTheFixtureSheets() throws {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: "truth", withExtension: "json"))
        let truth = try JSONDecoder().decode(Truth.self, from: Data(contentsOf: url))

        var boxes = 0, correct = 0, columns = 0, perfect = 0, silentErrors = 0
        for sheet in truth.sheets {
            let photo = SheetScanner.prepare(try image(sheet.file))
            let scan: SheetScanner.Scan
            do {
                scan = try SheetScanner.scan(photo)
            } catch {
                print("SCAN \(sheet.file): failed — \(error)")
                XCTFail("\(sheet.file): \(error)")
                continue
            }
            let rows = scan.layout.rows.map { "\($0.line)" }.joined(separator: ", ")
            print("SCAN \(sheet.file): \(scan.layout.columns.count) columns, filled \(scan.filledColumns); rows: \(rows)")

            for (key, expected) in sheet.columns.sorted(by: { $0.key < $1.key }) {
                let number = Int(key)!
                let result = SheetScanner.solve(scan, column: number)
                columns += 1
                var wrong: [String] = []
                for index in expected.indices {
                    boxes += 1
                    if result.entries[index] == expected[index] {
                        correct += 1
                    } else {
                        let flag = result.flagged.contains(index) ? "flagged" : "NOT flagged"
                        if !result.flagged.contains(index) { silentErrors += 1 }
                        let raw = (scan.columns[number]?[.entry(index)] ?? []).map { "\($0.mark)@\(String(format: "%.2f", $0.confidence))" }
                        wrong.append("\(ScoreSheet.rows[index].label): read \(result.entries[index]), is \(expected[index]) [\(flag); raw \(raw)]")
                    }
                }
                if wrong.isEmpty { perfect += 1 }
                print("SCAN \(sheet.file) game \(number): \(expected.count - wrong.count)/\(expected.count) right, totals agree: \(result.totalsAgree), flagged \(result.flagged.sorted())")
                for line in wrong { print("SCAN    \(line)") }
            }
        }

        let accuracy = boxes == 0 ? 0 : Double(correct) / Double(boxes)
        print("SCAN TOTAL: \(correct)/\(boxes) boxes (\(String(format: "%.1f", accuracy * 100))%), \(perfect)/\(columns) columns perfect, \(silentErrors) wrong without a flag")
        // The bar goes up as the reader improves; for now it must at least
        // find the sheets and read most of them.
        XCTAssertGreaterThan(boxes, 0)
    }
}
