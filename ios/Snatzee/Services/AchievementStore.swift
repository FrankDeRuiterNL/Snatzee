import Foundation
import Supabase

/// The achievement catalogue with a player's unlocks laid over it — the
/// website's getAchievementsForUser().
enum AchievementStore {
    static func load(userId: UUID) async throws -> [Achievement] {
        let id = userId.uuidString
        async let catalogue = API.rows(Achievement.self) {
            $0.from("achievements").select().order("sort_order")
        }
        async let unlocks = API.rows(UserAchievementRow.self) {
            $0.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", value: id)
        }
        let unlockedAt = Dictionary(
            try await unlocks.map { ($0.achievementId, $0.unlockedAt) },
            uniquingKeysWith: { first, _ in first }
        )
        return try await catalogue.map { achievement in
            var merged = achievement
            merged.unlockedAt = unlockedAt[achievement.id]
            return merged
        }
    }
}
