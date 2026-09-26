import SwiftUI
import Supabase

/// The Vrienden tab — the website's /app/friends.
struct FriendsView: View {
    let profile: Profile
    /// Pushed from the Profile tab rather than shown as a tab.
    var showsBack = false

    @Environment(GameCoordinator.self) private var game

    enum Tab: Hashable { case friends, requests, search }

    private struct SearchRow: Decodable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String
        let avatarUrl: String?
        let gamesPlayed: Int
        let friendshipStatus: String?
        let friendshipId: UUID?
        let isIncoming: Bool?
    }

    private struct GroupId: Decodable { let id: UUID }

    @State private var tab: Tab = .friends
    @State private var overview = FriendsOverview(friends: [], requests: [], sent: [])
    @State private var groupCount = 0
    @State private var loaded = false
    @State private var query = ""
    @State private var results: (query: String, rows: [SearchRow])?
    @State private var busyId: UUID?
    @State private var removing: FriendSummary?
    @State private var withdrawing: FriendSummary?
    @State private var links = DeepLinks.shared

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    private var subtitle: String {
        let friends = overview.friends.count
        let requests = overview.requests.count
        return "\(friends) \(Formatting.pluralize(friends, "vriend", "vrienden"))"
            + (requests > 0 ? " · \(requests) open \(Formatting.pluralize(requests, "verzoek", "verzoeken"))" : "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if showsBack {
                    BackHeader(title: "Vrienden", subtitle: subtitle)
                } else {
                    PageHeader(title: "Vrienden", subtitle: subtitle)
                }

                NavigationLink(value: AppRoute.groups) {
                    NavCard(
                        icon: "users", accent: .grape, title: "Groepen",
                        subtitle: groupCount == 0
                            ? "Maak een groep voor je familie of vrijdagavondclub"
                            : "\(groupCount) \(Formatting.pluralize(groupCount, "groep", "groepen"))"
                    )
                }
                .buttonStyle(.pressable)
                .padding(.horizontal, Theme.gutter)

                Segmented(options: [
                    (value: Tab.friends, label: "Vrienden\(overview.friends.isEmpty ? "" : " (\(overview.friends.count))")"),
                    (value: .requests, label: "Verzoeken\(overview.requests.isEmpty ? "" : " (\(overview.requests.count))")"),
                    (value: .search, label: "Zoeken"),
                ], selection: $tab)
                .padding(.horizontal, Theme.gutter)

                Group {
                    switch tab {
                    case .friends: friendsList
                    case .requests: requestsList
                    case .search: searchPane
                    }
                }
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !loaded { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
        .task(id: trimmedQuery) { await search() }
        // A friend-request notification opens on Verzoeken.
        .onChange(of: links.friendsPane, initial: true) { _, pane in
            guard let pane else { return }
            links.friendsPane = nil
            switch pane {
            case .friends: tab = .friends
            case .requests: tab = .requests
            case .search: tab = .search
            }
        }
        .alert("Vriend verwijderen?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Annuleren", role: .cancel) {}
            Button("Verwijderen", role: .destructive) { if let person = removing { Task { await remove(person) } } }
        } message: {
            Text("\(removing?.displayName ?? "") verdwijnt uit je vriendenlijst en uit je vrienden-ranglijsten.")
        }
        .alert("Verzoek intrekken?", isPresented: Binding(get: { withdrawing != nil }, set: { if !$0 { withdrawing = nil } })) {
            Button("Annuleren", role: .cancel) {}
            Button("Intrekken", role: .destructive) { if let person = withdrawing { Task { await withdraw(person) } } }
        } message: {
            Text("\(withdrawing?.displayName ?? "") ziet je vriendverzoek dan niet meer. Je kunt er later opnieuw een sturen.")
        }
    }

    // MARK: Panes

    @ViewBuilder
    private var friendsList: some View {
        if !loaded {
            ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 32)
        } else if overview.friends.isEmpty {
            EmptyStateView(emoji: "🤝", title: "Nog geen vrienden",
                           description: "Zoek je medespelers op username en stuur ze een vriendverzoek.") {
                Button { tab = .search } label: {
                    HStack(spacing: 8) { LucideIcon("search", size: 16); Text("Spelers zoeken") }
                }
                .buttonStyle(.snatzee(.primary, full: true))
            }
        } else {
            VStack(spacing: 8) {
                ForEach(overview.friends) { friend in
                    PersonRow(username: friend.username, displayName: friend.displayName,
                              avatarURL: friend.avatarURL, gamesPlayed: friend.gamesPlayed) {
                        Button { removing = friend } label: {
                            LucideIcon("user-x", size: 20).foregroundStyle(Theme.inkMuted).frame(width: 44, height: 44)
                        }
                        .buttonStyle(.pressable)
                        .accessibilityLabel("\(friend.displayName) verwijderen als vriend")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var requestsList: some View {
        if overview.requests.isEmpty && overview.sent.isEmpty {
            EmptyStateView(emoji: "📭", title: "Geen openstaande verzoeken",
                           description: "Verzoeken die je krijgt én verstuurt verschijnen hier.")
        } else {
            VStack(alignment: .leading, spacing: 24) {
                if !overview.requests.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionTitle("Ontvangen")
                        ForEach(overview.requests) { request in
                            PersonRow(username: request.username, displayName: request.displayName,
                                      avatarURL: request.avatarURL, gamesPlayed: request.gamesPlayed) {
                                HStack(spacing: 8) {
                                    circleButton("check", variant: .primary, busy: busyId == request.friendshipId,
                                                 label: "Verzoek van \(request.displayName) accepteren") {
                                        Task { await respond(request, accept: true) }
                                    }
                                    circleButton("x", variant: .soft, busy: false,
                                                 label: "Verzoek van \(request.displayName) weigeren") {
                                        Task { await respond(request, accept: false) }
                                    }
                                }
                            }
                        }
                    }
                }
                if !overview.sent.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionTitle("Verzonden")
                        Text("Deze spelers hebben nog niet gereageerd.")
                            .font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
                        ForEach(overview.sent) { request in
                            PersonRow(username: request.username, displayName: request.displayName,
                                      avatarURL: request.avatarURL, gamesPlayed: request.gamesPlayed) {
                                Button("Intrekken") { withdrawing = request }
                                    .buttonStyle(.snatzee(.soft, size: .sm))
                            }
                        }
                    }
                }
            }
        }
    }

    private var searchPane: some View {
        VStack(spacing: 16) {
            SnatzeeTextField(placeholder: "Zoek een speler", text: $query, leadingIcon: "search")
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)

            if trimmedQuery.count < 2 {
                EmptyStateView(emoji: "🔍", title: "Zoek een medespeler",
                               description: "Typ minimaal twee tekens van een username of naam.")
            } else if let results, results.query == trimmedQuery {
                if results.rows.isEmpty {
                    EmptyStateView(emoji: "🤷", title: "Niemand gevonden",
                                   description: "Geen speler gevonden voor \"\(trimmedQuery)\".")
                } else {
                    VStack(spacing: 8) {
                        ForEach(results.rows) { row in
                            PersonRow(username: row.username, displayName: row.displayName,
                                      avatarURL: row.avatarUrl.flatMap(URL.init(string:)), gamesPlayed: row.gamesPlayed) {
                                searchAction(row)
                            }
                        }
                    }
                }
            } else {
                ProgressView().tint(Theme.inkMuted).padding(.top, 16)
            }

            InviteCard(username: profile.username)
        }
    }

    @ViewBuilder
    private func searchAction(_ row: SearchRow) -> some View {
        if row.friendshipStatus == "accepted" {
            HStack(spacing: 4) { LucideIcon("check", size: 14); Text("Vrienden") }
                .font(.jakarta(TextSize.xs, .bold))
                .foregroundStyle(Theme.mint300)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Theme.mint500.opacity(0.15), in: Capsule())
        } else if row.friendshipStatus == "pending" && row.isIncoming == true, let id = row.friendshipId {
            Button("Accepteren") {
                Task { await respondById(id, name: row.displayName) }
            }
            .buttonStyle(.snatzee(.primary, size: .sm, loading: busyId == id))
        } else if row.friendshipStatus == "pending" {
            Text("Verzonden")
                .font(.jakarta(TextSize.xs, .bold))
                .foregroundStyle(Theme.inkMuted)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Theme.canvas, in: Capsule())
        } else {
            circleButton("user-plus", variant: .primary, busy: busyId == row.id,
                         label: "\(row.displayName) toevoegen als vriend") {
                Task { await sendRequest(row) }
            }
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.jakarta(TextSize.sm, .bold))
            .tracking(0.6)
            .foregroundStyle(Theme.inkMuted)
    }

    private func circleButton(_ icon: String, variant: SnatzeeButtonStyle.Variant, busy: Bool, label: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if busy { ProgressView().controlSize(.small) } else { LucideIcon(icon, size: 20) }
            }
            .foregroundStyle(variant == .primary ? Theme.navy950 : Theme.inkMuted)
            .frame(width: 44, height: 44)
            .background(variant == .primary ? Theme.mint500 : Theme.surface, in: Circle())
            .overlay(Circle().strokeBorder(variant == .primary ? .clear : Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(.pressable)
        .disabled(busy)
        .accessibilityLabel(label)
    }

    // MARK: Data

    private func load() async {
        do {
            async let overview = API.rpc("get_friends_overview", as: FriendsOverview.self)
            async let groups = API.rows(GroupId.self) { $0.from("groups").select("id") }
            self.overview = try await overview
            self.groupCount = (try? await groups.count) ?? 0
        } catch {
            ToastCenter.shared.error("Laden is niet gelukt", description: API.translate(error).localizedDescription)
        }
        loaded = true
    }

    private func search() async {
        let text = trimmedQuery
        guard tab == .search || !text.isEmpty, text.count >= 2 else { return }
        try? await Task.sleep(for: .milliseconds(320))
        guard !Task.isCancelled else { return }
        let rows = (try? await API.rpc("search_users", ["p_query": .string(text), "p_limit": .integer(20)], as: [SearchRow].self)) ?? []
        guard !Task.isCancelled else { return }
        results = (text, rows)
    }

    private func sendRequest(_ row: SearchRow) async {
        guard busyId == nil else { return }
        busyId = row.id
        defer { busyId = nil }
        do {
            try await API.rpcVoid("send_friend_request", ["p_user_id": .string(row.id.uuidString)])
            Haptics.play(.success)
            ToastCenter.shared.success("Vriendverzoek verzonden", description: "Naar \(row.displayName)")
            await search()
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Verzoek versturen is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }

    private func respond(_ request: FriendSummary, accept: Bool) async {
        guard let id = request.friendshipId else { return }
        await respondById(id, name: request.displayName, accept: accept)
    }

    private func respondById(_ id: UUID, name: String, accept: Bool = true) async {
        guard busyId == nil else { return }
        busyId = id
        defer { busyId = nil }
        do {
            try await API.rpcVoid("respond_friend_request", ["p_id": .string(id.uuidString), "p_accept": .bool(accept)])
            Haptics.play(accept ? .success : .light)
            ToastCenter.shared.success(accept ? "Jullie zijn nu vrienden 🎉" : "Verzoek geweigerd")
            game.dataChanged()
            if tab == .search { await search() }
        } catch {
            ToastCenter.shared.error("Er ging iets mis", description: API.translate(error).localizedDescription)
        }
    }

    private func remove(_ friend: FriendSummary) async {
        do {
            try await API.rpcVoid("remove_friend", ["p_user_id": .string(friend.id.uuidString)])
            ToastCenter.shared.success("Vriend verwijderd")
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Verwijderen is niet gelukt", description: API.translate(error).localizedDescription)
        }
        removing = nil
    }

    private func withdraw(_ request: FriendSummary) async {
        do {
            try await API.rpcVoid("remove_friend", ["p_user_id": .string(request.id.uuidString)])
            Haptics.play(.light)
            ToastCenter.shared.success("Verzoek aan \(request.displayName) ingetrokken")
            game.dataChanged()
        } catch {
            ToastCenter.shared.error("Intrekken is niet gelukt", description: API.translate(error).localizedDescription)
        }
        withdrawing = nil
    }
}

/// `PersonRow`: avatar, name and games, opening the player's profile, with
/// an action on the right.
struct PersonRow<Action: View>: View {
    let username: String
    let displayName: String
    let avatarURL: URL?
    let gamesPlayed: Int
    @ViewBuilder var action: () -> Action

    var body: some View {
        HStack(spacing: 12) {
            NavigationLink(value: AppRoute.publicProfile(username)) {
                HStack(spacing: 12) {
                    AvatarView(url: avatarURL, name: displayName, size: .md)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(displayName)
                            .font(.jakarta(TextSize.base, .bold))
                            .trackingTight(TextSize.base)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text("@\(username) · \(gamesPlayed) \(Formatting.pluralize(gamesPlayed, "potje", "potjes"))")
                            .font(.jakarta(TextSize.xs))
                            .foregroundStyle(Theme.inkMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            action()
        }
        .padding(12)
        .card(.surface)
    }
}

/// "Speelt iemand nog geen Snatzee?" — share an invitation.
struct InviteCard: View {
    let username: String

    private var message: String {
        let site = AppConfig.apiURL?.absoluteString ?? "https://www.snatzee.nl"
        return "\(username) wil je uitnodigen om de Snatzee app te gebruiken! Open de app via \(site), registreer je account en voeg de app toe aan je homescreen om te joinen!"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            IconTile(icon: "user-plus", accent: .grape)
            VStack(alignment: .leading, spacing: 2) {
                Text("Speelt iemand nog geen Snatzee?")
                    .font(.jakarta(TextSize.base, .bold))
                    .foregroundStyle(Theme.ink)
                Text("Stuur ze een uitnodiging met een link naar de app.")
                    .font(.jakarta(TextSize.sm))
                    .foregroundStyle(Theme.inkMuted)
                ShareLink(item: message) {
                    HStack(spacing: 8) { LucideIcon("share-2", size: 16); Text("Uitnodiging delen") }
                }
                .buttonStyle(.snatzee(.soft, size: .sm))
                .padding(.top, 12)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .card(.surface)
    }
}
