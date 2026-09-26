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
struct AppleSignInButton: View {
    var onError: (String) -> Void

    @State private var nonce = AppleSignInButton.randomNonce()

    var body: some View {
        SignInWithAppleButton(.continue) { request in
            nonce = Self.randomNonce()
            request.requestedScopes = [.fullName, .email]
            request.nonce = Self.sha256(nonce)
        } onCompletion: { result in
            Task { await complete(result) }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 56)
        // Apple's button is at most 375 points wide; wider made it break
        // its own layout constraint.
        .frame(maxWidth: 375)
        .clipShape(Capsule())
        .frame(maxWidth: .infinity)
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
