import SwiftUI

/// The web app's `<Input>`: a rounded field on the canvas that lights up
/// mint while focused.
struct SnatzeeTextField: View {
    let placeholder: String
    @Binding var text: String
    var secure = false
    /// Text drawn inside the field before what is typed (the username's "@").
    var prefix: String?
    var trailing: AnyView?
    /// A Lucide icon before the text (the search field's magnifier).
    var leadingIcon: String?

    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 4) {
            if let leadingIcon {
                LucideIcon(leadingIcon, size: 20)
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.trailing, 6)
                    .accessibilityHidden(true)
            }
            if let prefix {
                Text(prefix).foregroundStyle(Theme.inkMuted)
            }
            Group {
                if secure {
                    SecureField("", text: $text, prompt: prompt)
                } else {
                    TextField("", text: $text, prompt: prompt)
                }
            }
            .focused($focused)
            .foregroundStyle(Theme.ink)
            .tint(Theme.mint500)
            if let trailing { trailing }
        }
        .font(.jakarta(TextSize.base))
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .background(
            focused ? Theme.surface : Theme.canvas,
            in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                .strokeBorder(focused ? Theme.mint500 : Theme.hairline, lineWidth: focused ? 2 : 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    private var prompt: Text {
        Text(placeholder).foregroundColor(Theme.inkMuted)
    }
}

/// `<Label>`: small semibold text above a field.
struct FieldLabel: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.jakarta(TextSize.sm, .semibold))
            .foregroundStyle(Theme.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
    }
}

/// `<FieldError>`: shown only when there is something to say.
struct FieldError: View {
    let message: String?

    var body: some View {
        if let message, !message.isEmpty {
            Text(message)
                .font(.jakarta(TextSize.sm, .medium))
                .foregroundStyle(Theme.roseEmber300)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
                .accessibilityAddTraits(.isStaticText)
        }
    }
}

/// `<Progress>`: a thin mint bar on a faint track.
struct ProgressBar: View {
    let value: Double
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.10))
                Capsule()
                    .fill(Theme.mint500)
                    .frame(width: proxy.size.width * min(1, max(0, value)))
                    .animation(.easeOut(duration: 0.5), value: value)
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityValue("\(Int(value * 100)) procent")
    }
}
