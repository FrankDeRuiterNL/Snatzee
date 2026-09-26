import SwiftUI
import Supabase

enum AuthMode: Hashable {
    case login, register

    var title: String { self == .login ? "Welkom terug" : "Maak je account" }
    var subtitle: String {
        self == .login
            ? "Log in om je scores, records en ranglijsten te zien."
            : "Gratis, en binnen een minuut klaar voor je eerste potje."
    }
}

/// Email and password, for signing in or creating an account — the web
/// app's AuthShell + AuthForm.
struct AuthFormView: View {
    let mode: AuthMode

    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var pending = false
    /// Set once a confirmation mail has gone out.
    @State private var awaitingConfirmation: String?
    @State private var resendIn = 0
    @State private var resending = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                RoundIconButton(icon: "chevron-left", label: "Terug") { dismiss() }

                LogoMark(size: 56).padding(.top, 32)
                Text(awaitingConfirmation == nil ? mode.title : "Check je mail")
                    .font(.jakarta(32, .black))
                    .trackingTight(32)
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 20)
                Text(awaitingConfirmation.map { "We stuurden een bevestigingslink naar \($0). Open die en log daarna hier in." } ?? mode.subtitle)
                    .font(.jakarta(TextSize.base15))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.top, 8)

                if awaitingConfirmation != nil {
                    confirmation.padding(.top, 32)
                } else {
                    form.padding(.top, 32)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task(id: resendIn) {
            guard resendIn > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            resendIn -= 1
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            FieldLabel("E-mailadres")
            SnatzeeTextField(placeholder: "jij@voorbeeld.nl", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.next)

            FieldLabel("Wachtwoord").padding(.top, 20)
            SnatzeeTextField(placeholder: "Minimaal 8 tekens", text: $password, secure: true)
                .textContentType(mode == .login ? .password : .newPassword)
                .submitLabel(.go)
                .onSubmit { Task { await submit() } }

            FieldError(message: error)

            Button(mode == .login ? "Inloggen" : "Account maken") {
                Task { await submit() }
            }
            .buttonStyle(.snatzee(.primary, size: .lg, full: true, loading: pending))
            .disabled(pending)
            .padding(.top, 24)

            if mode == .register {
                ConsentNotice().padding(.top, 12)
            }
        }
    }

    private var confirmation: some View {
        VStack(spacing: 12) {
            IconTile(icon: "mail-check", accent: .mint, size: 64, iconSize: 28, radius: 24)
            Button(resendIn > 0 ? "Opnieuw versturen (\(resendIn))" : "Mail opnieuw versturen") {
                Task { await resend() }
            }
            .buttonStyle(.snatzee(.soft, size: .lg, full: true, loading: resending))
            .disabled(resendIn > 0 || resending)
            Button("Naar inloggen") {
                awaitingConfirmation = nil
                error = nil
            }
            .buttonStyle(.snatzee(.ghost, size: .lg, full: true))
        }
        .frame(maxWidth: .infinity)
    }

    private func submit() async {
        guard !pending else { return }
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { error = "Vul je e-mailadres in"; return }
        guard password.count >= 8 else { error = "Wachtwoord moet minimaal 8 tekens zijn"; return }

        pending = true
        error = nil
        defer { pending = false }

        do {
            let auth = try API.client().auth
            if mode == .register {
                let response = try await auth.signUp(
                    email: trimmed,
                    password: password,
                    redirectTo: AppConfig.apiURL?.appending(path: "auth/confirm")
                )
                // With e-mail confirmation on there is no session yet.
                if response.session == nil {
                    awaitingConfirmation = trimmed
                    resendIn = 30
                    return
                }
            } else {
                try await auth.signIn(email: trimmed, password: password)
            }
            Haptics.play(.success)
            // SessionStore takes it from here.
        } catch {
            let message = API.translate(error).localizedDescription
            self.error = message == "Invalid login credentials" ? "E-mailadres of wachtwoord klopt niet" : message
        }
    }

    private func resend() async {
        guard let address = awaitingConfirmation, resendIn == 0 else { return }
        resending = true
        defer { resending = false }
        do {
            try await API.client().auth.resend(
                email: address,
                type: .signup,
                emailRedirectTo: AppConfig.apiURL?.appending(path: "auth/confirm")
            )
            resendIn = 30
            ToastCenter.shared.success("Mail opnieuw verzonden 📬")
        } catch {
            ToastCenter.shared.error("Versturen is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }
}
