import XCTest
@testable import Snatzee

/// The JSON the server really sends: PostgREST rows with snake_case keys
/// and Postgres timestamps with microseconds and a numeric offset.
final class DecodingTests: XCTestCase {
    func testPostgresTimestampsParse() {
        let micro = PostgresDate.parse("2026-09-26T03:06:11.123456+00:00")
        let milli = PostgresDate.parse("2026-09-26T03:06:11.123+00:00")
        let none = PostgresDate.parse("2026-09-26T03:06:11+02:00")
        XCTAssertNotNil(micro)
        XCTAssertEqual(micro!.timeIntervalSince1970, milli!.timeIntervalSince1970, accuracy: 0.001)
        XCTAssertEqual(none!.timeIntervalSince1970, 1_790_384_771, accuracy: 0.001)
        XCTAssertNil(PostgresDate.parse("gisteren"))
    }

    func testScoreEntryRowDecodes() throws {
        let json = """
        [{"id":"0f8fad5b-d9cb-469f-a165-70867728950e","user_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7",
          "score":545,"is_win":true,"yahtzee_count":3,"played_at":"2026-09-25T22:30:00.52341+00:00",
          "note":null,"sheet":[5,10,15,20,25,30,20,20,25,30,40,50,20],
          "created_at":"2026-09-25T22:31:00+00:00","updated_at":"2026-09-25T22:31:00+00:00"}]
        """
        let rows = try API.decoder.decode([ScoreEntry].self, from: Data(json.utf8))
        XCTAssertEqual(rows.first?.score, 545)
        XCTAssertEqual(rows.first?.yahtzeeCount, 3)
        XCTAssertEqual(rows.first.map { Formatting.time($0.playedAt) }, "00:30")
        XCTAssertTrue(ScoreSheet.isValid(rows.first?.sheet))
    }

    func testHomeSummaryDecodesWithNulls() throws {
        let json = """
        {"games_played":0,"wins":0,"win_rate":0,"average_score":null,"highest_score":null,
         "lowest_score":null,"yahtzee_count":0,"first_roll_yahtzee_count":0,"achievement_count":0,
         "average_this_month":null,"average_last_month":null,"average_last_10":null,
         "pending_friend_requests":2,"games_today":0,"current_win_streak":0}
        """
        let summary = try API.decoder.decode(HomeSummary.self, from: Data(json.utf8))
        XCTAssertNil(summary.averageScore)
        XCTAssertEqual(summary.pendingFriendRequests, 2)
        XCTAssertNil(HomeInsight.build(summary: summary, achievements: []), "no insight before the first game")
    }

    func testClientConfigReadsMinimumBuild() throws {
        let json = """
        {"api_version":1,"server_time":"2026-09-26T03:00:00+00:00",
         "settings":{"min_ios_build":3,"max_score":1575,"launch_splash":1}}
        """
        let config = try API.decoder.decode(ClientConfig.self, from: Data(json.utf8))
        XCTAssertEqual(config.setting("min_ios_build"), 3)
    }
}
