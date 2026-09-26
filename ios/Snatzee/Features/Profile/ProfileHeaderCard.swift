import SwiftUI

/// `<ProfileHeader>`: used on your own Profile tab and on public profiles.
struct ProfileHeaderCard<Action: View>: View {
    let displayName: String
    let username: String
    let avatarURL: URL?
    var bio: String?
    let stats: UserStatistics?
    var friendCount = 0
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                AvatarView(url: avatarURL, name: displayName, size: .xl, ring: false)
                    .overlay(Circle().strokeBorder(.white.opacity(0.10), lineWidth: 4))
                Text(displayName)
                    .font(.jakarta(TextSize.xxl, .black))
                    .trackingTight(TextSize.xxl)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.top, 16)
                Text("@\(username) · \(Formatting.number(friendCount)) \(Formatting.pluralize(friendCount, "vriend", "vrienden"))")
                    .font(.jakarta(TextSize.sm, .medium))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.top, 2)
                if let level = stats?.levelName {
                    HStack(spacing: 6) {
                        Text(stats?.levelEmoji ?? "🎲")
                        Text(level)
                    }
                    .font(.jakarta(TextSize.xs, .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Theme.surface.opacity(0.10), in: Capsule())
                    .padding(.top, 12)
                }
                if let bio, !bio.isEmpty {
                    Text(bio)
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkSoft)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 300)
                        .padding(.top, 12)
                }
                action()
                    .frame(maxWidth: 256)
                    .padding(.top, 20)
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 8) {
                stat("Potjes", Formatting.number(stats?.gamesPlayed ?? 0))
                stat("Wins", Formatting.number(stats?.wins ?? 0))
                stat("Gem.", stats?.averageScore.map { Formatting.number($0, decimals: $0.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1) } ?? "—")
                stat("Record", stats?.highestScore.map { Formatting.number($0) } ?? "—")
            }
            .padding(.top, 24)

            HStack(spacing: 8) {
                yahtzeeStat("🎲", "Yahtzee's", Formatting.number(stats?.yahtzeeCount ?? 0))
                yahtzeeStat("⚡", "In één worp", Formatting.number(stats?.firstRollYahtzeeCount ?? 0))
            }
            .padding(.top, 12)
        }
        .padding(24)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
        .snatzeeShadow(.lift)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.jakarta(TextSize.lg, .extrabold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.jakarta(10.4, .semibold))
                .foregroundStyle(Theme.inkMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.surface.opacity(0.05), in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
    }

    private func yahtzeeStat(_ emoji: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 12) {
            Text(emoji).font(.system(size: 20))
            VStack(alignment: .leading, spacing: 4) {
                Text(value)
                    .font(.jakarta(TextSize.lg, .extrabold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text(label)
                    .font(.jakarta(10.4, .semibold))
                    .foregroundStyle(Theme.inkMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.surface.opacity(0.05), in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
    }
}

/// `<AchievementPreview>`: the four most recent unlocks.
struct AchievementPreview: View {
    let achievements: [Achievement]
    var showLink = true

    var body: some View {
        let unlocked = achievements
            .filter(\.isUnlocked)
            .sorted { ($0.unlockedAt ?? .distantPast) > ($1.unlockedAt ?? .distantPast) }

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Achievements")
                    .font(.jakarta(TextSize.lg, .extrabold))
                    .trackingTight(TextSize.lg)
                    .foregroundStyle(Theme.ink)
                Spacer()
                Text("\(unlocked.count) / \(achievements.count)")
                    .font(.jakarta(TextSize.sm, .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkMuted)
            }

            if unlocked.isEmpty {
                Text("Nog niets vrijgespeeld. Begin met spelen om achievements te verdienen.")
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(24)
                    .card(.surface)
            } else {
                HStack(spacing: 8) {
                    ForEach(unlocked.prefix(4)) { achievement in
                        VStack(spacing: 6) {
                            Text(achievement.icon)
                                .font(.system(size: 22))
                                .frame(width: 44, height: 44)
                                .background(
                                    LinearGradient(colors: Rarity(achievement.rarity).glow, startPoint: .topLeading, endPoint: .bottomTrailing),
                                    in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                                )
                            Text(achievement.name)
                                .font(.jakarta(10.4, .bold))
                                .foregroundStyle(Theme.inkSoft)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .card(.surface, radius: Theme.Radius.xxl)
                    }
                    ForEach(0..<max(0, 4 - unlocked.prefix(4).count), id: \.self) { _ in
                        Color.clear.frame(maxWidth: .infinity)
                    }
                }
            }

            if showLink {
                NavigationLink(value: AppRoute.achievements) {
                    HStack(spacing: 4) {
                        Text("Bekijk alle achievements")
                        LucideIcon("chevron-right", size: 16)
                    }
                    .font(.jakarta(TextSize.sm, .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .card(.surface, radius: Theme.Radius.xxl)
                }
                .buttonStyle(.pressable)
            }
        }
    }
}

/// A row that opens another screen (`NavCard`).
struct NavCard: View {
    let icon: String
    let accent: Accent
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 16) {
            IconTile(icon: icon, accent: accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.jakarta(TextSize.base, .bold))
                    .trackingTight(TextSize.base)
                    .foregroundStyle(Theme.ink)
                Text(subtitle)
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            LucideIcon("chevron-right", size: 20).foregroundStyle(Theme.inkMuted)
        }
        .padding(16)
        .card(.surface)
    }
}
