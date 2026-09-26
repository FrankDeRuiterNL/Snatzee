import SwiftUI

/// The launch screen, continued.
///
/// iOS shows the system launch screen (the dice mark on the canvas) while
/// the app starts; this view takes over from that exact frame, brings in
/// the wordmark beneath the mark and plays the audio logo — at launch,
/// which a native app may do. The website has to wait for a tap before
/// it is allowed to make a sound; this does not.
struct SplashView: View {
    /// Called once the splash has had its moment.
    let onFinished: () -> Void

    @State private var revealed = false

    private let markSize: CGFloat = 146
    /// How long the whole lockup stays before the app appears.
    private let holdSeconds = 1.6

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            LogoStack(size: markSize)
                // The system launch screen centres the mark alone; start
                // there and settle into the centred lockup.
                .offset(y: revealed ? 0 : wordmarkShift)
                .environment(\.wordmarkOpacity, revealed ? 1 : 0)
        }
        .task {
            SoundPlayer.shared.play(.logo)
            withAnimation(.spring(response: 0.55, dampingFraction: 0.82)) {
                revealed = true
            }
            try? await Task.sleep(for: .seconds(holdSeconds))
            onFinished()
        }
    }

    /// Half the wordmark and gap below the mark: where the mark sits when
    /// it is centred on its own.
    private var wordmarkShift: CGFloat {
        let gap = markSize * 12 / 101
        let wordmarkLine = markSize * 28.08 / 101 * 1.25
        return (gap + wordmarkLine) / 2
    }
}

private struct WordmarkOpacityKey: EnvironmentKey {
    static let defaultValue: Double = 1
}

extension EnvironmentValues {
    /// Lets the splash fade the wordmark in without a second lockup view.
    var wordmarkOpacity: Double {
        get { self[WordmarkOpacityKey.self] }
        set { self[WordmarkOpacityKey.self] = newValue }
    }
}

#Preview {
    SplashView {}
}
