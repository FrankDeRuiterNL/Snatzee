import SwiftUI
import Supabase

/// The website's /app/groups/[id]: the group card, its members, inviting
/// and its own leaderboards.
struct GroupDetailView: View {
    let profile: Profile
    let groupId: UUID

    @Environment(GameCoordinator.self) private var game
    @Environment(\.dismiss) private var dismiss

    struct Detail: Decodable {
        struct GroupInfo: Decodable {
            let id: UUID
            let name: String
            let emoji: String?
            let description: String?
            let inviteCode: String
        }

        let group: GroupInfo
        let isOwner: Bool
        let minGamesForAverageRanking: Int?
        let members: [Member]
    }

    struct Member: Decodable, Identifiable {
        let userId: UUID
        let username: String
        let displayName: String
        let avatarUrl: String?
        let role: String
        let gamesPlayed: Int
        var id: UUID { userId }
        var avatarURL: URL? { avatarUrl.flatMap(URL.init(string:)) }
    }

    @State private var detail: Detail?
    @State private var failed: String?
    @State private var friends: [FriendSummary] = []
    @State private var membersOpen = false
    @State private var addOpen = false
    @State private var inviteOpen = false
    @State private var leaveOpen = false
    @State private var removing: Member?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                BackHeader(title: "Groep")

                if let detail {
                    header(detail).padding(.horizontal, Theme.gutter)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Ranglijsten")
                            .font(.jakarta(TextSize.lg, .extrabold))
                            .trackingTight(TextSize.lg)
                            .foregroundStyle(Theme.ink)
                        Text("Alleen de leden van \(detail.group.name).")
                            .font(.jakarta(TextSize.sm))
                            .foregroundStyle(Theme.inkMuted)
                    }
                    .padding(.horizontal, Theme.gutter)

                    GroupLeaderboard(groupId: groupId, minGames: detail.minGamesForAverageRanking ?? 5)

                    Button { leaveOpen = true } label: {
                        HStack(spacing: 8) { LucideIcon("log-out", size: 16); Text("Groep verlaten") }
                    }
                    .buttonStyle(.snatzee(.dangerSoft, full: true))
                    .padding(.horizontal, Theme.gutter)
                    .padding(.top, 8)
                } else if let failed {
                    EmptyStateView(emoji: "🔍", title: "Groep niet gevonden", description: failed)
                        .padding(.horizontal, Theme.gutter)
                } else {
                    ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 32)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if detail == nil { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
        .sheet(isPresented: $membersOpen) { membersSheet }
        .sheet(isPresented: $addOpen) {
            if let detail {
                AddMembersSheet(groupId: groupId, invitable: invitable(detail)) { await load() }
            }
        }
        .sheet(isPresented: $inviteOpen) {
            if let detail { InviteSheet(group: detail.group) }
        }
        .alert("Groep verlaten?", isPresented: $leaveOpen) {
            Button("Annuleren", role: .cancel) {}
            Button("Verlaten", role: .destructive) { Task { await leave() } }
        } message: {
            Text(detail?.isOwner == true
                 ? "Je bent de eigenaar. Het eigenaarschap gaat over naar een ander lid, of de groep wordt verwijderd als jij het laatste lid bent."
                 : "Je verdwijnt uit de ranglijsten van \(detail?.group.name ?? "de groep"). Je kunt later opnieuw deelnemen met de uitnodigingscode.")
        }
    }

    // MARK: Header

    private func header(_ detail: Detail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 16) {
                Text(detail.group.emoji ?? "🎲")
                    .font(.system(size: 30))
                    .frame(width: 56, height: 56)
                    .background(Theme.surface.opacity(0.10), in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.group.name)
                        .font(.jakarta(TextSize.xxl, .black))
                        .trackingTight(TextSize.xxl)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text("\(detail.members.count) \(Formatting.pluralize(detail.members.count, "lid", "leden"))")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                }
            }

            if let description = detail.group.description, !description.isEmpty {
                Text(description)
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkSoft)
                    .lineSpacing(3)
                    .padding(.top, 16)
            }

            HStack(spacing: -8) {
                ForEach(detail.members.prefix(7)) { member in
                    AvatarView(url: member.avatarURL, name: member.displayName, size: .sm)
                        .overlay(Circle().strokeBorder(Theme.hairlineStrong, lineWidth: 2))
                }
                if detail.members.count > 7 {
                    Text("+\(detail.members.count - 7)")
                        .font(.jakarta(TextSize.xs, .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Theme.surface.opacity(0.10), in: Circle())
                        .overlay(Circle().strokeBorder(Theme.hairlineStrong, lineWidth: 2))
                }
            }
            .padding(.top, 20)

            HStack(spacing: 8) {
                Button("Leden") { membersOpen = true }
                    .buttonStyle(.snatzee(.primary, size: .sm, full: true))
                Button {
                    Haptics.play(.light)
                    inviteOpen = true
                } label: {
                    HStack(spacing: 8) { LucideIcon("share-2", size: 16); Text("Uitnodigen") }
                        .font(.jakarta(TextSize.sm, .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Theme.surface.opacity(0.10), in: Capsule())
                        .overlay(Capsule().strokeBorder(.white.opacity(0.20), lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }
            .padding(.top, 20)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
        .snatzeeShadow(.lift)
    }

    // MARK: Members

    private var membersSheet: some View {
        let members = detail?.members ?? []
        let canAdd = detail.map { !invitable($0).isEmpty } ?? false
        return NavigationStack {
            SheetScaffold(
                title: "Leden",
                description: "\(members.count) \(Formatting.pluralize(members.count, "lid", "leden")) in \(detail?.group.name ?? "")"
            ) {
                VStack(spacing: 8) {
                    ForEach(members) { member in memberRow(member) }
                }
            } footer: {
                if canAdd {
                    Button {
                        membersOpen = false
                        addOpen = true
                    } label: {
                        HStack(spacing: 8) { LucideIcon("user-plus", size: 20); Text("Vrienden toevoegen") }
                    }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                }
            }
            .background(Theme.canvasSoft)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: AppRoute.self) { route in
                if case .publicProfile(let username) = route { PublicProfileView(username: username) }
            }
        }
        .presentationDetents([.medium, .large])
        .alert("Lid verwijderen?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Annuleren", role: .cancel) {}
            Button("Verwijderen", role: .destructive) { if let member = removing { Task { await remove(member) } } }
        } message: {
            Text("\(removing?.displayName ?? "") verlaat \(detail?.group.name ?? "de groep").")
        }
    }

    private func memberRow(_ member: Member) -> some View {
        HStack(spacing: 12) {
            NavigationLink(value: AppRoute.publicProfile(member.username)) {
                HStack(spacing: 12) {
                    AvatarView(url: member.avatarURL, name: member.displayName, size: .sm)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(member.displayName)
                            .font(.jakarta(TextSize.base, .bold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text("@\(member.username) · \(member.gamesPlayed) \(Formatting.pluralize(member.gamesPlayed, "potje", "potjes"))")
                            .font(.jakarta(TextSize.xs))
                            .foregroundStyle(Theme.inkMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)

            if member.role == "owner" {
                Text("EIGENAAR")
                    .font(.jakarta(10.4, .bold))
                    .tracking(0.8)
                    .foregroundStyle(Theme.tangerine300)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Theme.tangerine500.opacity(0.15), in: Capsule())
            } else if detail?.isOwner == true {
                Button { removing = member } label: {
                    LucideIcon("user-minus", size: 20).foregroundStyle(Theme.inkMuted).frame(width: 44, height: 44)
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("\(member.displayName) verwijderen uit de groep")
            }
        }
        .padding(12)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
    }

    private func invitable(_ detail: Detail) -> [FriendSummary] {
        let memberIds = Set(detail.members.map(\.userId))
        return friends.filter { !memberIds.contains($0.id) }
    }

    // MARK: Data

    private func load() async {
        do {
            async let detail = API.rpc("get_group_detail", ["p_group_id": .string(groupId.uuidString)], as: Detail.self)
            async let overview = try? API.rpc("get_friends_overview", as: FriendsOverview.self)
            self.detail = try await detail
            self.friends = await overview?.friends ?? []
            failed = nil
        } catch {
            if detail == nil { failed = API.translate(error).localizedDescription }
        }
    }

    private func leave() async {
        do {
            try await API.rpcVoid("leave_group", ["p_group_id": .string(groupId.uuidString)])
            ToastCenter.shared.success("Je hebt de groep verlaten")
            game.dataChanged()
            dismiss()
        } catch {
            ToastCenter.shared.error("Verlaten is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }

    private func remove(_ member: Member) async {
        do {
            try await API.rpcVoid("remove_group_member", [
                "p_group_id": .string(groupId.uuidString),
                "p_user_id": .string(member.userId.uuidString),
            ])
            ToastCenter.shared.success("\(member.displayName) is verwijderd")
            removing = nil
            await load()
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Verwijderen is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}

// MARK: - Invite

private struct InviteSheet: View {
    let group: GroupDetailView.Detail.GroupInfo

    @State private var showQR = false

    var body: some View {
        SheetScaffold(
            title: "Uitnodigen",
            description: showQR
                ? "Laat de ander deze code scannen met Groep joinen — of met de cameraapp."
                : "Deel \(group.name) met iemand die nog geen lid is."
        ) {
            VStack(spacing: 12) {
                if showQR {
                    InviteQRCode(value: Invite.url(code: group.inviteCode)?.absoluteString ?? group.inviteCode)
                    Text(group.inviteCode)
                        .font(.system(size: TextSize.lg, weight: .bold, design: .monospaced))
                        .tracking(3.6)
                        .foregroundStyle(Theme.ink)
                        .textSelection(.enabled)
                        .padding(.top, 4)
                    Button("Terug") { showQR = false }
                        .buttonStyle(.snatzee(.ghost, full: true))
                } else {
                    Button {
                        UIPasteboard.general.string = group.inviteCode
                        Haptics.play(.success)
                        ToastCenter.shared.success("Code gekopieerd", description: group.inviteCode)
                    } label: {
                        HStack(spacing: 8) { LucideIcon("copy", size: 20); Text("Kopieer ID") }
                    }
                    .buttonStyle(.snatzee(.soft, size: .lg, full: true))
                    Button {
                        Haptics.play(.light)
                        showQR = true
                    } label: {
                        HStack(spacing: 8) { LucideIcon("qr-code", size: 20); Text("QR Code") }
                    }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                    if let url = Invite.url(code: group.inviteCode) {
                        ShareLink(item: url, message: Text("Doe mee met \(group.name) op Snatzee! Code: \(group.inviteCode)")) {
                            HStack(spacing: 8) { LucideIcon("share-2", size: 20); Text("Link delen") }
                        }
                        .buttonStyle(.snatzee(.ghost, size: .lg, full: true))
                    }
                }
            }
        }
        .presentationDetents(showQR ? [.large] : [.medium])
    }
}

// MARK: - Add friends

private struct AddMembersSheet: View {
    let groupId: UUID
    let invitable: [FriendSummary]
    let onAdded: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(GameCoordinator.self) private var game

    @State private var selected: Set<UUID> = []
    @State private var busy = false

    var body: some View {
        SheetScaffold(title: "Vrienden toevoegen", description: "Kies wie je aan deze groep wilt toevoegen.") {
            VStack(spacing: 8) {
                ForEach(invitable) { friend in
                    let checked = selected.contains(friend.id)
                    Button {
                        Haptics.play(.light)
                        if checked { selected.remove(friend.id) } else { selected.insert(friend.id) }
                    } label: {
                        HStack(spacing: 12) {
                            AvatarView(url: friend.avatarURL, name: friend.displayName, size: .sm)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(friend.displayName)
                                    .font(.jakarta(TextSize.base, .bold))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                Text("@\(friend.username)")
                                    .font(.jakarta(TextSize.xs))
                                    .foregroundStyle(Theme.inkMuted)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            if checked {
                                LucideIcon("check", size: 20).foregroundStyle(Theme.mint400)
                            }
                        }
                        .padding(12)
                        .background(checked ? Theme.mint500.opacity(0.15) : Theme.surface,
                                    in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                            .strokeBorder(checked ? Theme.mint500 : Theme.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .accessibilityAddTraits(checked ? .isSelected : [])
                }
            }
        } footer: {
            Button(selected.isEmpty
                   ? "Selecteer vrienden"
                   : "\(selected.count) \(Formatting.pluralize(selected.count, "vriend", "vrienden")) toevoegen") {
                Task { await add() }
            }
            .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: busy))
            .disabled(selected.isEmpty || busy)
        }
        .presentationDetents([.medium, .large])
    }

    private func add() async {
        guard !busy, !selected.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            try await API.rpcVoid("add_group_members", [
                "p_group_id": .string(groupId.uuidString),
                "p_user_ids": .array(selected.map { .string($0.uuidString) }),
            ])
            Haptics.play(.success)
            ToastCenter.shared.success("\(selected.count) \(Formatting.pluralize(selected.count, "lid", "leden")) toegevoegd")
            await onAdded()
            game.dataChanged()
            dismiss()
        } catch {
            ToastCenter.shared.error("Toevoegen is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}

// MARK: - Leaderboard

/// The Ranking tab's list, locked to one group.
struct GroupLeaderboard: View {
    let groupId: UUID
    let minGames: Int

    @Environment(GameCoordinator.self) private var game

    @State private var metric: RankingsView.Metric = .highestScore
    @State private var result: (key: String, rows: [RankingsView.Row], error: String?)?

    private var key: String { "\(metric.rawValue)|\(game.dataVersion)" }

    var body: some View {
        let current = result?.key == key ? result : nil

        VStack(alignment: .leading, spacing: 16) {
            ChipScroller(options: RankingsView.Metric.allCases.map { (value: $0, label: $0.label) }, selection: $metric)

            VStack(alignment: .leading, spacing: 4) {
                Text(metric.title)
                    .font(.jakarta(TextSize.lg, .extrabold))
                    .trackingTight(TextSize.lg)
                    .foregroundStyle(Theme.ink)
                if metric == .averageScore {
                    HStack(spacing: 6) {
                        LucideIcon("info", size: 16)
                        Text("Minimaal \(minGames) potjes nodig")
                    }
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
                }
            }
            .padding(.horizontal, Theme.gutter)

            Group {
                if let current {
                    if let error = current.error {
                        EmptyStateView(emoji: "⚠️", title: "Ranglijst kon niet laden", description: error)
                    } else if current.rows.isEmpty {
                        EmptyStateView(emoji: "🏆", title: "Nog niets te ranken",
                                       description: "Zodra groepsleden potjes registreren verschijnt hier de ranglijst.")
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(current.rows) { row in
                                NavigationLink(value: AppRoute.publicProfile(row.username)) {
                                    LeaderboardRowView(row: row, decimals: metric.decimals)
                                }
                                .buttonStyle(.pressable)
                            }
                        }
                    }
                } else {
                    ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 16)
                }
            }
            .padding(.horizontal, Theme.gutter)
        }
        .task(id: key) { await load() }
    }

    private func load() async {
        let key = key
        do {
            let rows = try await API.rpc("get_leaderboard", [
                "p_metric": .string(metric.rawValue),
                "p_scope": .string("group"),
                "p_group_id": .string(groupId.uuidString),
                "p_limit": .integer(50),
            ], as: [RankingsView.Row].self)
            guard key == self.key else { return }
            result = (key, rows, nil)
        } catch {
            guard key == self.key else { return }
            result = (key, [], API.translate(error).localizedDescription)
        }
    }
}
