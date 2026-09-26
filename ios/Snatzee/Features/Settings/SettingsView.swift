import AuthenticationServices
import SwiftUI
import Supabase

/// The website's /app/settings.
struct SettingsView: View {
    let profile: Profile

    @Environment(SessionStore.self) private var session
    @State private var preferences = Preferences.shared
    @State private var push = PushManager.shared

    @State private var email: String?
    @State private var isPrivate: Bool
    @State private var editing = false
    @State private var pushBusy = false
    @State private var deleteOpen = false
    @State private var signingOut = false

    init(profile: Profile) {
        self.profile = profile
        _isPrivate = State(initialValue: profile.isPrivate)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                BackHeader(title: "Instellingen")

                VStack(spacing: 24) {
                    section("Account", icon: "user-cog") {
                        row("E-mailadres", email ?? "—")
                        row("Username", "@\(profile.username)")
                        if profile.role != "user" { row("Rol", profile.role) }
                        Button("Profiel wijzigen") { editing = true }
                            .buttonStyle(.snatzee(.soft, full: true))
                            .padding(.top, 8)
                    }

                    section("Privacy", icon: "eye") {
                        ToggleRow(
                            label: "Privéprofiel",
                            description: "Verberg je profielpagina voor spelers die geen vriend zijn. Je blijft zichtbaar in ranglijsten.",
                            isOn: Binding(get: { isPrivate }, set: { next in Task { await setPrivate(next) } })
                        )
                        BlockedUsersList()
                    }

                    section("Meldingen", icon: "bell") {
                        ToggleRow(label: "Celebrations", description: "Toon de confetti en overlays bij Yahtzees en records.",
                                  isOn: $preferences.celebrations)
                        ToggleRow(label: "Trillen", description: "Haptische feedback bij knoppen, waar je toestel dat ondersteunt.",
                                  isOn: $preferences.haptics)
                        ToggleRow(label: "Geluid", description: "Speel de Snatzee-geluiden bij het opstarten, een nieuwe score en een achievement.",
                                  isOn: Binding(get: { preferences.sound }, set: { next in
                                      preferences.sound = next
                                      if next { SoundPlayer.shared.play(.score) }
                                  }))
                        ToggleRow(label: "Pushmeldingen", description: pushDescription,
                                  isOn: Binding(get: { push.status == .on }, set: { next in Task { await togglePush(next) } }),
                                  disabled: pushBusy || push.status == .denied)
                        if push.status == .on {
                            Button("Stuur een testmelding") { Task { await sendTest() } }
                                .buttonStyle(.snatzee(.soft, size: .sm, loading: pushBusy))
                                .padding(.vertical, 8)
                        }
                    }

                    section("Weergave", icon: "palette") {
                        ToggleRow(label: "Minder beweging", description: "Beperk animaties en overgangen in de app.",
                                  isOn: $preferences.reducedMotion)
                    }

                    Button {
                        Task {
                            signingOut = true
                            await session.signOut()
                        }
                    } label: {
                        HStack(spacing: 8) { LucideIcon("log-out", size: 20); Text("Uitloggen") }
                    }
                    .buttonStyle(.snatzee(.soft, size: .lg, full: true, loading: signingOut))

                    dangerZone

                    LegalLinks()

                    Text("Snatzee! \(AppConfig.versionString)")
                        .font(.jakarta(TextSize.xs))
                        .foregroundStyle(Theme.inkMuted)
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            email = SupabaseService.client?.auth.currentUser?.email
            await push.refresh()
        }
        .sheet(isPresented: $editing) { EditProfileSheet(profile: profile) }
        .sheet(isPresented: $deleteOpen) { DeleteAccountSheet() }
    }

    private var pushDescription: String {
        push.status == .denied
            ? "Meldingen zijn geblokkeerd. Zet ze aan via Instellingen › Snatzee! › Meldingen."
            : "Een seintje bij vriendschapsverzoeken, verbroken records en nieuwe achievements."
    }

    private var dangerZone: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Gevarenzone")
                .font(.jakarta(TextSize.sm, .bold))
                .foregroundStyle(Theme.roseEmber300)
            Text("Je account verwijderen wist je profiel, al je potjes, Yahtzees, achievements, vriendschappen en groepslidmaatschappen. Dit kan niet ongedaan worden gemaakt.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkSoft)
            Button { deleteOpen = true } label: {
                HStack(spacing: 8) { LucideIcon("trash", size: 16); Text("Account verwijderen") }
            }
            .buttonStyle(.snatzee(.dangerSoft, full: true))
            .padding(.top, 12)
        }
        .padding(16)
        .background(Theme.roseEmber500.opacity(0.10), in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .strokeBorder(Theme.roseEmber500.opacity(0.30), lineWidth: 1)
        )
    }

    private func section<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                LucideIcon(icon, size: 16)
                Text(title.uppercased()).tracking(0.6)
            }
            .font(.jakarta(TextSize.sm, .bold))
            .foregroundStyle(Theme.inkMuted)
            .padding(.bottom, 8)
            content()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(.surface, radius: Theme.Radius.xl2)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(spacing: 16) {
            Text(label).font(.jakarta(TextSize.base15, .semibold)).foregroundStyle(Theme.ink)
            Spacer()
            Text(value).font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted).lineLimit(1).textSelection(.enabled)
        }
        .frame(minHeight: 48)
    }

    // MARK: Actions

    private func setPrivate(_ next: Bool) async {
        isPrivate = next
        do {
            _ = try await API.client().from("profiles").update(["is_private": next]).eq("id", value: profile.id.uuidString).execute()
            ToastCenter.shared.success(next ? "Je profiel is nu privé" : "Je profiel is weer openbaar")
            await session.reloadProfile()
        } catch {
            isPrivate = !next
            ToastCenter.shared.error("Instelling opslaan is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }

    private func togglePush(_ next: Bool) async {
        guard !pushBusy else { return }
        pushBusy = true
        defer { pushBusy = false }
        if next {
            if await push.enable() {
                Haptics.play(.success)
                ToastCenter.shared.success("Meldingen staan aan 🔔")
            } else {
                ToastCenter.shared.error(push.status == .denied
                    ? "Meldingen zijn geblokkeerd. Zet ze aan in je apparaatinstellingen."
                    : "Meldingen aanzetten is niet gelukt.")
            }
        } else {
            await push.disable()
            ToastCenter.shared.success("Meldingen staan uit")
        }
    }

    private func sendTest() async {
        pushBusy = true
        defer { pushBusy = false }
        struct Result: Decodable { let sent: Int }
        do {
            let result: Result = try await ServerRoutes.post("api/push/test")
            ToastCenter.shared.success(result.sent > 0
                ? "Testmelding verstuurd — hij komt zo binnen."
                : "Geen apparaten geregistreerd voor meldingen.")
        } catch {
            ToastCenter.shared.error("Testmelding sturen is niet gelukt.", description: API.translate(error).localizedDescription)
        }
    }
}

/// The players you blocked, each with a way back.
struct BlockedUsersList: View {
    private struct Blocked: Decodable, Identifiable {
        let userId: UUID
        let username: String
        let displayName: String
        let avatarUrl: String?
        var id: UUID { userId }
    }

    @State private var users: [Blocked] = []

    var body: some View {
        Group {
            if !users.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Divider().overlay(Theme.hairline).padding(.vertical, 8)
                    Text("Geblokkeerde spelers")
                        .font(.jakarta(TextSize.sm, .semibold))
                        .foregroundStyle(Theme.ink)
                    ForEach(users) { user in
                        HStack(spacing: 12) {
                            AvatarView(url: user.avatarUrl.flatMap(URL.init(string:)), name: user.displayName, size: .md)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(user.displayName).font(.jakarta(TextSize.base, .semibold)).foregroundStyle(Theme.ink)
                                Text("@\(user.username)").font(.jakarta(TextSize.xs)).foregroundStyle(Theme.inkMuted)
                            }
                            Spacer()
                            Button("Deblokkeren") { Task { await unblock(user) } }
                                .buttonStyle(.snatzee(.soft, size: .sm))
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        users = (try? await API.rpc("list_blocked_users", as: [Blocked].self)) ?? []
    }

    private func unblock(_ user: Blocked) async {
        do {
            try await API.rpcVoid("unblock_user", ["p_user_id": .string(user.userId.uuidString)])
            users.removeAll { $0.userId == user.userId }
            ToastCenter.shared.success("\(user.displayName) is gedeblokkeerd")
        } catch {
            ToastCenter.shared.error("Deblokkeren is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}

/// "Profiel wijzigen": photo, display name and bio.
private struct EditProfileSheet: View {
    let profile: Profile
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var displayName: String
    @State private var bio: String
    @State private var avatarUrl: String?
    @State private var error: String?
    @State private var saving = false

    init(profile: Profile) {
        self.profile = profile
        _displayName = State(initialValue: profile.displayName)
        _bio = State(initialValue: profile.bio ?? "")
        _avatarUrl = State(initialValue: profile.avatarUrl)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Profiel wijzigen").font(.jakarta(TextSize.xl, .extrabold)).foregroundStyle(Theme.ink)
                    Text("Je username ligt vast — de rest kun je altijd aanpassen.")
                        .font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
                }
                AvatarPicker(userId: profile.id, avatarUrl: $avatarUrl, name: displayName)
                    .frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 0) {
                    FieldLabel("Weergavenaam")
                    SnatzeeTextField(placeholder: "Mathijs", text: Binding(get: { displayName }, set: { displayName = String($0.prefix(40)) }))
                        .textContentType(.name)
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text("Bio").font(.jakarta(TextSize.sm, .semibold)).foregroundStyle(Theme.inkSoft)
                        Text("(optioneel)").font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
                    }
                    .padding(.bottom, 8)
                    TextField("", text: Binding(get: { bio }, set: { bio = String($0.prefix(200)) }),
                              prompt: Text("Iets over jezelf").foregroundColor(Theme.inkMuted), axis: .vertical)
                        .lineLimit(3...5)
                        .font(.jakarta(TextSize.base))
                        .foregroundStyle(Theme.ink)
                        .padding(12)
                        .frame(minHeight: 96, alignment: .topLeading)
                        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
                    FieldError(message: error)
                }
            }
            .padding(24)
        }
        .contentMargins(.bottom, 0, for: .scrollContent)
        .safeAreaInset(edge: .bottom) {
            Button("Opslaan") { Task { await save() } }
                .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: saving))
                .disabled(saving)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Theme.canvasSoft)
        }
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
    }

    private func save() async {
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = "Vul een weergavenaam in"; return }
        saving = true
        defer { saving = false }
        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let values: [String: AnyJSON] = [
                "display_name": .string(name),
                "bio": trimmedBio.isEmpty ? .null : .string(trimmedBio),
                "avatar_url": avatarUrl.map { .string($0) } ?? .null,
            ]
            _ = try await API.client().from("profiles").update(values).eq("id", value: profile.id.uuidString).execute()
            Haptics.play(.success)
            ToastCenter.shared.success("Profiel bijgewerkt ✓")
            await session.reloadProfile()
            dismiss()
        } catch {
            self.error = API.translate(error).localizedDescription
        }
    }
}

/// "Account verwijderen": type VERWIJDER, then — for an Apple account —
/// confirm with Apple once more, so the server can revoke the app's access
/// to that Apple ID as the App Store requires.
private struct DeleteAccountSheet: View {
    @Environment(SessionStore.self) private var session
    @State private var confirmation = ""
    @State private var deleting = false
    @State private var error: String?

    private var usesApple: Bool {
        SupabaseService.client?.auth.currentUser?.identities?.contains { $0.provider == "apple" } ?? false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Account verwijderen").font(.jakarta(TextSize.xl, .extrabold)).foregroundStyle(Theme.ink)
            Text("Typ VERWIJDER om te bevestigen. Deze actie is definitief.")
                .font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
            VStack(alignment: .leading, spacing: 0) {
                FieldLabel("Bevestiging")
                SnatzeeTextField(placeholder: "VERWIJDER", text: $confirmation)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                FieldError(message: error)
            }
            if usesApple {
                Text("Je bent ingelogd met Apple. Apple vraagt je nog één keer te bevestigen, zodat Snatzee ook daar wordt losgekoppeld.")
                    .font(.jakarta(TextSize.xs)).foregroundStyle(Theme.inkMuted)
            }
            Spacer()
            Button { Task { await delete() } } label: {
                HStack(spacing: 8) { LucideIcon("trash", size: 16); Text("Definitief verwijderen") }
            }
            .buttonStyle(.snatzee(.danger, size: .lg, full: true, loading: deleting))
            .disabled(confirmation.trimmingCharacters(in: .whitespaces).uppercased() != "VERWIJDER" || deleting)
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
    }

    private func delete() async {
        deleting = true
        error = nil
        defer { deleting = false }
        var body: [String: String] = [:]
        if usesApple, let code = await AppleReauthorization.authorizationCode() {
            body["appleAuthorizationCode"] = code
            body["appleClientId"] = Bundle.main.bundleIdentifier ?? "nl.snatzee.app"
        }
        do {
            struct Result: Decodable { let deleted: Bool }
            let _: Result = try await ServerRoutes.post("api/account/delete", body: body)
            await PushManager.shared.forget()
            await session.signOut()
            ToastCenter.shared.success("Je account is verwijderd")
        } catch {
            self.error = API.translate(error).localizedDescription
        }
    }
}

/// Asks Apple for a fresh authorization code, for revoking on deletion.
@MainActor
enum AppleReauthorization {
    private final class Delegate: NSObject, ASAuthorizationControllerDelegate {
        var continuation: CheckedContinuation<String?, Never>?

        func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential
            let code = credential?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
            continuation?.resume(returning: code)
            continuation = nil
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            continuation?.resume(returning: nil)
            continuation = nil
        }
    }

    private static var delegate: Delegate?

    static func authorizationCode() async -> String? {
        await withCheckedContinuation { continuation in
            let request = ASAuthorizationAppleIDProvider().createRequest()
            let controller = ASAuthorizationController(authorizationRequests: [request])
            let delegate = Delegate()
            delegate.continuation = continuation
            Self.delegate = delegate
            controller.delegate = delegate
            controller.performRequests()
        }
    }
}
