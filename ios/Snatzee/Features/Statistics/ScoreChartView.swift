import Charts
import SwiftUI

/// `<ScoreChart>`: the last games as a line, with the all-time average as
/// a dashed reference — in Swift Charts.
struct ScoreChartView: View {
    /// Newest first, as they come from the server.
    let scores: [ScoreEntry]
    let average: Double?

    @State private var range = 25
    @State private var selectedIndex: Int?

    private struct Point: Identifiable {
        let index: Int
        let score: Int
        let label: String
        var id: Int { index }
    }

    private var points: [Point] {
        Array(scores.prefix(range).reversed()).enumerated().map { offset, entry in
            Point(index: offset + 1, score: entry.score, label: Formatting.playedAt(entry.playedAt))
        }
    }

    private var yDomain: ClosedRange<Double> {
        let values = points.map(\.score)
        let low = Double((values.min() ?? 0) - 20)
        let high = Double((values.max() ?? 100) + 20)
        return max(0, low)...high
    }

    var body: some View {
        if scores.count < 2 {
            Text("Vanaf twee geregistreerde potjes tekenen we hier je scoreontwikkeling.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(32)
                .card(.surface, radius: Theme.Radius.xl2)
        } else {
            VStack(spacing: 16) {
                ChipScroller(
                    options: [(value: 10, label: "Laatste 10"), (value: 25, label: "Laatste 25"), (value: 50, label: "Laatste 50"), (value: 100, label: "Laatste 100")],
                    selection: $range
                )
                .padding(.horizontal, -Theme.gutter)

                VStack(spacing: 8) {
                    chart.frame(height: 224)
                    if let average {
                        HStack(spacing: 6) {
                            Capsule().fill(Theme.grape500).frame(width: 16, height: 2)
                            Text("All-time gemiddelde: \(Formatting.number(average, decimals: average.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1))")
                        }
                        .font(.jakarta(TextSize.xs, .semibold))
                        .foregroundStyle(Theme.inkMuted)
                    }
                }
                .padding(16)
                .card(.surface, radius: Theme.Radius.xl2)
            }
        }
    }

    private var chart: some View {
        let data = points
        let selected = selectedIndex.flatMap { index in data.first { $0.index == index } }

        return Chart {
            if let average {
                RuleMark(y: .value("Gemiddelde", average))
                    .foregroundStyle(Theme.grape500)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
            }
            ForEach(data) { point in
                LineMark(x: .value("Potje", point.index), y: .value("Score", point.score))
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .foregroundStyle(Theme.mint500)
                PointMark(x: .value("Potje", point.index), y: .value("Score", point.score))
                    .symbolSize(point.index == selected?.index ? 110 : 28)
                    .foregroundStyle(point.index == selected?.index ? Theme.navy900 : Theme.mint500)
            }
            if let selected {
                RuleMark(x: .value("Potje", selected.index))
                    .foregroundStyle(Theme.mint500)
                    .lineStyle(StrokeStyle(lineWidth: 1.5))
                    .annotation(position: .top, overflowResolution: .init(x: .fit, y: .disabled)) {
                        VStack(spacing: 2) {
                            Text(selected.label).font(.jakarta(TextSize.xs, .semibold)).foregroundStyle(Theme.inkMuted)
                            Text("\(selected.score) punten").font(.jakarta(13, .semibold)).foregroundStyle(Theme.ink)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                        .snatzeeShadow(.soft)
                    }
            }
        }
        .chartYScale(domain: yDomain)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                AxisValueLabel().font(.jakarta(11, .semibold)).foregroundStyle(Theme.navy300)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 5)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [4, 4])).foregroundStyle(Theme.hairlineStrong)
                AxisValueLabel().font(.jakarta(11, .semibold)).foregroundStyle(Theme.navy300)
            }
        }
        .chartXSelection(value: $selectedIndex)
        .accessibilityLabel("Grafiek van je scoreontwikkeling")
    }
}
