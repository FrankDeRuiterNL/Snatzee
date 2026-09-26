import AVFoundation

/// The three audio cues, at the web app's volumes.
///
/// Ambient audio: it mixes with whatever else is playing and respects the
/// silent switch, the way a game's sound effects should. The on/off
/// preference is the same one the web app keeps (default on).
///
/// Everything audio happens on one background queue. Setting the session
/// category and `AVAudioPlayer.play()` — which activates the session
/// itself — both block until the audio daemon answers, and Xcode warns
/// (rightly) when that happens on the main thread.
final class SoundPlayer: @unchecked Sendable {
    enum Sound: String, CaseIterable {
        case logo, score, achievement

        var volume: Float {
            switch self {
            case .logo: 0.55
            case .achievement: 0.7
            case .score: 0.6
            }
        }
    }

    static let shared = SoundPlayer()
    static let preferenceKey = "snatzee.sound"

    private let queue = DispatchQueue(label: "nl.snatzee.audio", qos: .userInitiated)
    /// Only touched on `queue`.
    private var players: [Sound: AVAudioPlayer] = [:]

    private init() {
        queue.async {
            try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            for sound in Sound.allCases {
                guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "mp3"),
                      let player = try? AVAudioPlayer(contentsOf: url)
                else { continue }
                player.volume = sound.volume
                player.prepareToPlay()
                self.players[sound] = player
            }
        }
    }

    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: preferenceKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: preferenceKey) }
    }

    func play(_ sound: Sound) {
        guard Self.isEnabled else { return }
        // Queued after the loading above, so the audio logo at launch waits
        // for its player rather than being dropped.
        queue.async {
            guard let player = self.players[sound] else { return }
            player.currentTime = 0
            player.play()
        }
    }
}
