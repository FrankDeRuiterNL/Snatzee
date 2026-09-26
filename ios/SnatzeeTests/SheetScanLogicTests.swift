import XCTest
@testable import Snatzee

final class SheetScanLogicTests: XCTestCase {
    func testRowNamesFromDifferentSheets() {
        let cases: [(String, SheetLine)] = [
            ("ENEN TEL ALLE ENEN", .entry(0)),
            ("Aces Count and add only Aces", .entry(0)),
            ("TWEEËN", .entry(1)),
            ("Threes", .entry(2)),
            ("VIJVEN TEL ALLE VIJVEN", .entry(4)),
            ("THREE OF A KIND 3 DEZELFDE TOTAAL V.D. 5 STENEN", .entry(6)),
            ("CARRÉ 4 DEZELFDE", .entry(7)),
            ("4 of a Kind Add total of all dice", .entry(7)),
            ("FULL HOUSE 3 + 2 DEZELFDE 25 PUNTEN", .entry(8)),
            ("SM Straight Sequence of 4", .entry(9)),
            ("GROOTE STRAAT", .entry(10)),
            ("TOPSCORE 5 DEZELFDE 50 PUNTEN", .entry(11)),
            ("YAHTZEE 5 of a kind SCORE 50", .entry(11)),
            ("SUPER SCORE", .entry(11)),
            ("CHANCE VRIJE KEUS", .entry(12)),
            ("YAHTZEE BONUS X FOR EACH BONUS", .yahtzeeBonus),
            ("EXTRA BONUS ALS PUNTENTOTAAL 63 OF MEER IS 35 PUNTEN", .bonus),
            ("TOTAAL AANTAL PUNTEN", .upperSubtotal),
            ("TOTAL SCORE", .upperSubtotal),
            ("TOTAAL VAN DE BOVENSTE HELFT", .upperTotal),
            ("TOTAL Of Lower Section", .lowerTotal),
            ("TOTAAL GENERAAL", .grandTotal),
            ("GRAND TOTAL", .grandTotal),
        ]
        for (text, expected) in cases {
            XCTAssertEqual(SheetVocabulary.line(for: text), expected, text)
        }
        XCTAssertNil(SheetVocabulary.line(for: "DEEL 1"))
        XCTAssertTrue(SheetVocabulary.isBareTotal("TOTAAL"))
    }

    func testColumnHeadings() {
        XCTAssertEqual(SheetVocabulary.gameNumber(for: "1e SPEL"), 1)
        XCTAssertEqual(SheetVocabulary.gameNumber(for: "3e"), 3)
        XCTAssertEqual(SheetVocabulary.gameNumber(for: "GAME #4"), 4)
        XCTAssertEqual(SheetVocabulary.gameNumber(for: "spel 2"), 2)
        XCTAssertNil(SheetVocabulary.gameNumber(for: "20"), "a score is not a heading")
        XCTAssertNil(SheetVocabulary.gameNumber(for: "SPELER 1"))
    }

    func testCellMarks() {
        XCTAssertEqual(CellParser.parse("12."), .number(12))
        XCTAssertEqual(CellParser.parse("2O"), .number(20))
        XCTAssertEqual(CellParser.parse("/"), .stroke)
        XCTAssertEqual(CellParser.parse("—"), .stroke)
        XCTAssertEqual(CellParser.parse("l6"), .number(16))
        XCTAssertNil(CellParser.parse("SPEL"))
        XCTAssertNil(CellParser.parse(""))
    }

    private func read(_ value: Int, _ confidence: Float = 0.9) -> [CellReading] {
        [CellReading(mark: .number(value), confidence: confidence)]
    }

    func testTotalsSettleAnUnsureBox() {
        // Photo 1: everything clear except "Vieren", read as 76 or 16.
        var readings: [SheetLine: [CellReading]] = [
            .entry(0): read(4), .entry(1): read(6), .entry(2): read(9),
            .entry(3): [CellReading(mark: .number(76), confidence: 0.5), CellReading(mark: .number(16), confidence: 0.3)],
            .entry(4): read(20), .entry(5): read(18),
            .entry(6): read(20), .entry(7): [CellReading(mark: .stroke, confidence: 0.6)],
            .entry(8): read(25), .entry(9): read(30), .entry(10): read(40),
            .entry(11): [CellReading(mark: .stroke, confidence: 0.6)], .entry(12): read(20),
        ]
        readings[.upperSubtotal] = read(73)
        readings[.bonus] = read(35)
        readings[.upperTotal] = read(108)
        readings[.lowerTotal] = read(135)
        readings[.grandTotal] = read(243)

        let result = SheetSolver.solve(readings)
        XCTAssertEqual(result.entries, [4, 6, 9, 16, 20, 18, 20, 0, 25, 30, 40, 0, 20])
        XCTAssertTrue(result.totalsAgree)
        XCTAssertTrue(result.flagged.contains(3), "the box the totals had to decide is flagged")
    }

    func testEmptyBoxesAreZero() {
        let result = SheetSolver.solve([.entry(0): read(3)])
        XCTAssertEqual(result.entries[0], 3)
        XCTAssertEqual(result.entries.dropFirst().reduce(0, +), 0)
    }

    func testGrandTotalWithYahtzeeBonus() {
        var readings: [SheetLine: [CellReading]] = [:]
        let values = [3, 6, 9, 12, 15, 18, 20, 20, 25, 30, 40, 50, 20]
        for (index, value) in values.enumerated() { readings[.entry(index)] = read(value) }
        // 63 + 35 + 205 = 303, plus one extra Yahtzee.
        readings[.grandTotal] = read(403)
        let result = SheetSolver.solve(readings)
        XCTAssertEqual(result.entries, values)
        XCTAssertEqual(result.extraYahtzees, 1)
    }
}
