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
    /// True while `state` holds the offline copy of the profile.
    private var loadedFromCache = false

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
        do {
            await apply(try await client.auth.session)
        } catch let error where API.isOffline(error) {
            // Keep what is shown; the next reconnect tries again.
        } catch {
            await apply(nil)
        }
    }

    /// The profile came from the copy on this phone (offline at launch):
    /// read it from the server now that there is a connection again.
    func reloadIfOffline() async {
        guard loadedFromCache else { return }
        await reloadProfile()
    }

    func signOut() async {
        ProfileCache.clear()
        await PushManager.shared.forget()
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
            } catch let error where API.isOffline(error) {
                // No connection to renew it: carry on with the profile
                // from last time; it is renewed once back online.
                if !useCachedProfile(for: session.user.id) { state = .signedOut }
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
            ProfileCache.store(profile)
            loadedFromCache = false
            state = profile.onboardingCompleted ? .ready(profile) : .onboarding(profile)
        } catch {
            // Offline at launch with a stored session: open the app with the
            // profile from last time rather than the welcome screen.
            if API.isOffline(error), useCachedProfile(for: session.user.id) { return }
            if state == .loading { state = .signedOut }
        }
    }

    /// Opens the app with the stored profile, if it is this player's.
    private func useCachedProfile(for userId: UUID) -> Bool {
        if case .ready = state { return true }
        guard let cached = ProfileCache.load(), cached.id == userId else { return false }
        loadedFromCache = true
        state = cached.onboardingCompleted ? .ready(cached) : .onboarding(cached)
        return true
    }

    /// Compares this build with `min_ios_build` from the server.
    private func isBuildTooOld() async -> Bool {
        guard let config = try? await API.rpc("get_client_config", as: ClientConfig.self),
              let minimum = config.setting("min_ios_build")
        else { return false }
        return AppConfig.buildNumber < minimum
    }
}

/// The signed-in player's profile, kept on the phone so the app can open
/// without a connection.
enum ProfileCache {
    private static let key = "snatzee.profile"

    static func store(_ profile: Profile) {
        if let data = try? JSONEncoder().encode(profile) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func load() -> Profile? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(Profile.self, from: $0) }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
