import SwiftUI

/// The signed-out start screen: the logo, and the three ways in.
///
/// Deliberately not the website's landing page — someone who just
/// installed the app has already been sold on it by the App Store, so this
/// is a clean front door rather than a pitch.
struct WelcomeView: View {
    @State private var path: [AuthMode] = []
    @State private var appleEnabled = false
    @State private var appleError: String?
    @State private var appeared = false

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                Spacer(minLength: 24)

                LogoStack(size: 112)
                    .background {
                        // A soft mint glow behind the mark.
                        Circle()
                            .fill(Theme.mint500.opacity(0.22))
                            .frame(width: 260, height: 260)
                            .blur(radius: 70)
                            .accessibilityHidden(true)
                    }
                    .scaleEffect(appeared ? 1 : 0.92)
                    .opacity(appeared ? 1 : 0)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Snatzee")

                Spacer(minLength: 24)
                Spacer(minLength: 24)

                VStack(spacing: 12) {
                    if appleEnabled {
                        AppleSignInButton { appleError = $0 }
                        FieldError(message: appleError)
                    }
                    Button("Gratis account maken") { path.append(.register) }
                        .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                    Button("Ik heb al een account") { path.append(.login) }
                        .buttonStyle(.snatzee(.soft, size: .lg, full: true))
                    ConsentNotice()
                        .padding(.top, 8)
                }
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 16)
                .animation(.easeOut(duration: 0.2), value: appleEnabled)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: AuthMode.self) { mode in
                AuthFormView(mode: mode)
            }
        }
        .task { appleEnabled = await AuthSettings.isAppleEnabled() }
        .onAppear {
            let calm = systemReduceMotion || Preferences.shared.reducedMotion
            withAnimation(calm ? nil : .spring(response: 0.6, dampingFraction: 0.85).delay(0.1)) {
                appeared = true
            }
        }
    }
}
