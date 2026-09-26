import XCTest
@testable import Snatzee

final class InviteTests: XCTestCase {
    func testBareCodes() {
        XCTAssertEqual(Invite.parse("a1b2c3d4"), "A1B2C3D4")
        XCTAssertEqual(Invite.parse("  A1B2-C3D4 "), "A1B2C3D4")
        XCTAssertNil(Invite.parse(""))
        XCTAssertNil(Invite.parse("ab"))
    }

    func testInviteLinks() {
        XCTAssertEqual(Invite.parse("https://www.snatzee.nl/app/groups?code=a1b2c3d4"), "A1B2C3D4")
        XCTAssertNil(Invite.parse("https://example.com/somewhere"))
    }

    func testLinkRoundTrip() throws {
        let url = try XCTUnwrap(Invite.url(code: "A1B2C3D4"))
        XCTAssertEqual(Invite.parse(url.absoluteString), "A1B2C3D4")
    }
}
