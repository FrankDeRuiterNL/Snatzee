import SwiftUI
import Observation

/// Sonner-style toasts at the top of the screen, like the website's.
@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable, Equatable {
        enum Kind { case success, error, info }
        let id = UUID()
        let kind: Kind
        let title: String
        let description: String?
    }

    static let shared = ToastCenter()

    private(set) var current: Toast?
    private var dismissTask: Task<Void, Never>?

    func show(_ kind: Toast.Kind, _ title: String, description: String? = nil) {
        let toast = Toast(kind: kind, title: title, description: description)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { current = toast }
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(kind == .error ? 5 : 3.5))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { self?.current = nil }
        }
    }

    func success(_ title: String, description: String? = nil) { show(.success, title, description: description) }
    func error(_ title: String, description: String? = nil) { show(.error, title, description: description) }
    func info(_ title: String, description: String? = nil) { show(.info, title, description: description) }

    func dismiss() {
        withAnimation(.easeOut(duration: 0.2)) { current = nil }
    }
}

struct ToastOverlay: ViewModifier {
    @State private var center = ToastCenter.shared

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast = center.current {
                ToastView(toast: toast)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { center.dismiss() }
                    .id(toast.id)
            }
        }
    }
}

private struct ToastView: View {
    let toast: ToastCenter.Toast

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            LucideIcon(icon, size: 18)
                .foregroundStyle(tint)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title)
                    .font(.jakarta(TextSize.sm, .semibold))
                    .foregroundStyle(Theme.ink)
                if let description = toast.description {
                    Text(description)
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkSoft)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: 380)
        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                .strokeBorder(.white.opacity(0.10), lineWidth: 1)
        )
        .snatzeeShadow(.float)
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch toast.kind {
        case .success: "check"
        case .error: "triangle-alert"
        case .info: "info"
        }
    }

    private var tint: Color {
        switch toast.kind {
        case .success: Theme.mint400
        case .error: Theme.roseEmber300
        case .info: Theme.aqua300
        }
    }
}

extension View {
    func toasts() -> some View { modifier(ToastOverlay()) }
}
