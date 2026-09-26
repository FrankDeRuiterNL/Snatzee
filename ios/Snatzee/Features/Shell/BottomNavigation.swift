import SwiftUI

/// The web app's floating bottom navigation: four tabs around a raised
/// mint "add a game" button, on a blurred elevated bar.
struct BottomNavigation: View {
    @Binding var selection: AppTab
    var friendRequests = 0
    let onAdd: () -> Void

    @Namespace private var activeIndicator

    /// Room a scrolling screen leaves at its end for the bar (64pt bar,
    /// 12pt below it, and air above) — the web app's `pb-nav`.
    static let reservedHeight: CGFloat = 104

    /// Past this the badge would outgrow the icon it sits on.
    private let badgeMax = 9

    var body: some View {
        HStack(spacing: 0) {
            item(.home)
            item(.rankings)
            addButton
            item(.friends)
            item(.profile)
        }
        .padding(8)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                        .fill(Theme.surfaceElevated.opacity(0.9))
                )
        }
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous)
                .strokeBorder(Theme.hairlineStrong, lineWidth: 1)
        )
        .snatzeeShadow(.float)
        .frame(maxWidth: 416)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func item(_ tab: AppTab) -> some View {
        let active = selection == tab
        let badge = tab == .friends ? friendRequests : 0

        return Button {
            Haptics.play(.light)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { selection = tab }
        } label: {
            VStack(spacing: 2) {
                LucideIcon(tab.icon, size: 20)
                    .foregroundStyle(active ? Theme.mint400 : Theme.inkMuted)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text(badge > badgeMax ? "\(badgeMax)+" : "\(badge)")
                                .font(.jakarta(TextSize.xs10, .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 4)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(Theme.roseEmber500, in: Capsule())
                                .overlay(Capsule().strokeBorder(Theme.surfaceElevated, lineWidth: 2))
                                .offset(x: 8, y: -6)
                        }
                    }
                Text(tab.label)
                    .font(.jakarta(TextSize.xs10, .semibold))
                    .foregroundStyle(active ? .white : Theme.inkMuted)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .background {
                if active {
                    RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                        .fill(.white.opacity(0.10))
                        .matchedGeometryEffect(id: "active", in: activeIndicator)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(
            badge > 0
                ? "\(tab.label), \(badge) open \(badge == 1 ? "verzoek" : "verzoeken")"
                : tab.label
        )
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var addButton: some View {
        Button {
            Haptics.play(.medium)
            onAdd()
        } label: {
            LucideIcon("plus", size: 28)
                .foregroundStyle(Theme.navy950)
                .frame(width: 56, height: 56)
                .background(Theme.mint500, in: Circle())
                .overlay(Circle().strokeBorder(Theme.canvas, lineWidth: 4).padding(-4))
                .shadow(color: Theme.mint500.opacity(0.6), radius: 12, x: 0, y: 8)
        }
        .buttonStyle(.pressable)
        .offset(y: -16)
        .padding(.horizontal, 4)
        .accessibilityLabel("Potje toevoegen")
    }
}
