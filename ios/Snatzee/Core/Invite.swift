import Foundation

/// Group invite codes and the links their QR codes carry — src/lib/invite.ts.
///
/// The QR encodes a full website URL rather than the bare code, so the
/// phone's own camera app can open it too (a universal link into this app,
/// or the website without it). The in-app scanner accepts either shape.
enum Invite {
    /// The link a QR code points at.
    static func url(code: String) -> URL? {
        var components = URLComponents()
        components.scheme = AppConfig.apiURL?.scheme ?? "https"
        components.host = AppConfig.apiURL?.host ?? "www.snatzee.nl"
        components.port = AppConfig.apiURL?.port
        components.path = "/app/groups"
        components.queryItems = [URLQueryItem(name: "code", value: code)]
        return components.url
    }

    /// Turns whatever was scanned or typed into an invite code, or nil.
    static func parse(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        if text.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil {
            guard let code = URLComponents(string: text)?.queryItems?.first(where: { $0.name == "code" })?.value else {
                return nil
            }
            return normalise(code)
        }
        return normalise(text)
    }

    private static func normalise(_ value: String) -> String? {
        let code = value.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        return (4...16).contains(code.count) ? code : nil
    }
}
