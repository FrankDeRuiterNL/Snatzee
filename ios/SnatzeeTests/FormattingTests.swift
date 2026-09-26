import XCTest
@testable import Snatzee

final class FormattingTests: XCTestCase {
    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    func testTimesAreDutchTime() {
        // 22:30 UTC in September is 00:30 in Amsterdam (UTC+2) …
        XCTAssertEqual(Formatting.time(date("2026-09-25T22:30:00Z")), "00:30")
        // … and 23:30 UTC in January too (UTC+1).
        XCTAssertEqual(Formatting.time(date("2026-01-15T23:30:00Z")), "00:30")
    }

    func testTodayAndYesterdayFollowTheDutchCalendar() {
        let now = date("2026-09-26T10:00:00Z")
        // 22:30 UTC on the 25th is already the 26th in Amsterdam.
        XCTAssertEqual(Formatting.playedAt(date("2026-09-25T22:30:00Z"), now: now), "Vandaag")
        XCTAssertEqual(Formatting.playedAt(date("2026-09-25T12:00:00Z"), now: now), "Gisteren")
        XCTAssertEqual(Formatting.playedAt(date("2026-09-01T12:00:00Z"), now: now), "1 september")
        XCTAssertEqual(Formatting.playedAt(date("2025-03-01T12:00:00Z"), now: now), "1 maart 2025")
    }

    func testNumbersUseDutchSeparators() {
        XCTAssertEqual(Formatting.number(214.66, decimals: 1), "214,7")
        XCTAssertEqual(Formatting.number(1234), "1.234")
        XCTAssertEqual(Formatting.number(nil as Int?), "—")
    }

    func testInitials() {
        XCTAssertEqual(Initials.of("Frank de Ruiter"), "FD")
        XCTAssertEqual(Initials.of("frank"), "FR")
        XCTAssertEqual(Initials.of(nil), "?")
    }
}
