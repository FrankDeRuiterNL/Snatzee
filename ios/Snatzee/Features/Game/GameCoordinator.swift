import Foundation
import Observation
import Supabase

/// The app-wide "a game happened" flow — `QuickActionsProvider` on the web.
///
/// Opens the score sheet (new or editing), registers a first-roll Yahtzee,
/// and turns what the server answers into the right feedback: a toast, the
/// score or achievement sound, the record celebration and the queue of
/// unlocked achievements. `dataVersion` ticks after every change so any
/// screen showing games or statistics knows to reload.
@MainActor
@Observable
final class GameCoordinator {
    /// A score sheet to show: a new game, or an existing one to edit.
    struct SheetRequest: Identifiable {
        let id = UUID()
        let entry: ScoreEntry?
    }

    struct Celebration: Identifiable, Equatable {
        enum Variant { case record, firstRoll }
        let id = UUID()
        let variant: Variant
        let emoji: String
        let title: String
        let headline: String
        let detail: String?
    }

    var sheet: SheetRequest?
    private(set) var celebration: Celebration?
    private(set) var unlockQueue: [Achievement] = []
    private(set) var dataVersion = 0
    private(set) var recordingFirstRoll = false

    func addGame() { sheet = SheetRequest(entry: nil) }
    func edit(_ entry: ScoreEntry) { sheet = SheetRequest(entry: entry) }

    /// After the sheet saved: the same feedback as the website.
    func saved(_ result: RecordScoreResult, isEdit: Bool) {
        if !isEdit { SoundPlayer.shared.play(.score) }
        Haptics.play(.success)
        ToastCenter.shared.success(
            isEdit ? "Potje bijgewerkt ✓" : "Score opgeslagen ✓",
            description: "\(result.entry.score) punten\(result.entry.isWin ? " · gewonnen" : "")"
        )
        if !isEdit && result.isPersonalRecord == true {
            celebration = Celebration(
                variant: .record,
                emoji: "🏆",
                title: "Nieuw record",
                headline: "\(result.entry.score) punten!",
                detail: "Dit is je hoogste score ooit op Snatzee."
            )
        }
        queueUnlocks(result.unlocked ?? [])
        dataChanged()
    }

    func recordFirstRollYahtzee() async {
        guard !recordingFirstRoll else { return }
        recordingFirstRoll = true
        defer { recordingFirstRoll = false }
        do {
            let result = try await API.rpc(
                "record_yahtzee",
                ["p_event_type": .string("FIRST_ROLL")],
                as: RecordYahtzeeResult.self
            )
            Haptics.play(.warning)
            celebration = Celebration(
                variant: .firstRoll,
                emoji: "⚡",
                title: "No way!",
                headline: "YAHTZEE IN 1 WORP!",
                detail: "Dit was je \(result.firstRollYahtzeeCount)e ooit."
            )
            queueUnlocks(result.unlocked ?? [])
            dataChanged()
        } catch {
            ToastCenter.shared.error("Registreren is niet gelukt", description: API.translate(error).localizedDescription)
        }
    }

    func dismissCelebration() { celebration = nil }

    func advanceUnlocks() {
        guard !unlockQueue.isEmpty else { return }
        unlockQueue.removeFirst()
    }

    /// Something changed the player's games (saved, edited, deleted).
    func dataChanged() { dataVersion += 1 }

    private func queueUnlocks(_ unlocked: [Achievement]) {
        guard !unlocked.isEmpty else { return }
        SoundPlayer.shared.play(.achievement)
        unlockQueue.append(contentsOf: unlocked)
    }
}
