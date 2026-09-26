import SwiftUI

/// `<LevelCard>`: the player's level and how far the next one is.
struct LevelCard: View {
    let stats: UserStatistics

    var body: some View {
        if let name = stats.levelName {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 16) {
                    Text(stats.levelEmoji ?? "🎲")
                        .font(.system(size: 30))
                        .frame(width: 56, height: 56)
                        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("JOUW NIVEAU")
                            .font(.jakarta(TextSize.xs, .bold))
                            .tracking(0.6)
                            .foregroundStyle(Theme.inkMuted)
                        Text(name)
                            .font(.jakarta(TextSize.lg, .extrabold))
                            .trackingTight(TextSize.lg)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                    }
                }

                if let next = stats.nextLevelMinGames, let remaining = stats.gamesToNextLevel {
                    let from = stats.levelMinGames ?? 0
                    let span = max(1, next - from)
                    ProgressBar(value: Double(stats.gamesPlayed - from) / Double(span))
                        .padding(.top, 16)
                    (Text("Nog ")
                        + Text("\(remaining) \(Formatting.pluralize(remaining, "potje", "potjes"))").bold().foregroundColor(Theme.ink)
                        + Text(" tot \(stats.nextLevelEmoji ?? "") \(stats.nextLevelName ?? "")"))
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                        .padding(.top, 10)
                } else {
                    Text("Hoogste niveau bereikt — petje af. 🎉")
                        .font(.jakarta(TextSize.sm, .medium))
                        .foregroundStyle(Theme.mint300)
                        .padding(.top, 16)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(.surface, radius: Theme.Radius.xl2)
        }
    }
}
