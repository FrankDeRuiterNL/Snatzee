import SwiftUI

/// The web app's burst of confetti: squares and dots in the brand colours
/// flying out from the centre and falling away.
struct ConfettiView: View {
    var pieces = 36

    @State private var fired = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let colors: [Color] = [
        Theme.mint500, Theme.tangerine500, Theme.grape500, Theme.aqua500, Theme.roseEmber500, Theme.navy900,
    ]

    private struct Bit: Identifiable {
        let id: Int
        let x: CGFloat
        let y: CGFloat
        let rotation: Double
        let delay: Double
        let duration: Double
        let color: Color
        let size: CGFloat
        let round: Bool
    }

    private let bits: [Bit]

    init(pieces: Int = 36) {
        self.pieces = pieces
        self.bits = (0..<pieces).map { index in
            Bit(
                id: index,
                x: .random(in: -160...160),
                y: .random(in: 240...460),
                rotation: .random(in: -360...360),
                delay: .random(in: 0...0.25),
                duration: .random(in: 1.5...2.4),
                color: Self.colors[index % Self.colors.count],
                size: .random(in: 6...13),
                round: Bool.random()
            )
        }
    }

    var body: some View {
        ZStack {
            if !reduceMotion {
                ForEach(bits) { bit in
                    Group {
                        if bit.round {
                            Circle().fill(bit.color)
                        } else {
                            RoundedRectangle(cornerRadius: 2).fill(bit.color)
                        }
                    }
                    .frame(width: bit.size, height: bit.size)
                    .rotationEffect(.degrees(fired ? bit.rotation : 0))
                    .offset(x: fired ? bit.x : 0, y: fired ? bit.y : 0)
                    .scaleEffect(fired ? 0.7 : 1)
                    .opacity(fired ? 0 : 1)
                    .animation(
                        .timingCurve(0.19, 1, 0.22, 1, duration: bit.duration).delay(bit.delay),
                        value: fired
                    )
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { fired = true }
    }
}
