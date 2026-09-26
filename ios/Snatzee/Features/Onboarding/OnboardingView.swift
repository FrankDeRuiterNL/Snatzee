import PhotosUI
import SwiftUI

/// The five onboarding steps from the website: welcome, username, name,
/// photo, done — finished with `complete_onboarding`.
struct OnboardingView: View {
    let profile: Profile
    @Environment(SessionStore.self) private var session

    private enum Step: Int, CaseIterable { case welcome, username, name, photo, done }

    @State private var step: Step = .welcome
    @State private var username: String
    @State private var displayName: String
    @State private var avatarUrl: String?
    @State private var availability: (name: String, available: Bool)?
    @State private var error: String?
    @State private var saving = false

    init(profile: Profile) {
        self.profile = profile
        _username = State(initialValue: profile.username)
        _displayName = State(initialValue: profile.displayName)
        _avatarUrl = State(initialValue: profile.avatarUrl)
    }

    private var normalized: String { username.trimmingCharacters(in: .whitespaces).lowercased() }
    private var formatValid: Bool { normalized.range(of: "^[a-z0-9_]{3,20}$", options: .regularExpression) != nil }
    private var available: Bool? { availability?.name == normalized ? availability?.available : nil }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                ProgressBar(value: Double(step.rawValue + 1) / Double(Step.allCases.count))
                Text("\(step.rawValue + 1)/\(Step.allCases.count)")
                    .font(.jakarta(TextSize.xs, .bold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkMuted)
            }
            .padding(.top, 20)

            Spacer(minLength: 24)
            Group {
                switch step {
                case .welcome: welcome
                case .username: usernameStep
                case .name: nameStep
                case .photo: photoStep
                case .done: doneStep
                }
            }
            .id(step)
            .transition(.asymmetric(
                insertion: .opacity.combined(with: .offset(x: 24)),
                removal: .opacity.combined(with: .offset(x: -24))
            ))
            Spacer(minLength: 24)

            actions
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.bottom, 16)
        .background(Theme.canvas.ignoresSafeArea())
        .task(id: "\(step.rawValue)|\(normalized)") { await checkAvailability() }
    }

    // MARK: Steps

    private var welcome: some View {
        VStack(spacing: 0) {
            LogoMark(size: 96)
            title("Welkom bij Snatzee", size: 33.6).padding(.top, 28)
            paragraph("Speel Yahtzee zoals je gewend bent. Voeg na afloop je eindscore toe — wij houden je records, statistieken en achievements bij.")
                .multilineTextAlignment(.center)
                .padding(.top, 12)
        }
        .frame(maxWidth: .infinity)
    }

    private var usernameStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            title("Kies je username")
            Text("Zo vinden vrienden je terug. Kleine letters, cijfers en _.")
                .font(.jakarta(TextSize.base15))
                .foregroundStyle(Theme.inkMuted)
                .padding(.top, 8)

            FieldLabel("Username").padding(.top, 28)
            SnatzeeTextField(
                placeholder: "mathijs",
                text: Binding(get: { username }, set: { username = String($0.lowercased().prefix(20)) }),
                prefix: "@",
                trailing: AnyView(availabilityIcon)
            )
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            Group {
                if !normalized.isEmpty && !formatValid {
                    Text("Gebruik 3–20 tekens: a–z, 0–9 en _").foregroundStyle(Theme.roseEmber300)
                } else if formatValid && available == false {
                    Text("Deze username is al bezet").foregroundStyle(Theme.roseEmber300)
                } else if formatValid && available == true {
                    Text("@\(normalized) is vrij 🎉").fontWeight(.medium).foregroundStyle(Theme.mint400)
                } else {
                    Text(" ")
                }
            }
            .font(.jakarta(TextSize.sm))
            .padding(.top, 8)
            FieldError(message: error)
        }
    }

    @ViewBuilder
    private var availabilityIcon: some View {
        if formatValid && available == nil {
            ProgressView().controlSize(.small).tint(Theme.inkMuted)
        } else if available == true {
            LucideIcon("check", size: 20).foregroundStyle(Theme.mint400)
        } else if available == false {
            LucideIcon("x", size: 20).foregroundStyle(Theme.roseEmber300)
        }
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            title("Hoe mogen we je noemen?")
            Text("Deze naam zie je terug op ranglijsten en profielen.")
                .font(.jakarta(TextSize.base15))
                .foregroundStyle(Theme.inkMuted)
                .padding(.top, 8)
            FieldLabel("Weergavenaam").padding(.top, 28)
            SnatzeeTextField(
                placeholder: "Mathijs",
                text: Binding(get: { displayName }, set: { displayName = String($0.prefix(40)) })
            )
            .textContentType(.name)
        }
    }

    private var photoStep: some View {
        VStack(spacing: 0) {
            title("Zet er een gezicht bij")
            paragraph("Optioneel — je kunt dit later altijd aanpassen in je instellingen.")
                .multilineTextAlignment(.center)
                .padding(.top, 8)
            AvatarPicker(
                userId: profile.id,
                avatarUrl: $avatarUrl,
                name: displayName.isEmpty ? username : displayName
            )
            .padding(.top, 40)
        }
        .frame(maxWidth: .infinity)
    }

    private var doneStep: some View {
        VStack(spacing: 0) {
            LucideIcon("party-popper", size: 36)
                .foregroundStyle(Theme.navy950)
                .frame(width: 80, height: 80)
                .background(Theme.mint500, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
                .transition(.scale)
            title("Je bent klaar!", size: 33.6).padding(.top, 28)
            paragraph("Pak de dobbelstenen erbij, \(displayName.trimmingCharacters(in: .whitespaces).isEmpty ? normalized : displayName.trimmingCharacters(in: .whitespaces)). Voeg straks je eerste potje toe en de statistieken beginnen te lopen.")
                .multilineTextAlignment(.center)
                .padding(.top, 12)
            FieldError(message: error)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Actions

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 12) {
            switch step {
            case .welcome:
                nextButton("Aan de slag", enabled: true)
            case .username:
                nextButton("Verder", enabled: formatValid && available == true)
            case .name:
                nextButton("Verder", enabled: !displayName.trimmingCharacters(in: .whitespaces).isEmpty)
            case .photo:
                nextButton("Verder", enabled: true)
                Button("Sla over") { advance() }
                    .buttonStyle(.snatzee(.ghost, size: .lg, full: true))
            case .done:
                Button("Naar Snatzee") { Task { await finish() } }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: saving))
                    .disabled(saving)
            }
        }
    }

    private func nextButton(_ label: String, enabled: Bool) -> some View {
        Button { advance() } label: {
            HStack(spacing: 8) {
                Text(label)
                LucideIcon("arrow-right", size: 20)
            }
        }
        .buttonStyle(.snatzee(.primary, size: .lg, full: true))
        .disabled(!enabled)
    }

    private func advance() {
        Haptics.play(.light)
        error = nil
        guard let next = Step(rawValue: step.rawValue + 1) else { return }
        withAnimation(.easeOut(duration: 0.25)) { step = next }
    }

    private func checkAvailability() async {
        guard step == .username, formatValid else { return }
        let name = normalized
        if name == profile.username.lowercased() {
            availability = (name, true)
            return
        }
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        let free = (try? await API.rpc("is_username_available", ["p_username": .string(name)], as: Bool.self)) ?? false
        guard !Task.isCancelled else { return }
        availability = (name, free)
    }

    private func finish() async {
        guard !saving else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            var params: [String: AnyJSON] = [
                "p_username": .string(normalized),
                "p_display_name": .string(displayName.trimmingCharacters(in: .whitespaces)),
            ]
            params["p_avatar_url"] = avatarUrl.map(AnyJSON.string) ?? .null
            try await API.rpcVoid("complete_onboarding", params)
            Haptics.play(.success)
            await session.reloadProfile()
        } catch {
            self.error = API.translate(error).localizedDescription
            withAnimation { step = .username }
        }
    }

    // MARK: Text

    private func title(_ text: String, size: CGFloat = 30.4) -> some View {
        Text(text)
            .font(.jakarta(size, .black))
            .trackingTight(size)
            .foregroundStyle(Theme.ink)
            .multilineTextAlignment(.center)
    }

    private func paragraph(_ text: String) -> some View {
        Text(text)
            .font(.jakarta(16.3))
            .lineSpacing(4)
            .foregroundStyle(Theme.inkSoft)
            .frame(maxWidth: 320)
    }
}

/// The avatar with a button to pick a photo, uploading as soon as one is
/// chosen — the web's AvatarUploader.
struct AvatarPicker: View {
    let userId: UUID
    @Binding var avatarUrl: String?
    let name: String

    @State private var item: PhotosPickerItem?
    @State private var uploading = false

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                AvatarView(url: avatarUrl.flatMap(URL.init(string:)), name: name, size: .xl)
                if uploading {
                    Circle().fill(.black.opacity(0.45)).frame(width: 96, height: 96)
                    ProgressView().tint(.white)
                }
            }
            PhotosPicker(selection: $item, matching: .images) {
                HStack(spacing: 8) {
                    LucideIcon("camera", size: 18)
                    Text(avatarUrl == nil ? "Kies een foto" : "Andere foto")
                }
            }
            .buttonStyle(.snatzee(.soft))
            .disabled(uploading)
        }
        .onChange(of: item) { _, newItem in
            guard let newItem else { return }
            Task { await upload(newItem) }
        }
    }

    private func upload(_ item: PhotosPickerItem) async {
        uploading = true
        defer { uploading = false; self.item = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let jpeg = AvatarUpload.prepare(data)
            else {
                ToastCenter.shared.error("Deze foto kan niet worden gelezen")
                return
            }
            avatarUrl = try await AvatarUpload.upload(jpeg, userId: userId)
            Haptics.play(.success)
        } catch {
            ToastCenter.shared.error("Uploaden is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}
