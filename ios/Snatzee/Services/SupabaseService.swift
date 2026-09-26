import Foundation
import Supabase

/// The one Supabase client, pointed at the server from AppConfig.
///
/// The session lives in the Keychain (supabase-swift's default), so a
/// signed-in player stays signed in across launches.
enum SupabaseService {
    static let client: SupabaseClient? = {
        guard let url = AppConfig.apiURL, let key = AppConfig.anonKey else { return nil }
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                // The stored session is emitted at launch as it is, expired
                // or not; SessionStore refreshes an expired one before
                // deciding anything (the upcoming default in supabase-swift).
                auth: SupabaseClientOptions.AuthOptions(emitLocalSessionAsInitialSession: true)
            )
        )
    }()
}
