import SwiftUI

/// `<ScoreEntryCard>`: one game — trophy or die, the score, when, and any
/// Yahtzees or note.
struct ScoreEntryCard: View {
    let entry: ScoreEntry

    var body: some View {
        HStack(spacing: 16) {
            Text(entry.isWin ? "🏆" : "🎲")
                .font(.system(size: 20))
                .frame(width: 48, height: 48)
                .background(
                    entry.isWin ? Theme.mint500.opacity(0.15) : Theme.canvas,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text("\(entry.score)")
                    .font(.jakarta(TextSize.xl, .extrabold))
                    .trackingTight(TextSize.xl)
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 6) {
                    Text(Formatting.time(entry.playedAt))
                    if entry.yahtzeeCount > 0 {
                        Text("·")
                        Text("\(entry.yahtzeeCount)× Yahtzee")
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.mint400)
                    }
                    if let note = entry.note, !note.isEmpty {
                        Text("·")
                        Text(note).lineLimit(1)
                    }
                }
                .font(.jakarta(TextSize.xs, .medium))
                .foregroundStyle(Theme.inkMuted)
            }

            Spacer(minLength: 0)

            if entry.isWin {
                HStack(spacing: 4) {
                    LucideIcon("trophy", size: 12)
                    Text("Gewonnen")
                }
                .font(.jakarta(11.2, .bold))
                .foregroundStyle(Theme.mint300)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Theme.mint500.opacity(0.15), in: Capsule())
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(.surface)
        .accessibilityElement(children: .combine)
    }
}
