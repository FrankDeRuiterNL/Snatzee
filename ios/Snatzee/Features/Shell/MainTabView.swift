import SwiftUI

/// The signed-in app: one screen per tab, with the floating navigation
/// over the bottom of every one of them.
struct MainTabView: View {
    @State private var selection: AppTab = .home
    @State private var addingGame = false

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            ForEach(AppTab.allCases) { tab in
                // Every tab stays alive (and keeps its scroll position),
                // like switching tabs in a native tab bar.
                NavigationStack {
                    PlaceholderScreen(tab: tab)
                }
                .opacity(selection == tab ? 1 : 0)
                .allowsHitTesting(selection == tab)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomNavigation(selection: $selection) { addingGame = true }
        }
        .sheet(isPresented: $addingGame) {
            ComingSoonSheet()
                .presentationDetents([.medium])
                .presentationBackground(Theme.canvasSoft)
                .presentationCornerRadius(Theme.Radius.xl2)
        }
    }
}

/// Stand-in screens until the features arrive in steps 2 and 3.
private struct PlaceholderScreen: View {
    let tab: AppTab

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if tab == .home {
                    HStack {
                        LogoLockup()
                        Spacer()
                    }
                    .padding(.horizontal, Theme.gutter)
                    .padding(.top, 12)
                } else {
                    PageHeader(title: tab.label, subtitle: "Komt in de volgende stap")
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Snatzee! voor iOS")
                        .font(.jakarta(TextSize.xl, .black))
                        .trackingTight(TextSize.xl)
                        .foregroundStyle(.white)
                    Text("Stap 1: de basis staat — kleuren, lettertype, iconen, geluid en navigatie zijn dezelfde als op de website. Inloggen en je scores volgen in de volgende stappen.")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Speel het audio-logo") { SoundPlayer.shared.play(.logo) }
                        .buttonStyle(.snatzee(.primary, full: true))
                        .padding(.top, 4)
                }
                .padding(24)
                .card(.elevated, radius: Theme.Radius.xl2)
                .padding(.horizontal, Theme.gutter)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Theme.canvas)
        .toolbar(.hidden, for: .navigationBar)
    }
}

private struct ComingSoonSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            Text("Potje toevoegen")
                .font(.jakarta(TextSize.xl, .extrabold))
                .foregroundStyle(Theme.ink)
            Text("Het scoreblad komt in stap 3.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkSoft)
            Button("Sluiten") { dismiss() }
                .buttonStyle(.snatzee(.soft, full: true))
        }
        .padding(24)
    }
}

#Preview {
    MainTabView()
}
