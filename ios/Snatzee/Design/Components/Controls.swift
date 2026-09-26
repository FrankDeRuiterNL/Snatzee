import SwiftUI

/// `<ToggleRow>`: label and description beside a mint switch.
struct ToggleRow: View {
    let label: String
    var description: String?
    @Binding var isOn: Bool
    var disabled = false

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { newValue in
            Haptics.play(.light)
            isOn = newValue
        })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.jakarta(TextSize.base15, .semibold))
                    .foregroundStyle(Theme.ink)
                if let description {
                    Text(description)
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.mint500)
        .disabled(disabled)
        .frame(minHeight: 56)
    }
}

/// `<Stepper>`: minus, a big number that pops when it changes, plus.
struct NumberStepper: View {
    let label: String
    @Binding var value: Int
    var range: ClosedRange<Int> = 0...99

    var body: some View {
        HStack {
            stepButton("minus", enabled: value > range.lowerBound, accessibility: "\(label) verlagen") { set(value - 1) }
            Spacer()
            Text("\(value)")
                .font(.jakarta(TextSize.xxxl, .black))
                .trackingTight(TextSize.xxxl)
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
                .contentTransition(.numericText(value: Double(value)))
                .accessibilityLabel("\(label): \(value)")
            Spacer()
            stepButton("plus", enabled: value < range.upperBound, accessibility: "\(label) verhogen") { set(value + 1) }
        }
        .padding(8)
        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 1)
        )
    }

    private func set(_ next: Int) {
        let clamped = min(range.upperBound, max(range.lowerBound, next))
        guard clamped != value else { return }
        Haptics.play(.light)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { value = clamped }
    }

    private func stepButton(_ icon: String, enabled: Bool, accessibility: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            LucideIcon(icon, size: 20)
                .foregroundStyle(Theme.ink)
                .frame(width: 48, height: 48)
                .background(Theme.surface, in: Circle())
                .overlay(Circle().strokeBorder(Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(.pressable)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .accessibilityLabel(accessibility)
    }
}

/// `<Segmented>`: pill tabs with a sliding elevated background.
struct Segmented<Value: Hashable>: View {
    let options: [(value: Value, label: String)]
    @Binding var selection: Value

    @Namespace private var indicator

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.value) { option in
                let active = option.value == selection
                Button {
                    Haptics.play(.light)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.jakarta(TextSize.sm, .semibold))
                        .lineLimit(1)
                        .foregroundStyle(active ? .white : Theme.inkSoft)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal, 8)
                        .background {
                            if active {
                                Capsule().fill(Theme.surfaceElevated)
                                    .matchedGeometryEffect(id: "segment", in: indicator)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.pressable)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Theme.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
    }
}

/// `<ChipScroller>`: a horizontal row of chips for more options than fit.
struct ChipScroller<Value: Hashable>: View {
    let options: [(value: Value, label: String)]
    @Binding var selection: Value

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(options, id: \.value) { option in
                    let active = option.value == selection
                    Button {
                        Haptics.play(.light)
                        withAnimation(.easeOut(duration: 0.15)) { selection = option.value }
                    } label: {
                        Text(option.label)
                            .font(.jakarta(TextSize.sm, .semibold))
                            .foregroundStyle(active ? Theme.navy950 : Theme.inkSoft)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 40)
                            .background(active ? Theme.mint500 : Theme.surface, in: Capsule())
                            .overlay(Capsule().strokeBorder(active ? .clear : Theme.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .accessibilityAddTraits(active ? .isSelected : [])
                }
            }
            .padding(.horizontal, Theme.gutter)
        }
        .scrollIndicators(.hidden)
    }
}

/// `RARITY_STYLES` from lib/constants.ts.
enum Rarity: String {
    case common = "COMMON", rare = "RARE", epic = "EPIC", legendary = "LEGENDARY"

    init(_ raw: String) { self = Rarity(rawValue: raw) ?? .common }

    var label: String {
        switch self {
        case .common: "Common"
        case .rare: "Rare"
        case .epic: "Epic"
        case .legendary: "Legendary"
        }
    }

    var ring: Color {
        switch self {
        case .common: Theme.hairline
        case .rare: Theme.aqua500.opacity(0.30)
        case .epic: Theme.grape500.opacity(0.30)
        case .legendary: Theme.tangerine500.opacity(0.30)
        }
    }

    var chipBackground: Color {
        switch self {
        case .common: .white.opacity(0.08)
        case .rare: Theme.aqua500.opacity(0.15)
        case .epic: Theme.grape500.opacity(0.15)
        case .legendary: Theme.tangerine500.opacity(0.15)
        }
    }

    var accent: Color {
        switch self {
        case .common: Theme.inkSoft
        case .rare: Theme.aqua300
        case .epic: Theme.grape300
        case .legendary: Theme.tangerine300
        }
    }

    /// The tile gradient, from the rarity's colour into the surface.
    var glow: [Color] {
        switch self {
        case .common: [.white.opacity(0.12), .white.opacity(0.05)]
        case .rare: [Theme.aqua500.opacity(0.20), Theme.surface]
        case .epic: [Theme.grape500.opacity(0.20), Theme.surface]
        case .legendary: [Theme.tangerine500.opacity(0.20), Theme.surface]
        }
    }
}
