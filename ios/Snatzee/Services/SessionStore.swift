import Foundation
import Observation
import Supabase

/// Who is signed in, and what the app should show for it.
///
/// Follows supabase-swift's auth events, so signing in, signing out, a
/// refreshed token or a session restored from the Keychain at launch all
/// land here — and the profile decides between onboarding and the app,
/// exactly like the web app's layout does.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case signedOut
        case onboarding(Profile)
        case ready(Profile)
        /// This build is older than the server allows.
        case updateRequired
    }

    private(set) var state: State = .loading

    var profile: Profile? {
        switch state {
        case .onboarding(let profile), .ready(let profile): profile
        default: nil
        }
    }

    private var listener: Task<Void, Never>?

    func start() {
        guard listener == nil else { return }
        listener = Task { [weak self] in
            if await self?.isBuildTooOld() == true {
                self?.state = .updateRequired
                return
            }
            guard let client = SupabaseService.client else {
                self?.state = .signedOut
                return
            }
            for await (event, session) in client.auth.authStateChanges {
                await self?.apply(session, event: event)
            }
        }
    }

    /// Re-reads the profile, e.g. after onboarding or a profile edit.
    func reloadProfile() async {
        guard let client = SupabaseService.client else { return }
        await apply(try? await client.auth.session)
    }

    func signOut() async {
        try? await SupabaseService.client?.auth.signOut()
        state = .signedOut
    }

    private func apply(_ session: Session?, event: AuthChangeEvent? = nil) async {
        guard let session else {
            state = .signedOut
            return
        }
        if session.isExpired {
            // The stored session from the last launch, past its hour: renew
            // it rather than show the welcome screen. Success arrives as a
            // tokenRefreshed event with the fresh session; failure means the
            // player really has to sign in again.
            do {
                _ = try await SupabaseService.client?.auth.refreshSession()
            } catch {
                state = .signedOut
            }
            return
        }
        do {
            let profiles = try await API.rows(Profile.self) {
                $0.from("profiles").select().eq("id", value: session.user.id.uuidString).limit(1)
            }
            guard let profile = profiles.first else {
                // Signed in, but the profile trigger has not run (or the
                // account was deleted elsewhere): start over.
                await signOut()
                return
            }
            state = profile.onboardingCompleted ? .ready(profile) : .onboarding(profile)
        } catch {
            // Offline at launch with a stored session: keep whatever was
            // shown rather than throwing the player out.
            if state == .loading { state = .signedOut }
        }
    }

    /// Compares this build with `min_ios_build` from the server.
    private func isBuildTooOld() async -> Bool {
        guard let config = try? await API.rpc("get_client_config", as: ClientConfig.self),
              let minimum = config.setting("min_ios_build")
        else { return false }
        return AppConfig.buildNumber < minimum
    }
}
