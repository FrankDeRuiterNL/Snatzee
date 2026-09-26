import AuthenticationServices
import CryptoKit
import SwiftUI
import Supabase

/// Sign in with Apple, handed to GoTrue as an ID token.
///
/// Apple signs a token that carries a hash of a one-time nonce; GoTrue
/// checks the hash against the raw nonce we send alongside it, so a
/// token cannot be replayed. The server must list the app's bundle ID in
/// APPLE_CLIENT_ID for GoTrue to accept tokens minted for it.
///
/// Drawn as our own button — the Apple logo and "Ga door met Apple" in the
/// app's font, white as Apple's guidelines ask — so it matches the buttons
/// next to it. The system button sets its own, larger type.
struct AppleSignInButton: View {
    var onError: (String) -> Void

    @State private var nonce = AppleSignInButton.randomNonce()
    @State private var pending = false

    var body: some View {
        Button {
            Task { await start() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "apple.logo")
                    .font(.system(size: 17, weight: .semibold))
                    .offset(y: -1)
                Text("Ga door met Apple")
            }
        }
        .buttonStyle(.snatzee(.white, size: .lg, full: true, loading: pending))
        .disabled(pending)
        .accessibilityLabel("Ga door met Apple")
    }

    @MainActor
    private func start() async {
        pending = true
        defer { pending = false }
        nonce = Self.randomNonce()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
        await complete(await AppleAuthorization.perform(request))
    }

    @MainActor
    private func complete(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            // Closing the sheet is not an error worth showing.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            onError("Inloggen met Apple is niet gelukt.")
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8)
            else {
                onError("Apple gaf geen geldige aanmelding terug.")
                return
            }
            do {
                try await API.client().auth.signInWithIdToken(
                    credentials: OpenIDConnectCredentials(provider: .apple, idToken: token, nonce: nonce)
                )
                Haptics.play(.success)
                // SessionStore picks the new session up from the auth events.
            } catch {
                onError(API.translate(error).localizedDescription)
            }
        }
    }

    private static func randomNonce(length: Int = 32) -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in characters.randomElement(using: &generator)! })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Runs one Sign in with Apple request and waits for its answer.
@MainActor
enum AppleAuthorization {
    private final class Delegate: NSObject, ASAuthorizationControllerDelegate {
        var continuation: CheckedContinuation<Result<ASAuthorization, Error>, Never>?

        func authorizationController(controller: ASAuthorizationController,
                                     didCompleteWithAuthorization authorization: ASAuthorization) {
            continuation?.resume(returning: .success(authorization))
            continuation = nil
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            continuation?.resume(returning: .failure(error))
            continuation = nil
        }
    }

    /// Kept alive while the sheet is up; the controller holds it weakly.
    private static var delegate: Delegate?

    static func perform(_ request: ASAuthorizationAppleIDRequest) async -> Result<ASAuthorization, Error> {
        let result = await withCheckedContinuation { continuation in
            let delegate = Delegate()
            delegate.continuation = continuation
            Self.delegate = delegate
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = delegate
            controller.performRequests()
        }
        delegate = nil
        return result
    }
}
