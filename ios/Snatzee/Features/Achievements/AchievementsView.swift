import SwiftUI

/// The website's /app/achievements.
struct AchievementsView: View {
    let profile: Profile

    @Environment(GameCoordinator.self) private var game

    enum Category: String, CaseIterable {
        case all, scores, yahtzee, wins, games, social, secret
        var label: String {
            switch self {
            case .all: "Alles"
            case .scores: "Scores"
            case .yahtzee: "Yahtzee"
            case .wins: "Wins"
            case .games: "Potjes"
            case .social: "Sociaal"
            case .secret: "Secret"
            }
        }
    }

    @State private var achievements: [Achievement] = []
    @State private var loaded = false
    @State private var category: Category = .all
    @State private var detail: Achievement?

    private var unlockedCount: Int { achievements.filter(\.isUnlocked).count }

    private var visible: [Achievement] {
        switch category {
        case .all: achievements
        case .secret: achievements.filter(\.isSecret)
        default: achievements.filter { $0.category == category.rawValue && !$0.isSecret }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                BackHeader(title: "Achievements", subtitle: "Records, mijlpalen en een paar geheimen.")

                if !loaded {
                    ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    progressCard.padding(.horizontal, Theme.gutter)
                    ChipScroller(options: Category.allCases.map { (value: $0, label: $0.label) }, selection: $category)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                        ForEach(visible) { achievement in
                            Button { detail = achievement } label: { AchievementCard(achievement: achievement) }
                                .buttonStyle(.pressable)
                        }
                    }
                    .padding(.horizontal, Theme.gutter)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !loaded { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
        .sheet(item: $detail) { AchievementDetail(achievement: $0) }
    }

    private var progressCard: some View {
        let total = max(achievements.count, 1)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Vrijgespeeld")
                    .font(.jakarta(TextSize.sm, .semibold))
                    .foregroundStyle(Theme.inkMuted)
                Spacer()
                Text("\(Int((Double(unlockedCount) / Double(total) * 100).rounded()))%")
                    .font(.jakarta(TextSize.sm, .bold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.mint400)
            }
            (Text("\(unlockedCount)")
                + Text(" / \(achievements.count)").font(.jakarta(TextSize.xxl, .extrabold)).foregroundColor(Theme.inkMuted))
                .font(.jakarta(TextSize.xxxxl, .black))
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.top, 4)
            ProgressBar(value: Double(unlockedCount) / Double(total))
                .padding(.top, 16)
        }
        .padding(24)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
        .snatzeeShadow(.lift)
    }

    private func load() async {
        do {
            achievements = try await AchievementStore.load(userId: profile.id)
        } catch {
            ToastCenter.shared.error("Laden is niet gelukt", description: API.translate(error).localizedDescription)
        }
        loaded = true
    }
}

/// `<AchievementCard>`
struct AchievementCard: View {
    let achievement: Achievement

    private var rarity: Rarity { Rarity(achievement.rarity) }
    private var hidden: Bool { achievement.isSecret && !achievement.isUnlocked }

    var body: some View {
        let unlocked = achievement.isUnlocked

        VStack(spacing: 0) {
            ZStack {
                if unlocked {
                    RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                        .fill(LinearGradient(colors: rarity.glow, startPoint: .topLeading, endPoint: .bottomTrailing))
                } else {
                    RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).fill(.white.opacity(0.10))
                }
                if hidden {
                    LucideIcon("lock", size: 24).foregroundStyle(Theme.inkMuted)
                } else {
                    Text(achievement.icon)
                        .font(.system(size: 30))
                        .grayscale(unlocked ? 0 : 1)
                        .opacity(unlocked ? 1 : 0.4)
                }
            }
            .frame(width: 56, height: 56)

            Text(hidden ? "Verborgen" : achievement.name)
                .font(.jakarta(TextSize.sm, .bold))
                .trackingTight(TextSize.sm)
                .foregroundStyle(unlocked ? Theme.ink : Theme.inkMuted)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(minHeight: 36, alignment: .top)
                .padding(.top, 12)

            Text(rarity.label.uppercased())
                .font(.jakarta(9.6, .bold))
                .tracking(1)
                .foregroundStyle(unlocked ? rarity.accent : Theme.inkMuted)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(unlocked ? rarity.chipBackground : .white.opacity(0.10), in: Capsule())
                .padding(.top, 6)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            unlocked ? Theme.surface : Theme.canvasSoft.opacity(0.6),
            in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 1)
        )
        .modifier(ConditionalSoftShadow(on: unlocked))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(hidden ? "Verborgen achievement" : "\(achievement.name) — \(achievement.description)")
    }
}

private struct ConditionalSoftShadow: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.snatzeeShadow(.soft) } else { content }
    }
}

private struct AchievementDetail: View {
    let achievement: Achievement

    private var rarity: Rarity { Rarity(achievement.rarity) }
    private var hidden: Bool { achievement.isSecret && !achievement.isUnlocked }

    var body: some View {
        let unlocked = achievement.isUnlocked

        VStack(spacing: 0) {
            Text(hidden ? "Verborgen achievement" : achievement.name)
                .font(.jakarta(TextSize.xl, .extrabold))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)

            Text(hidden ? "🔒" : achievement.icon)
                .font(.system(size: 48))
                .grayscale(unlocked ? 0 : 1)
                .opacity(unlocked ? 1 : 0.4)
                .frame(width: 96, height: 96)
                .background {
                    if unlocked {
                        RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                            .fill(LinearGradient(colors: rarity.glow, startPoint: .topLeading, endPoint: .bottomTrailing))
                    } else {
                        RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous).fill(.white.opacity(0.10))
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                        .strokeBorder(unlocked ? rarity.ring : Theme.hairline, lineWidth: 4)
                )
                .padding(.top, 20)

            Text(rarity.label.uppercased())
                .font(.jakarta(11.2, .bold))
                .tracking(1.1)
                .foregroundStyle(unlocked ? rarity.accent : Theme.inkMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(unlocked ? rarity.chipBackground : .white.opacity(0.10), in: Capsule())
                .padding(.top, 16)

            Text(hidden ? "Deze achievement blijft geheim tot je hem vrijspeelt. Blijf spelen!" : achievement.description)
                .font(.jakarta(TextSize.base15))
                .foregroundStyle(Theme.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .padding(.top, 16)

            Text(achievement.unlockedAt.map { "Vrijgespeeld op \(Formatting.playedAt($0))" } ?? "Nog niet vrijgespeeld")
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.inkMuted)
                .padding(.top, 20)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .presentationDetents([.height(440)])
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
    }
}
