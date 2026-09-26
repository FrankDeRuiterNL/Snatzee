import Foundation
import Observation
import Supabase

/// Everything the Home screen shows, loaded together — the web page's
/// Promise.all, in one refreshable model.
@MainActor
@Observable
final class HomeModel {
    private(set) var summary: HomeSummary?
    private(set) var recent: [ScoreEntry] = []
    private(set) var stats: UserStatistics?
    private(set) var achievements: [Achievement] = []
    private(set) var loadError: String?
    private(set) var hasLoaded = false

    var unlockedCount: Int { achievements.filter(\.isUnlocked).count }

    func load(userId: UUID) async {
        let id = userId.uuidString
        do {
            async let summary = API.rpc("get_home_summary", as: HomeSummary.self)
            async let recent = API.rows(ScoreEntry.self) {
                $0.from("score_entries").select()
                    .eq("user_id", value: id)
                    .order("played_at", ascending: false)
                    .order("created_at", ascending: false)
                    .limit(4)
            }
            async let stats = API.rows(UserStatistics.self) {
                $0.from("user_statistics").select().eq("user_id", value: id).limit(1)
            }
            async let achievements = AchievementStore.load(userId: userId)

            self.summary = try await summary
            self.recent = try await recent
            self.stats = try await stats.first
            self.achievements = try await achievements
            loadError = nil
        } catch {
            loadError = API.translate(error).localizedDescription
        }
        hasLoaded = true
    }
}

/// The one-line nudge on Home — `buildInsight()` from insight-card.tsx.
enum HomeInsight {
    struct Insight {
        let text: String
    }

    static func build(summary: HomeSummary, achievements: [Achievement]) -> Insight? {
        guard summary.gamesPlayed > 0 else { return nil }

        if summary.currentWinStreak >= 3 {
            return Insight(text: "Je won \(summary.currentWinStreak) potjes achter elkaar — lekker bezig! 🔥")
        }

        if let thisMonth = summary.averageThisMonth, let lastMonth = summary.averageLastMonth {
            let delta = ((thisMonth - lastMonth) * 10).rounded() / 10
            if delta >= 5 {
                return Insight(text: "Je gemiddelde is deze maand \(Formatting.number(delta, decimals: delta.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)) punten hoger dan vorige maand.")
            }
            if delta <= -5 {
                return Insight(text: "Je gemiddelde ligt deze maand \(Formatting.number(abs(delta), decimals: delta.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)) punten lager. Tijd voor revanche.")
            }
        }

        if let next = nextGamesAchievement(achievements, gamesPlayed: summary.gamesPlayed), next.remaining <= 5 {
            return Insight(text: "Nog \(next.remaining) \(Formatting.pluralize(next.remaining, "potje", "potjes")) tot \"\(next.name)\".")
        }

        if summary.gamesToday > 0 {
            return Insight(text: "\(summary.gamesToday) \(Formatting.pluralize(summary.gamesToday, "potje", "potjes")) vandaag geregistreerd. 🎲")
        }

        return nil
    }

    static func nextGamesAchievement(_ achievements: [Achievement], gamesPlayed: Int) -> (name: String, remaining: Int)? {
        achievements
            .filter { !$0.isUnlocked && !$0.isSecret && $0.criteria.type == "games_played" }
            .compactMap { achievement -> (name: String, remaining: Int)? in
                guard let gte = achievement.criteria.gte else { return nil }
                let remaining = Int(gte.rounded(.up)) - gamesPlayed
                return remaining > 0 ? (achievement.name, remaining) : nil
            }
            .min { $0.remaining < $1.remaining }
    }
}
