import XCTest
@testable import Snatzee

final class DeepLinkTests: XCTestCase {
    func testPublicProfilesOpenOnTheCurrentTab() {
        let destination = DeepLinks.destination(path: "/u/Mathijs")
        XCTAssertEqual(destination?.routes, [.publicProfile("mathijs")])
        XCTAssertEqual(destination?.onCurrentTab, true)
    }

    func testNotificationPaths() {
        let id = UUID()
        XCTAssertEqual(DeepLinks.destination(path: "/app/groups/\(id.uuidString.lowercased())")?.routes, [.groups, .group(id)])
        XCTAssertEqual(DeepLinks.destination(path: "/app/rankings")?.tab, .rankings)
        XCTAssertEqual(DeepLinks.destination(path: "/app/friends")?.tab, .friends)
        XCTAssertEqual(DeepLinks.destination(path: "/app")?.tab, .home)
        XCTAssertEqual(DeepLinks.destination(path: "/app/history",
                                             query: [URLQueryItem(name: "filter", value: "won")])?.routes, [.history(.won)])
    }

    func testForeignPathsAreIgnored() {
        XCTAssertNil(DeepLinks.destination(path: "/auth/confirm"))
        XCTAssertNil(DeepLinks.destination(path: "/"))
    }
}
