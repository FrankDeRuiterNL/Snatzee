import SwiftUI
import Supabase

/// The website's /u/[username]: a player's page, with befriending,
/// reporting and blocking.
struct PublicProfileView: View {
    let username: String

    @Environment(GameCoordinator.self) private var game
    @Environment(\.dismiss) private var dismiss

    struct Page: Decodable {
        struct Person: Decodable {
            let id: UUID
            let username: String
            let displayName: String
            let avatarUrl: String?
            let bio: String?
            let isPrivate: Bool
        }

        struct Friendship: Decodable {
            let id: UUID
            let status: String
            let isIncoming: Bool
        }

        struct Score: Decodable {
            let id: UUID
            let userId: UUID
            let score: Int
            let isWin: Bool
            let playedAt: Date
            let createdAt: Date

            /// Public pages show the result, not the sheet or the note.
            var entry: ScoreEntry {
                ScoreEntry(id: id, userId: userId, score: score, isWin: isWin, yahtzeeCount: 0,
                           playedAt: playedAt, note: nil, sheet: nil, createdAt: createdAt)
            }
        }

        let profile: Person
        let isSelf: Bool
        let canViewDetails: Bool
        let blockedByMe: Bool
        let friendship: Friendship?
        let friendCount: Int
        let stats: UserStatistics?
        let achievements: [Achievement]
        let recentScores: [Score]
    }

    private enum LoadState {
        case loading
        case missing
        case failed(String)
        case loaded(Page)
    }

    @State private var state: LoadState = .loading
    @State private var busy = false
    @State private var reportOpen = false
    @State private var blockOpen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    RoundIconButton(icon: "chevron-left", label: "Terug") { dismiss() }
                    Spacer()
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.top, 12)
                .padding(.bottom, -8)

                switch state {
                case .loading:
                    ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 48)
                case .missing:
                    EmptyStateView(emoji: "🔍", title: "Speler niet gevonden",
                                   description: "Er is geen speler met de username @\(username).")
                        .padding(.horizontal, Theme.gutter)
                case .failed(let message):
                    EmptyStateView(emoji: "⚠️", title: "Profiel laden is niet gelukt", description: message)
                        .padding(.horizontal, Theme.gutter)
                case .loaded(let page):
                    content(page)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if case .loading = state { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
    }

    @ViewBuilder
    private func content(_ page: Page) -> some View {
        let person = page.profile

        ProfileHeaderCard(
            displayName: person.displayName,
            username: person.username,
            avatarURL: person.avatarUrl.flatMap(URL.init(string:)),
            bio: person.bio,
            stats: page.stats,
            friendCount: page.friendCount
        ) {
            friendAction(page)
        }
        .padding(.horizontal, Theme.gutter)

        if !page.canViewDetails {
            EmptyStateView(
                emoji: "🔒",
                title: page.blockedByMe ? "Je hebt deze speler geblokkeerd" : "Dit profiel is privé",
                description: page.blockedByMe
                    ? "Deblokkeer \(person.displayName) om het profiel weer te zien."
                    : "\(person.displayName) deelt de details alleen met vrienden. De cijfers hierboven blijven zichtbaar in de ranglijsten."
            )
            .padding(.horizontal, Theme.gutter)
        } else {
            AchievementPreview(achievements: page.achievements, showLink: false)
                .padding(.horizontal, Theme.gutter)

            VStack(alignment: .leading, spacing: 8) {
                Text("Laatste potjes")
                    .font(.jakarta(TextSize.lg, .extrabold))
                    .trackingTight(TextSize.lg)
                    .foregroundStyle(Theme.ink)
                    .padding(.bottom, 4)

                if page.recentScores.isEmpty {
                    Text("\(person.displayName) heeft nog geen potjes geregistreerd.")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(24)
                        .card(.surface)
                } else {
                    ForEach(Array(page.recentScores.enumerated()), id: \.element.id) { index, score in
                        let day = Formatting.playedAt(score.playedAt)
                        if index == 0 || day != Formatting.playedAt(page.recentScores[index - 1].playedAt) {
                            Text(day.uppercased())
                                .font(.jakarta(TextSize.xs, .bold))
                                .tracking(0.6)
                                .foregroundStyle(Theme.inkMuted)
                                .padding(.horizontal, 4)
                                .padding(.top, 12)
                        }
                        ScoreEntryCard(entry: score.entry)
                    }
                }
            }
            .padding(.horizontal, Theme.gutter)
        }

        if !page.isSelf {
            HStack(spacing: 8) {
                Button { reportOpen = true } label: {
                    HStack(spacing: 8) { LucideIcon("flag", size: 16); Text("Melden") }
                }
                .buttonStyle(.snatzee(.ghost, size: .sm, full: true))
                Button {
                    if page.blockedByMe { Task { await toggleBlock(page) } } else { blockOpen = true }
                } label: {
                    HStack(spacing: 8) { LucideIcon("ban", size: 16); Text(page.blockedByMe ? "Deblokkeren" : "Blokkeren") }
                }
                .buttonStyle(.snatzee(page.blockedByMe ? .soft : .ghost, size: .sm, full: true))
            }
            .padding(.horizontal, Theme.gutter)
            .sheet(isPresented: $reportOpen) {
                ReportSheet(userId: person.id, displayName: person.displayName)
            }
            .alert("\(person.displayName) blokkeren?", isPresented: $blockOpen) {
                Button("Annuleren", role: .cancel) {}
                Button("Blokkeren", role: .destructive) { Task { await toggleBlock(page) } }
            } message: {
                Text("Jullie zien elkaar niet meer in zoeken, ranglijsten en meldingen, en een vriendschap of openstaand verzoek vervalt. Je kunt dit later ongedaan maken in Instellingen.")
            }
        }
    }

    @ViewBuilder
    private func friendAction(_ page: Page) -> some View {
        if page.isSelf {
            Text("Dit ben jij")
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.inkMuted)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Theme.surface.opacity(0.10), in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.20), lineWidth: 1))
        } else if page.blockedByMe {
            Button("Geblokkeerd") {}
                .buttonStyle(.snatzee(.soft, size: .sm, full: true))
                .disabled(true)
        } else if page.friendship?.status == "accepted" {
            HStack(spacing: 8) { LucideIcon("check", size: 16); Text("Vrienden") }
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.mint400)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Theme.surface.opacity(0.10), in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.20), lineWidth: 1))
        } else if page.friendship?.status == "pending" && page.friendship?.isIncoming == false {
            Text("Verzoek verzonden")
                .font(.jakarta(TextSize.sm, .semibold))
                .foregroundStyle(Theme.inkMuted)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Theme.surface.opacity(0.10), in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.20), lineWidth: 1))
        } else {
            let incoming = page.friendship?.status == "pending" && page.friendship?.isIncoming == true
            Button { Task { await befriend(page) } } label: {
                HStack(spacing: 8) {
                    LucideIcon(incoming ? "check" : "user-plus", size: 16)
                    Text(incoming ? "Verzoek accepteren" : "Vriend toevoegen")
                }
            }
            .buttonStyle(.snatzee(.primary, full: true, loading: busy))
            .disabled(busy)
        }
    }

    // MARK: Data

    private func load() async {
        do {
            if let page = try await API.rpc("get_public_profile", ["p_username": .string(username)], as: Page?.self) {
                state = .loaded(page)
            } else {
                state = .missing
            }
        } catch {
            if case .loaded = state { return }
            state = .failed(API.translate(error).localizedDescription)
        }
    }

    private func befriend(_ page: Page) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let accepting = page.friendship?.status == "pending" && page.friendship?.isIncoming == true
        do {
            if accepting, let id = page.friendship?.id {
                try await API.rpcVoid("respond_friend_request", ["p_id": .string(id.uuidString), "p_accept": .bool(true)])
                ToastCenter.shared.success("Jullie zijn nu vrienden 🎉")
            } else {
                try await API.rpcVoid("send_friend_request", ["p_user_id": .string(page.profile.id.uuidString)])
                ToastCenter.shared.success("Vriendverzoek verzonden", description: "Naar \(page.profile.displayName)")
            }
            Haptics.play(.success)
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Er ging iets mis", description: API.translate(error).localizedDescription)
        }
    }

    private func toggleBlock(_ page: Page) async {
        let unblocking = page.blockedByMe
        do {
            try await API.rpcVoid(unblocking ? "unblock_user" : "block_user", ["p_user_id": .string(page.profile.id.uuidString)])
            Haptics.play(unblocking ? .light : .warning)
            ToastCenter.shared.success(unblocking
                                       ? "\(page.profile.displayName) is gedeblokkeerd"
                                       : "\(page.profile.displayName) is geblokkeerd")
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Dat is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}

// MARK: - Report

private struct ReportSheet: View {
    let userId: UUID
    let displayName: String

    @Environment(\.dismiss) private var dismiss

    private static let reasons: [(key: String, label: String)] = [
        ("OFFENSIVE_NAME", "Aanstootgevende naam"),
        ("OFFENSIVE_AVATAR", "Aanstootgevende profielfoto"),
        ("OFFENSIVE_BIO", "Aanstootgevende bio"),
        ("CHEATING", "Valsspelen met scores"),
        ("HARASSMENT", "Intimidatie of pesten"),
        ("SPAM", "Spam"),
        ("OTHER", "Iets anders"),
    ]

    @State private var reason: String?
    @State private var details = ""
    @State private var sending = false

    var body: some View {
        SheetScaffold(title: "\(displayName) melden", description: "Wat is er mis? Een beheerder bekijkt elke melding.") {
            VStack(spacing: 8) {
                ForEach(Self.reasons, id: \.key) { option in
                    let selected = reason == option.key
                    Button {
                        Haptics.play(.light)
                        reason = option.key
                    } label: {
                        Text(option.label)
                            .font(.jakarta(TextSize.base15, .semibold))
                            .foregroundStyle(selected ? Theme.mint300 : Theme.inkSoft)
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            .padding(.horizontal, 16)
                            .background(selected ? Theme.mint500.opacity(0.15) : Theme.surface,
                                        in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                                .strokeBorder(selected ? Theme.mint500.opacity(0.4) : Theme.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                OptionalFieldLabel("Toelichting")
                SnatzeeTextArea(placeholder: "", text: $details, limit: 500)
            }
        } footer: {
            Button("Melding versturen") { Task { await send() } }
                .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: sending))
                .disabled(reason == nil || sending)
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(sending)
    }

    private func send() async {
        guard let reason, !sending else { return }
        sending = true
        defer { sending = false }
        let text = details.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await API.rpcVoid("report_content", [
                "p_reason": .string(reason),
                "p_target_user_id": .string(userId.uuidString),
                "p_details": text.isEmpty ? .null : .string(text),
            ])
            Haptics.play(.success)
            ToastCenter.shared.success("Bedankt voor je melding", description: "Een beheerder kijkt ernaar.")
            dismiss()
        } catch {
            ToastCenter.shared.error("Melden is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}
