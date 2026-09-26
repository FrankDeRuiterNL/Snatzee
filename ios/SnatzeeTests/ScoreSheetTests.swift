import XCTest
@testable import Snatzee

/// Mirrors tests/unit/sheet.test.ts, so both platforms agree with the database.
final class ScoreSheetTests: XCTestCase {
    private let full = [5, 10, 15, 20, 25, 30, 20, 20, 25, 30, 40, 50, 20]

    func testEmptySheetIsValidAndZero() {
        XCTAssertTrue(ScoreSheet.isValid(ScoreSheet.empty()))
        XCTAssertEqual(ScoreSheet.totals(ScoreSheet.empty()).total, 0)
    }

    func testUpperBonusStartsAt63() {
        let at62 = [2, 4, 6, 16, 10, 24, 0, 0, 0, 0, 0, 0, 0]
        let at63 = [3, 4, 6, 16, 10, 24, 0, 0, 0, 0, 0, 0, 0]
        XCTAssertEqual(ScoreSheet.totals(at62).bonus, 0)
        XCTAssertEqual(ScoreSheet.totals(at63).bonus, 35)
        XCTAssertEqual(ScoreSheet.totals(at63).total, 98)
    }

    func testFullSheet() {
        let totals = ScoreSheet.totals(full)
        XCTAssertEqual(totals.subtotal, 105)
        XCTAssertEqual(totals.bonus, 35)
        XCTAssertEqual(totals.lower, 205)
        XCTAssertEqual(totals.total, 345)
    }

    func testEveryYahtzeeAfterTheFirstIsWorth100() {
        XCTAssertEqual(ScoreSheet.totals(full, yahtzees: 1).total, 345)
        XCTAssertEqual(ScoreSheet.totals(full, yahtzees: 3).total, 545)
    }

    func testNoBonusWhenTheYahtzeeBoxWasScratched() {
        var scratched = full
        scratched[ScoreSheet.topscoreRow] = 0
        XCTAssertEqual(ScoreSheet.yahtzeeBonus(scratched, yahtzees: 4), 0)
    }

    func testRejectsValuesARowCannotHold() {
        XCTAssertFalse(ScoreSheet.isValid(Array(full.prefix(12)) + [3]), "chance below 5")
        var oddTwos = full
        oddTwos[1] = 3
        XCTAssertFalse(ScoreSheet.isValid(oddTwos))
        XCTAssertFalse(ScoreSheet.isValid(Array(full.prefix(12))))
        XCTAssertFalse(ScoreSheet.isValid(nil))
    }

    func testYesOrNoRows() {
        // Full house, both straights and the Topscore become checkboxes.
        XCTAssertEqual(ScoreSheet.rows.map(\.fixedPoints),
                       [nil, nil, nil, nil, nil, nil, nil, nil, 25, 30, 40, 50, nil])
    }
}
