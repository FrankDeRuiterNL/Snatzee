import Foundation

/// The web app's formatting helpers (`src/lib/utils.ts`), in Dutch and in
/// Dutch time — the same as the website renders on the server.
enum Formatting {
    static let timeZone = TimeZone(identifier: "Europe/Amsterdam")!
    static let locale = Locale(identifier: "nl_NL")

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = locale
        return calendar
    }

    /// "1.234" / "214,7"
    static func number(_ value: Double?, decimals: Int = 0) -> String {
        guard let value, value.isFinite else { return "—" }
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = decimals
        formatter.maximumFractionDigits = decimals
        return formatter.string(from: NSNumber(value: value)) ?? "—"
    }

    static func number(_ value: Int?) -> String {
        number(value.map(Double.init))
    }

    /// "+12" / "−3" style deltas; nil for no value.
    static func delta(_ value: Double?, decimals: Int = 0) -> String? {
        guard let value, value.isFinite else { return nil }
        return (value > 0 ? "+" : "") + number(value, decimals: decimals)
    }

    /// "Vandaag" / "Gisteren" / "dinsdag" / "17 september" / "17 september 2025"
    static func playedAt(_ date: Date, now: Date = Date()) -> String {
        let cal = calendar
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: date), to: cal.startOfDay(for: now)).day ?? 0

        if days == 0 { return "Vandaag" }
        if days == 1 { return "Gisteren" }

        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        if days > 0 && days < 7 {
            formatter.dateFormat = "EEEE"
        } else if cal.component(.year, from: date) == cal.component(.year, from: now) {
            formatter.dateFormat = "d MMMM"
        } else {
            formatter.dateFormat = "d MMMM y"
        }
        return formatter.string(from: date)
    }

    /// "00:30"
    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// Short, friendly first name for greetings.
    static func firstName(_ displayName: String?) -> String {
        guard let first = displayName?.split(whereSeparator: \.isWhitespace).first else { return "speler" }
        return String(first)
    }

    static func pluralize(_ count: Int, _ one: String, _ many: String) -> String {
        count == 1 ? one : many
    }
}
