import AVFoundation

/// The three audio cues, at the web app's volumes.
///
/// Ambient audio: it mixes with whatever else is playing and respects the
/// silent switch, the way a game's sound effects should. The on/off
/// preference is the same one the web app keeps (default on).
@MainActor
final class SoundPlayer {
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

    private var players: [Sound: AVAudioPlayer] = [:]

    private init() {
        // Session calls block until the audio daemon answers, so they stay
        // off the main thread. Setting the category once is all it takes:
        // AVAudioPlayer activates the session itself when it plays.
        DispatchQueue.global(qos: .userInitiated).async {
            try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        }
        for sound in Sound.allCases {
            guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "mp3"),
                  let player = try? AVAudioPlayer(contentsOf: url)
            else { continue }
            player.volume = sound.volume
            player.prepareToPlay()
            players[sound] = player
        }
    }

    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: preferenceKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: preferenceKey) }
    }

    func play(_ sound: Sound) {
        guard Self.isEnabled, let player = players[sound] else { return }
        player.currentTime = 0
        player.play()
    }
}
