import SwiftUI
import Supabase

/// The website's /app/groups: your groups, a new one, or join with a code.
struct GroupsView: View {
    let profile: Profile

    @Environment(GameCoordinator.self) private var game

    struct GroupSummary: Decodable, Identifiable {
        struct Count: Decodable { let count: Int }

        let id: UUID
        let name: String
        let emoji: String?
        let description: String?
        let groupMembers: [Count]?

        var memberCount: Int { groupMembers?.first?.count ?? 0 }
    }

    @State private var groups: [GroupSummary] = []
    @State private var loaded = false
    @State private var createOpen = false
    @State private var joinOpen = false
    @State private var links = DeepLinks.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BackHeader(title: "Groepen", subtitle: "Ranglijsten binnen je eigen kring.")

                Group {
                    if !loaded {
                        ProgressView().tint(Theme.inkMuted).frame(maxWidth: .infinity).padding(.top, 32)
                    } else if groups.isEmpty {
                        EmptyStateView(
                            emoji: "👥", title: "Nog geen groepen",
                            description: "Maak een groep voor je familie, je collega's of je vaste vrijdagavondclub en vergelijk jullie cijfers."
                        ) {
                            VStack(spacing: 8) {
                                Button { createOpen = true } label: {
                                    HStack(spacing: 8) { LucideIcon("plus", size: 16); Text("Groep maken") }
                                }
                                .buttonStyle(.snatzee(.primary, full: true))
                                Button("Ik heb een uitnodiging") { openJoin() }
                                    .buttonStyle(.snatzee(.ghost, full: true))
                            }
                        }
                    } else {
                        VStack(spacing: 8) {
                            ForEach(groups) { group in
                                NavigationLink(value: AppRoute.group(group.id)) { row(group) }
                                    .buttonStyle(.pressable)
                            }
                        }
                        HStack(spacing: 8) {
                            Button { createOpen = true } label: {
                                HStack(spacing: 8) { LucideIcon("plus", size: 16); Text("Nieuwe groep") }
                            }
                            .buttonStyle(.snatzee(.primary, full: true))
                            Button { openJoin() } label: {
                                HStack(spacing: 8) { LucideIcon("ticket", size: 16); Text("Groep joinen") }
                            }
                            .buttonStyle(.snatzee(.soft, full: true))
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task { if !loaded { await load() } }
        .onChange(of: game.dataVersion) { Task { await load() } }
        // A scanned invite link (camera app → universal link) opens the
        // join sheet with the code filled in.
        .onChange(of: links.inviteCode) { _, code in if code != nil { joinOpen = true } }
        .onAppear { if links.inviteCode != nil { joinOpen = true } }
        .sheet(isPresented: $createOpen) {
            CreateGroupSheet { await load() }
        }
        .sheet(isPresented: $joinOpen, onDismiss: { links.inviteCode = nil }) {
            JoinGroupSheet(initialCode: links.inviteCode) { await load() }
        }
    }

    private func row(_ group: GroupSummary) -> some View {
        HStack(spacing: 16) {
            Text(group.emoji ?? "🎲")
                .font(.system(size: 24))
                .frame(width: 48, height: 48)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name)
                    .font(.jakarta(TextSize.base, .bold))
                    .trackingTight(TextSize.base)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text("\(group.memberCount) \(Formatting.pluralize(group.memberCount, "lid", "leden"))"
                     + (group.description.map { $0.isEmpty ? "" : " · \($0)" } ?? ""))
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

    private func openJoin() {
        Haptics.play(.light)
        joinOpen = true
    }

    private func load() async {
        let id = profile.id.uuidString
        do {
            // Only the groups you are in — an admin can read every group.
            struct Membership: Decodable { let groupId: UUID }
            let memberships = try await API.rows(Membership.self) {
                $0.from("group_members").select("group_id").eq("user_id", value: id)
            }
            let ids = memberships.map(\.groupId.uuidString)
            groups = ids.isEmpty ? [] : try await API.rows(GroupSummary.self) {
                $0.from("groups").select("id, name, emoji, description, group_members(count)")
                    .in("id", values: ids)
                    .order("created_at", ascending: false)
            }
        } catch {
            ToastCenter.shared.error("Groepen laden is niet gelukt", description: API.translate(error).localizedDescription)
        }
        loaded = true
    }
}

// MARK: - Create

private struct CreateGroupSheet: View {
    let onCreated: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(GameCoordinator.self) private var game

    private static let emojiChoices = ["🎲", "👨‍👩‍👧", "🏖️", "💼", "🍻", "🏆", "🌙", "🔥", "🧩", "🥇"]

    @State private var name = ""
    @State private var emoji = "🎲"
    @State private var description = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        SheetScaffold(title: "Nieuwe groep",
                      description: "Groepen zijn er voor de sociale context — geen wedstrijden, wel ranglijsten.") {
            VStack(alignment: .leading, spacing: 0) {
                FieldLabel("Naam")
                SnatzeeTextField(placeholder: "Familie", text: Binding(get: { name }, set: { name = String($0.prefix(40)) }))
                FieldError(message: error)
            }
            VStack(alignment: .leading, spacing: 0) {
                FieldLabel("Icoon")
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(Self.emojiChoices, id: \.self) { choice in
                            Button {
                                Haptics.play(.light)
                                emoji = choice
                            } label: {
                                Text(choice)
                                    .font(.system(size: 24))
                                    .frame(width: 48, height: 48)
                                    .background(emoji == choice ? Theme.mint500.opacity(0.15) : Theme.surface,
                                                in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                                        .strokeBorder(emoji == choice ? Theme.mint500 : Theme.hairline, lineWidth: 1))
                            }
                            .buttonStyle(.pressable)
                            .accessibilityLabel("Icoon \(choice)")
                            .accessibilityAddTraits(emoji == choice ? .isSelected : [])
                        }
                    }
                    .padding(.horizontal, 24)
                }
                .scrollIndicators(.hidden)
                .padding(.horizontal, -24)
            }
            VStack(alignment: .leading, spacing: 0) {
                OptionalFieldLabel("Omschrijving")
                SnatzeeTextArea(placeholder: "Bijv. het jaarlijkse vakantietoernooi", text: $description)
            }
        } footer: {
            Button("Groep maken") { Task { await create() } }
                .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: busy))
                .disabled(busy)
        }
        .presentationDetents([.large])
    }

    private func create() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            error = "Geef je groep een naam van minimaal 2 tekens"
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await API.rpcVoid("create_group", [
                "p_name": .string(trimmed),
                "p_emoji": .string(emoji),
                "p_description": text.isEmpty ? .null : .string(text),
                "p_image_url": .null,
            ])
            Haptics.play(.success)
            ToastCenter.shared.success("Groep aangemaakt 🎉")
            await onCreated()
            game.dataChanged()
            dismiss()
        } catch {
            self.error = API.translate(error).localizedDescription
        }
    }
}

// MARK: - Join

private struct JoinGroupSheet: View {
    let initialCode: String?
    let onJoined: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(GameCoordinator.self) private var game

    enum Mode { case choose, code, scan }

    @State private var mode: Mode
    @State private var code: String
    @State private var error: String?
    @State private var busy = false

    init(initialCode: String?, onJoined: @escaping () async -> Void) {
        self.initialCode = initialCode
        self.onJoined = onJoined
        _mode = State(initialValue: initialCode == nil ? .choose : .code)
        _code = State(initialValue: initialCode ?? "")
    }

    private var descriptionText: String {
        switch mode {
        case .scan: "Scan de QR-code die het andere groepslid laat zien."
        case .code: "Vul de uitnodigingscode in die je van een groepslid kreeg."
        case .choose: "Scan een QR-code of vul de code in die je hebt gekregen."
        }
    }

    var body: some View {
        SheetScaffold(title: "Groep joinen", description: descriptionText) {
            switch mode {
            case .choose:
                VStack(spacing: 12) {
                    Button {
                        Haptics.play(.light)
                        error = nil
                        mode = .scan
                    } label: {
                        HStack(spacing: 8) { LucideIcon("qr-code", size: 20); Text("QR Code scannen") }
                    }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                    Button {
                        Haptics.play(.light)
                        error = nil
                        mode = .code
                    } label: {
                        HStack(spacing: 8) { LucideIcon("keyboard", size: 20); Text("Code invoeren") }
                    }
                    .buttonStyle(.snatzee(.soft, size: .lg, full: true))
                }
            case .scan:
                VStack(spacing: 12) {
                    QRScannerView { value in handleScan(value) }
                    if busy {
                        Text("Bezig met deelnemen…")
                            .font(.jakarta(TextSize.sm))
                            .foregroundStyle(Theme.mint300)
                    }
                    FieldError(message: error)
                    Button("Terug") { mode = .choose }
                        .buttonStyle(.snatzee(.ghost, full: true))
                }
            case .code:
                VStack(alignment: .leading, spacing: 0) {
                    FieldLabel("Uitnodigingscode")
                    TextField("", text: Binding(get: { code }, set: { code = String($0.uppercased().prefix(8)) }),
                              prompt: Text("A1B2C3D4").foregroundColor(Theme.inkMuted))
                        .font(.jakarta(TextSize.xxl, .black))
                        .tracking(7)
                        .multilineTextAlignment(.center)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.mint500)
                        .frame(minHeight: 56)
                        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
                        .submitLabel(.join)
                        .onSubmit { Task { await submit(code) } }
                    FieldError(message: error)
                    Button("Terug") { mode = .choose }
                        .buttonStyle(.snatzee(.ghost, full: true))
                        .padding(.top, 12)
                }
            }
        } footer: {
            if mode == .code {
                Button("Deelnemen") { Task { await submit(code) } }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: busy))
                    .disabled(busy)
            }
        }
        .presentationDetents(mode == .scan ? [.large] : [.medium, .large])
    }

    /// The scanner joins straight away: pointing at the code was the choice.
    private func handleScan(_ value: String) {
        guard let parsed = Invite.parse(value) else {
            error = "Deze QR-code hoort niet bij een Snatzee-groep"
            mode = .code
            return
        }
        code = parsed
        Task { await submit(parsed) }
    }

    private func submit(_ raw: String) async {
        guard !busy else { return }
        guard let parsed = Invite.parse(raw) else {
            error = "Dat is geen geldige uitnodigingscode"
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await API.rpcVoid("join_group", ["p_invite_code": .string(parsed)])
            Haptics.play(.success)
            ToastCenter.shared.success("Je zit in de groep!")
            await onJoined()
            game.dataChanged()
            dismiss()
        } catch {
            self.error = API.translate(error).localizedDescription
            if mode == .scan { mode = .code }
        }
    }
}
