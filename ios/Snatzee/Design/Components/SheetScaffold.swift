import SwiftUI

/// The web app's `<BottomSheet>`: a title and description, scrolling
/// content, and an optional footer button pinned to the bottom.
struct SheetScaffold<Content: View, Footer: View>: View {
    let title: String
    var description: String?
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.jakarta(TextSize.xl, .extrabold))
                        .trackingTight(TextSize.xl)
                        .foregroundStyle(Theme.ink)
                    if let description {
                        Text(description)
                            .font(.jakarta(TextSize.sm))
                            .foregroundStyle(Theme.inkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                content()
            }
            .padding(24)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .contentMargins(.bottom, 0, for: .scrollContent)
        .safeAreaInset(edge: .bottom) {
            let footer = footer()
            if !(footer is EmptyView) {
                footer
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Theme.canvasSoft)
            }
        }
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.canvasSoft)
        .presentationCornerRadius(Theme.Radius.xl2)
    }
}

extension SheetScaffold where Footer == EmptyView {
    init(title: String, description: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.init(title: title, description: description, content: content, footer: { EmptyView() })
    }
}

/// A multi-line text field styled like `<Textarea>`.
struct SnatzeeTextArea: View {
    let placeholder: String
    @Binding var text: String
    var limit = 200

    var body: some View {
        TextField("", text: Binding(get: { text }, set: { text = String($0.prefix(limit)) }),
                  prompt: Text(placeholder).foregroundColor(Theme.inkMuted), axis: .vertical)
            .lineLimit(3...5)
            .font(.jakarta(TextSize.base))
            .foregroundStyle(Theme.ink)
            .tint(Theme.mint500)
            .padding(12)
            .frame(minHeight: 96, alignment: .topLeading)
            .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
    }
}

/// "Label (optioneel)".
struct OptionalFieldLabel: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        HStack(spacing: 4) {
            Text(text).font(.jakarta(TextSize.sm, .semibold)).foregroundStyle(Theme.inkSoft)
            Text("(optioneel)").font(.jakarta(TextSize.sm)).foregroundStyle(Theme.inkMuted)
        }
        .padding(.bottom, 8)
    }
}
