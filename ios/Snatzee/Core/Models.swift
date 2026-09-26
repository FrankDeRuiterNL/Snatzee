import Foundation

// Rows and RPC results, mirroring src/types/database.ts. Decoded with
// API.decoder (snake_case keys → camelCase properties).

struct Profile: Decodable, Identifiable, Equatable {
    let id: UUID
    let username: String
    let displayName: String
    let avatarUrl: String?
    let bio: String?
    let onboardingCompleted: Bool
    let isPrivate: Bool
    let role: String

    var avatarURL: URL? { avatarUrl.flatMap(URL.init(string:)) }
}

struct ScoreEntry: Decodable, Identifiable, Equatable {
    let id: UUID
    let userId: UUID
    let score: Int
    let isWin: Bool
    let yahtzeeCount: Int
    let playedAt: Date
    let note: String?
    let sheet: [Int]?
    let createdAt: Date
}

struct HomeSummary: Decodable, Equatable {
    let gamesPlayed: Int
    let wins: Int
    let winRate: Double
    let averageScore: Double?
    let highestScore: Int?
    let lowestScore: Int?
    let yahtzeeCount: Int
    let firstRollYahtzeeCount: Int
    let achievementCount: Int
    let averageThisMonth: Double?
    let averageLastMonth: Double?
    let averageLast10: Double?
    let pendingFriendRequests: Int
    let gamesToday: Int
    let currentWinStreak: Int
}

struct UserStatistics: Decodable, Equatable {
    let userId: UUID
    let gamesPlayed: Int
    let wins: Int
    let averageScore: Double?
    let highestScore: Int?
    let lowestScore: Int?
    let yahtzeeCount: Int
    let firstRollYahtzeeCount: Int
    let winRate: Double?
    let achievementCount: Int
    let levelName: String?
    let levelEmoji: String?
    let levelMinGames: Int?
    let nextLevelName: String?
    let nextLevelEmoji: String?
    let nextLevelMinGames: Int?
    let gamesToNextLevel: Int?
}

struct Achievement: Decodable, Identifiable, Equatable {
    struct Criteria: Decodable, Equatable {
        let type: String?
        let gte: Double?
    }

    let id: UUID
    let key: String
    let name: String
    let description: String
    let icon: String
    let rarity: String
    let category: String
    let isSecret: Bool
    let sortOrder: Int
    let criteria: Criteria
    /// Set when merged with the player's unlocks.
    var unlockedAt: Date?

    var isUnlocked: Bool { unlockedAt != nil }
}

struct UserAchievementRow: Decodable {
    let achievementId: UUID
    let unlockedAt: Date
}

struct ClientConfig: Decodable {
    let apiVersion: Int
    let settings: [String: Double]

    func setting(_ key: String) -> Int? { settings[key].map { Int($0) } }
}

/// What record_score_entry / update_score_entry return.
struct RecordScoreResult: Decodable {
    let entry: ScoreEntry
    /// Achievements this save unlocked, newest first.
    let unlocked: [Achievement]?
    /// Only on a new game: beat the player's previous best.
    let isPersonalRecord: Bool?
}

/// What record_yahtzee returns.
struct RecordYahtzeeResult: Decodable {
    let firstRollYahtzeeCount: Int
    let unlocked: [Achievement]?
}
