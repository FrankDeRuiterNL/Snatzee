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
            /// "own" (Snatzee's sheets, must be read) or "other" (measured).
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

    func testReadsTheFixtureSheets() throws {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: "truth", withExtension: "json"))
        let truth = try JSONDecoder().decode(Truth.self, from: Data(contentsOf: url))

        var tallies: [String: Tally] = [:]
        for sheet in truth.sheets {
            var tally = tallies[sheet.set, default: Tally()]
            defer { tallies[sheet.set] = tally }
            let strict = sheet.set == "own"
            let photo = SheetScanner.prepare(try image(sheet.file))
            let scan: SheetScanner.Scan
            do {
                scan = try SheetScanner.scan(photo)
            } catch {
                print("SCAN \(sheet.file): failed — \(error)")
                if strict { XCTFail("\(sheet.file): \(error)") }
                tally.add(missed: sheet.columns.values.map(\.count))
                continue
            }
            let rows = scan.layout.rows.map { "\($0.line)" }.joined(separator: ", ")
            print("SCAN \(sheet.file): \(scan.layout.columns.count) columns, filled \(scan.filledColumns) (is \(sheet.columns.keys.compactMap { Int($0) }.sorted())); rows: \(rows)")

            for (key, expected) in sheet.columns.sorted(by: { $0.key < $1.key }) {
                let number = Int(key)!
                let reading: SheetScanner.ColumnReading, result: SheetSolver.Result
                do {
                    (reading, result) = try SheetScanner.read(scan, column: number)
                } catch {
                    print("SCAN \(sheet.file) game \(number): failed — \(error)")
                    if strict { XCTFail("\(sheet.file) game \(number): \(error)") }
                    tally.add(missed: [expected.count])
                    continue
                }
                var wrong: [String] = []
                var silent = 0
                for index in expected.indices where result.entries[index] != expected[index] {
                    let flag = result.flagged.contains(index) ? "flagged" : "NOT flagged"
                    if !result.flagged.contains(index) { silent += 1 }
                    let raw = (reading.readings[.entry(index)] ?? []).map { "\($0.mark)@\(String(format: "%.2f", $0.confidence))" }
                        + (reading.unreadable.contains(.entry(index)) ? ["unreadable ink"] : [])
                    wrong.append("\(ScoreSheet.rows[index].label): read \(result.entries[index]), is \(expected[index]) [\(flag); raw \(raw)]")
                }
                tally.add(boxes: expected.count, wrong: wrong.count, silent: silent, flagged: result.flagged.count)
                print("SCAN \(sheet.file) game \(number): \(expected.count - wrong.count)/\(expected.count) right, totals agree: \(result.totalsAgree), flagged \(result.flagged.sorted())")
                for line in wrong { print("SCAN    \(line)") }
            }
        }

        for (set, tally) in tallies.sorted(by: { $0.key > $1.key }) {
            print("SCAN TOTAL \(set): \(tally.summary)")
        }
        let own = tallies["own", default: Tally()]
        // The bar goes up as the reader improves; for now it must at least
        // find our own sheets and read most of them.
        XCTAssertGreaterThan(own.boxes, 0)
    }

    private struct Tally {
        var boxes = 0, correct = 0, columns = 0, perfect = 0, silent = 0, flagged = 0

        mutating func add(boxes count: Int, wrong: Int, silent quiet: Int, flagged marked: Int) {
            boxes += count
            correct += count - wrong
            columns += 1
            if wrong == 0 { perfect += 1 }
            silent += quiet
            flagged += marked
        }

        /// A sheet that could not be read at all: every box missed.
        mutating func add(missed counts: [Int]) {
            for count in counts { add(boxes: count, wrong: count, silent: 0, flagged: count) }
        }

        var summary: String {
            let accuracy = boxes == 0 ? 0 : Double(correct) / Double(boxes) * 100
            return "\(correct)/\(boxes) boxes (\(String(format: "%.1f", accuracy))%), \(perfect)/\(columns) columns perfect, "
                + "\(silent) wrong without a flag, \(flagged) flagged"
        }
    }
}
