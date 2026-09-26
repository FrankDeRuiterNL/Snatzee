import Foundation

/// What a printed line on a paper scoresheet stands for.
///
/// Sheets differ in wording and language — "Enen" or "Aces", "Carré" or
/// "4 of a kind", "Topscore", "Yahtzee" or "Super score" — but they all
/// print the same lines in the same order. This maps whatever a sheet
/// prints onto Snatzee's own rows; the app itself keeps its own names.
enum SheetLine: Hashable, Sendable {
    /// One of the thirteen boxes, as an index into `ScoreSheet.rows`.
    case entry(Int)
    /// The six upper boxes added up ("Totaal aantal punten").
    case upperSubtotal
    /// 35 from 63 up.
    case bonus
    /// Subtotal plus bonus ("Totaal van de bovenste helft").
    case upperTotal
    /// The seven lower boxes added up.
    case lowerTotal
    /// The score ("Totaal generaal").
    case grandTotal
    /// Marks for every Yahtzee after the first, on sheets that have it.
    case yahtzeeBonus
}

enum SheetVocabulary {
    /// Lowercase, without accents, with anything that is not a letter or a
    /// digit turned into a single space: "TWEEËN" → "tweeen",
    /// "3 + 2 dezelfde" → "3 2 dezelfde".
    static func normalise(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "nl"))
        var out = ""
        var lastWasSpace = true
        for character in folded {
            if character.isLetter || character.isNumber {
                out.append(character)
                lastWasSpace = false
            } else if !lastWasSpace {
                out.append(" ")
                lastWasSpace = true
            }
        }
        return out.trimmingCharacters(in: .whitespaces)
    }

    /// The line a row's printed text describes, or nil when it names none.
    ///
    /// `text` is everything printed in the row's label area — the name and
    /// the hint beside it ("TEL ALLE ENEN", "25 PUNTEN", "Add total of all
    /// dice") — which is why the checks run from most to least specific:
    /// a hint like "totaal v.d. 5 stenen" must not turn "Three of a kind"
    /// into a total.
    static func line(for text: String) -> SheetLine? {
        let t = " " + normalise(text) + " "
        func has(_ words: String...) -> Bool { words.contains { t.contains(" \($0) ") } }
        func contains(_ fragments: String...) -> Bool { fragments.contains { t.contains($0) } }

        // Marks for extra Yahtzees, before the Yahtzee box itself.
        if contains("bonus"), contains("yahtz", "yardz", "per x", "per each", "each bonus", "for each") {
            return .yahtzeeBonus
        }

        // Lower boxes first: their hints mention totals and dice.
        if contains("three of a kind", "3 of a kind", "drie dezelfde", "3 dezelfde", "three of a") { return .entry(6) }
        if contains("carre", "four of a kind", "4 of a kind", "vier dezelfde", "4 dezelfde", "four of a") { return .entry(7) }
        if contains("full house", "fullhouse", "full h") { return .entry(8) }
        if contains("kleine straat", "small straight", "sm straight", "sm str", "kl straat", "low straight", "lo straight") { return .entry(9) }
        if contains("grote straat", "groote straat", "large straight", "lg straight", "lg str", "gr straat", "high straight", "hi straight") {
            return .entry(10)
        }
        if contains("topscore", "top score", "yahtzee", "yahtziend", "yardzee", "super score", "5 dezelfde", "5 of a kind") {
            return .entry(11)
        }
        if contains("chance", "change", "vrije keus") { return .entry(12) }

        // Upper boxes.
        // "tel alle 1-en" reads as "1 en".
        if has("enen", "aces", "ace", "ones", "1 en") { return .entry(0) }
        if has("tweeen", "twos", "2 en") { return .entry(1) }
        if has("drieen", "threes", "thress", "3 en") { return .entry(2) }
        if has("vieren", "fours", "4 en") { return .entry(3) }
        if has("vijven", "fives", "5 en") { return .entry(4) }
        if has("zessen", "sixes", "6 en") { return .entry(5) }

        if contains("bonus") { return .bonus }

        // Totals, told apart by what they add up.
        guard contains("totaal", "total", "subtotaal", "subtotal") else { return nil }
        if contains("generaal", "grand", "eindtotaal", "eind totaal") { return .grandTotal }
        if contains("onderste", "lower", "deel 2", "part 2", "sectie 2") { return .lowerTotal }
        if contains("bovenste", "upper", "deel 1", "part 1", "sectie 1") { return .upperTotal }
        if contains("aantal punten", "total score", "total points", "totaal punten") { return .upperSubtotal }
        // A bare "Totaal": which one depends on where it is, decided by
        // the layout from the lines around it.
        return nil
    }

    /// Whether a row's text is some kind of total without saying which.
    static func isBareTotal(_ text: String) -> Bool {
        let t = normalise(text)
        return line(for: text) == nil && (t.contains("totaal") || t.contains("total"))
    }

    /// The game number a column heading names: "1e spel", "SPEL 2",
    /// "Game #3", "#4", "5e", or nil for anything else.
    static func gameNumber(for text: String) -> Int? {
        let t = normalise(text.replacingOccurrences(of: "#", with: " # "))
        let tokens = t.split(separator: " ").map(String.init)
        guard !tokens.isEmpty, tokens.count <= 3 else { return nil }
        let words = Set(["spel", "game", "e", "ste", "de"])
        var number: Int?
        for token in tokens {
            if let n = Int(token), (1...12).contains(n) {
                guard number == nil else { return nil }
                number = n
            } else if token.count >= 2, let n = Int(token.dropLast()), token.last == "e", (1...12).contains(n) {
                guard number == nil else { return nil }
                number = n
            } else if !words.contains(token) {
                return nil
            }
        }
        // A bare number is only a heading when it says "spel"/"game" or
        // "1e" — the layout decides for plain digits in the header row.
        guard let number else { return nil }
        let explicit = text.contains("#") || tokens.contains { words.contains($0) || $0.hasSuffix("e") && Int($0.dropLast()) != nil }
        return explicit ? number : nil
    }
}
