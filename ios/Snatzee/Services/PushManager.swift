import SwiftUI
import UIKit
import UserNotifications
import Observation
import Supabase

/// Push notifications through APNs.
///
/// The device token goes to the server with `register_apns_device` on
/// every launch — APNs may hand out a new one at any time — and is
/// removed with `unregister_apns_device` when notifications are switched
/// off or the player signs out. What gets sent is decided on the server,
/// exactly as for the website's Web Push.
@MainActor
@Observable
final class PushManager {
    static let shared = PushManager()

    enum Status { case unknown, off, on, denied }

    private(set) var status: Status = .unknown
    private(set) var token: String?
    /// A path from a tapped notification, for the app to open.
    var pendingPath: String?

    private var tokenWaiters: [CheckedContinuation<String?, Never>] = []

    /// At launch: follow what the system says, and keep the server's copy
    /// of the token current if notifications are on.
    func refresh() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            status = UserDefaults.standard.bool(forKey: Self.optOutKey) ? .off : .on
            if status == .on { UIApplication.shared.registerForRemoteNotifications() }
        case .denied: status = .denied
        default: status = .off
        }
    }

    /// Asks (the first time) and registers this device.
    func enable() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else {
            status = .denied
            return false
        }
        UserDefaults.standard.set(false, forKey: Self.optOutKey)
        guard let token = await registerAndWait() else { return false }
        do {
            try await send(token)
            status = .on
            return true
        } catch {
            return false
        }
    }

    /// Switches this device off, server-side as well.
    func disable() async {
        UserDefaults.standard.set(true, forKey: Self.optOutKey)
        if let token { try? await API.rpcVoid("unregister_apns_device", ["p_token": .string(token)]) }
        status = .off
    }

    /// On sign-out: this device should stop receiving the old account's news.
    func forget() async {
        if let token { try? await API.rpcVoid("unregister_apns_device", ["p_token": .string(token)]) }
    }

    // MARK: Token plumbing, called from the app delegate

    func didRegister(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        token = hex
        tokenWaiters.forEach { $0.resume(returning: hex) }
        tokenWaiters.removeAll()
        guard status == .on || status == .unknown else { return }
        Task { try? await send(hex) }
    }

    func didFail() {
        tokenWaiters.forEach { $0.resume(returning: nil) }
        tokenWaiters.removeAll()
    }

    private func registerAndWait() async -> String? {
        await withCheckedContinuation { continuation in
            tokenWaiters.append(continuation)
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    private func send(_ token: String) async throws {
        // A signed-out app has no account to attach the device to.
        guard SupabaseService.client?.auth.currentUser != nil else { return }
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        try await API.rpcVoid("register_apns_device", [
            "p_token": .string(token),
            "p_environment": .string(environment),
            "p_bundle_id": .string(Bundle.main.bundleIdentifier ?? "nl.snatzee.app"),
            "p_app_version": .string(AppConfig.versionString),
        ])
    }

    private static let optOutKey = "snatzee.push-opt-out"
}

/// Receives the device token and notification taps from UIKit.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushManager.shared.didRegister(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushManager.shared.didFail() }
    }

    /// Shown as a banner while the app is open, too.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// A tapped notification opens where its `url` points.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let path = response.notification.request.content.userInfo["url"] as? String
        await MainActor.run { PushManager.shared.pendingPath = path }
    }
}
