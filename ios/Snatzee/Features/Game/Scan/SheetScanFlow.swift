import PhotosUI
import SwiftUI
import VisionKit

/// "Scoreblad scannen": photograph a filled-in paper sheet, pick the game,
/// and hand the thirteen boxes back to the score sheet to be checked.
///
/// Reading happens on the phone (see SheetScanner); nothing is stored or
/// sent. Nothing is saved from here either — the player always confirms
/// in the score sheet, with the boxes the reader doubted marked.
struct SheetScanFlow: View {
    let onRead: (SheetSolver.Result) -> Void

    @Environment(\.dismiss) private var dismiss

    private enum Step {
        case choose
        case reading(String)
        case pickColumn(SheetScanner.Scan)
        case failed(String)
    }

    @State private var step: Step = .choose
    @State private var cameraOpen = false
    @State private var photo: PhotosPickerItem?
    @State private var column: Int?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Theme.canvas.ignoresSafeArea()

            Group {
                switch step {
                case .choose: chooseView
                case .reading(let message): readingView(message)
                case .pickColumn(let scan): pickColumnView(scan)
                case .failed(let message): failedView(message)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)

            RoundIconButton(icon: "x", label: "Sluiten") { dismiss() }
                .padding(.trailing, Theme.gutter)
                .padding(.top, 8)
        }
        .animation(.easeOut(duration: 0.2), value: stepKey)
        .fullScreenCover(isPresented: $cameraOpen) {
            DocumentCamera { image in
                cameraOpen = false
                // The document camera has already found and straightened
                // the sheet.
                process(image, straighten: false)
            } onCancel: {
                cameraOpen = false
            }
            .ignoresSafeArea()
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            photo = nil
            Task { await load(item) }
        }
    }

    private var stepKey: Int {
        switch step {
        case .choose: 0
        case .reading: 1
        case .pickColumn: 2
        case .failed: 3
        }
    }

    // MARK: Steps

    private var chooseView: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 56)
            IconTile(icon: "scan-line", accent: .mint, size: 56, iconSize: 26)
            Text("Scoreblad scannen")
                .font(.jakarta(TextSize.xxxl, .black))
                .trackingTight(TextSize.xxxl)
                .foregroundStyle(Theme.ink)
                .padding(.top, 20)
            Text("Fotografeer je ingevulde scoreblad. Je controleert alles voordat het potje wordt opgeslagen.")
                .font(.jakarta(TextSize.base15))
                .lineSpacing(3)
                .foregroundStyle(Theme.inkSoft)
                .padding(.top, 8)

            VStack(alignment: .leading, spacing: 12) {
                tip("Leg het blad plat en fotografeer recht van boven.")
                tip("Zorg voor goed licht, zonder schaduw over de vakjes.")
                tip("Het hele blad in beeld, met de namen van de vakken.")
            }
            .padding(16)
            .card(.surface)
            .padding(.top, 28)

            Spacer()

            VStack(spacing: 12) {
                if VNDocumentCameraViewController.isSupported {
                    Button {
                        Haptics.play(.light)
                        cameraOpen = true
                    } label: {
                        HStack(spacing: 8) { LucideIcon("camera", size: 20); Text("Scan met de camera") }
                    }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                }
                PhotosPicker(selection: $photo, matching: .images) {
                    HStack(spacing: 8) { LucideIcon("images", size: 20); Text("Kies een foto") }
                }
                .buttonStyle(.snatzee(VNDocumentCameraViewController.isSupported ? .soft : .primary, size: .lg, full: true))
                Text("De foto wordt alleen op je telefoon gelezen en niet bewaard.")
                    .font(.jakarta(TextSize.xs))
                    .foregroundStyle(Theme.inkMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
            }
            .padding(.bottom, 12)
        }
    }

    private func tip(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            LucideIcon("check", size: 16)
                .foregroundStyle(Theme.mint400)
                .padding(.top, 2)
            Text(text)
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func readingView(_ message: String) -> some View {
        VStack(spacing: 20) {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.mint400)
            Text(message)
                .font(.jakarta(TextSize.base, .semibold))
                .foregroundStyle(Theme.inkSoft)
        }
    }

    private func pickColumnView(_ scan: SheetScanner.Scan) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 56)
            IconTile(icon: "dice-5", accent: .mint, size: 56, iconSize: 26)
            Text("Welk potje?")
                .font(.jakarta(TextSize.xxxl, .black))
                .trackingTight(TextSize.xxxl)
                .foregroundStyle(Theme.ink)
                .padding(.top, 20)
            Text("Er staan meerdere potjes op dit blad. Kies welke je wilt toevoegen.")
                .font(.jakarta(TextSize.base15))
                .foregroundStyle(Theme.inkSoft)
                .padding(.top, 8)

            let chosen = column ?? scan.filledColumns.last
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                ForEach(scan.filledColumns, id: \.self) { number in
                    let selected = number == chosen
                    Button {
                        Haptics.play(.light)
                        column = number
                    } label: {
                        VStack(spacing: 2) {
                            Text("\(number)e")
                                .font(.jakarta(TextSize.xl, .black))
                            Text("spel")
                                .font(.jakarta(TextSize.xs, .semibold))
                        }
                        .foregroundStyle(selected ? Theme.navy950 : Theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 72)
                        .background(selected ? Theme.mint500 : Theme.surface,
                                    in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous)
                            .strokeBorder(selected ? .clear : Theme.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel("\(number)e spel")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.top, 28)

            Spacer()

            Button("Dit potje lezen") {
                if let chosen { read(scan, column: chosen) }
            }
            .buttonStyle(.snatzee(.primary, size: .lg, full: true))
            .padding(.bottom, 12)
        }
    }

    private func failedView(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 56)
            IconTile(icon: "triangle-alert", accent: .tangerine, size: 56, iconSize: 26)
            Text("Dat lukte niet")
                .font(.jakarta(TextSize.xxxl, .black))
                .trackingTight(TextSize.xxxl)
                .foregroundStyle(Theme.ink)
                .padding(.top, 20)
            Text(message)
                .font(.jakarta(TextSize.base15))
                .lineSpacing(3)
                .foregroundStyle(Theme.inkSoft)
                .padding(.top, 8)
            Spacer()
            VStack(spacing: 12) {
                Button("Opnieuw proberen") { step = .choose }
                    .buttonStyle(.snatzee(.primary, size: .lg, full: true))
                Button("Zelf invullen") { dismiss() }
                    .buttonStyle(.snatzee(.soft, size: .lg, full: true))
            }
            .padding(.bottom, 12)
        }
    }

    // MARK: Work

    private func load(_ item: PhotosPickerItem) async {
        step = .reading("Foto openen…")
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            step = .failed(SheetScanner.ScanError.unreadableImage.localizedDescription)
            return
        }
        process(image, straighten: true)
    }

    private func process(_ image: UIImage, straighten: Bool) {
        step = .reading("Scoreblad lezen…")
        column = nil
        Task {
            let outcome: Result<SheetScanner.Scan, Error> = await Task.detached(priority: .userInitiated) {
                guard let upright = image.uprightCGImage() else { return .failure(SheetScanner.ScanError.unreadableImage) }
                let page = straighten ? SheetScanner.prepare(upright) : upright
                return Result { try SheetScanner.scan(page) }
            }.value

            switch outcome {
            case .success(let scan):
                if scan.filledColumns.count == 1, let only = scan.filledColumns.first {
                    read(scan, column: only)
                } else {
                    Haptics.play(.light)
                    step = .pickColumn(scan)
                }
            case .failure(let error):
                Haptics.play(.warning)
                step = .failed(error.localizedDescription)
            }
        }
    }

    private func read(_ scan: SheetScanner.Scan, column number: Int) {
        step = .reading("\(number)e spel lezen…")
        Task {
            let outcome: Result<SheetSolver.Result, Error> = await Task.detached(priority: .userInitiated) {
                Result { try SheetScanner.read(scan, column: number).result }
            }.value

            switch outcome {
            case .success(let result):
                Haptics.play(.success)
                onRead(result)
                dismiss()
            case .failure(let error):
                Haptics.play(.warning)
                step = .failed(error.localizedDescription)
            }
        }
    }
}

/// Apple's document camera (the one in Notes): finds the sheet's edges,
/// straightens it and evens out the light before we ever see it.
private struct DocumentCamera: UIViewControllerRepresentable {
    let onScan: (UIImage) -> Void
    let onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan, onCancel: onCancel) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onScan: (UIImage) -> Void
        let onCancel: () -> Void

        init(onScan: @escaping (UIImage) -> Void, onCancel: @escaping () -> Void) {
            self.onScan = onScan
            self.onCancel = onCancel
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFinishWith scan: VNDocumentCameraScan) {
            guard scan.pageCount > 0 else { onCancel(); return }
            // The last page taken is the one they meant.
            onScan(scan.imageOfPage(at: scan.pageCount - 1))
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            onCancel()
        }
    }
}

private extension UIImage {
    /// The pixels the right way up: photos from the library carry their
    /// rotation as a flag, which Vision would not see.
    func uprightCGImage() -> CGImage? {
        if imageOrientation == .up, let cgImage { return cgImage }
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
}
