import XCTest
@testable import Snatzee

/// Mirrors buildInsight() in src/components/home/insight-card.tsx.
final class InsightTests: XCTestCase {
    private func summary(
        games: Int = 10, streak: Int = 0, thisMonth: Double? = nil, lastMonth: Double? = nil, today: Int = 0
    ) -> HomeSummary {
        HomeSummary(
            gamesPlayed: games, wins: 0, winRate: 0, averageScore: nil, highestScore: nil, lowestScore: nil,
            yahtzeeCount: 0, firstRollYahtzeeCount: 0, achievementCount: 0,
            averageThisMonth: thisMonth, averageLastMonth: lastMonth,
            pendingFriendRequests: 0, gamesToday: today, currentWinStreak: streak
        )
    }

    func testWinStreakComesFirst() {
        let insight = HomeInsight.build(summary: summary(streak: 4, thisMonth: 250, lastMonth: 200), achievements: [])
        XCTAssertEqual(insight?.text, "Je won 4 potjes achter elkaar — lekker bezig! 🔥")
    }

    func testMonthOnMonthChange() {
        XCTAssertEqual(
            HomeInsight.build(summary: summary(thisMonth: 230.5, lastMonth: 220), achievements: [])?.text,
            "Je gemiddelde is deze maand 10,5 punten hoger dan vorige maand."
        )
        XCTAssertEqual(
            HomeInsight.build(summary: summary(thisMonth: 200, lastMonth: 212), achievements: [])?.text,
            "Je gemiddelde ligt deze maand 12 punten lager. Tijd voor revanche."
        )
    }

    func testGamesToday() {
        XCTAssertEqual(
            HomeInsight.build(summary: summary(today: 1), achievements: [])?.text,
            "1 potje vandaag geregistreerd. 🎲"
        )
    }
}
