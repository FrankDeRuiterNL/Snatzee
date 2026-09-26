import AVFoundation
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// `<InviteQrCode>`: dark modules on a white card — a dark code on the
/// dark canvas does not scan reliably.
struct InviteQRCode: View {
    let value: String
    var size: CGFloat = 232

    var body: some View {
        if let image = Self.render(value) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .frame(width: size, height: size)
                .padding(12)
                .background(.white, in: RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
                .snatzeeShadow(.lift)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("QR-code met uitnodigingslink")
        } else {
            Text("QR-code maken is niet gelukt. Gebruik de code hieronder.")
                .font(.jakarta(TextSize.sm))
                .foregroundStyle(Theme.inkMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(16)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.xxl, style: .continuous))
        }
    }

    static func render(_ value: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        // Medium recovery: survives a fingerprint or glare on the screen.
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }

        let colored = output.applyingFilter("CIFalseColor", parameters: [
            "inputColor0": CIColor(red: 7 / 255, green: 19 / 255, blue: 31 / 255),
            "inputColor1": CIColor(red: 1, green: 1, blue: 1),
        ])
        let scaled = colored.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

/// `<QrScanner>`: the camera, reporting the first QR code it reads.
struct QRScannerView: View {
    let onResult: (String) -> Void

    @State private var authorization = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        Group {
            switch authorization {
            case .authorized:
                CameraPreview(onResult: onResult)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .strokeBorder(Theme.mint500, lineWidth: 3)
                            .padding(40)
                    }
            case .notDetermined:
                ProgressView().tint(Theme.inkMuted)
                    .task {
                        _ = await AVCaptureDevice.requestAccess(for: .video)
                        authorization = AVCaptureDevice.authorizationStatus(for: .video)
                    }
            default:
                VStack(spacing: 12) {
                    Text("📷").font(.system(size: 30))
                    Text("Snatzee mag de camera niet gebruiken. Zet het aan in Instellingen, of vul de code in.")
                        .font(.jakarta(TextSize.sm))
                        .foregroundStyle(Theme.inkMuted)
                        .multilineTextAlignment(.center)
                    Button("Open Instellingen") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.snatzee(.soft, size: .sm))
                }
                .padding(24)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .background(Theme.navy950)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl2, style: .continuous))
    }
}

private struct CameraPreview: UIViewRepresentable {
    let onResult: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onResult: onResult) }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.videoGravity = .resizeAspectFill
        context.coordinator.start(on: view)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
        private let session = AVCaptureSession()
        private let queue = DispatchQueue(label: "nl.snatzee.camera")
        private let onResult: (String) -> Void
        private var delivered = false

        init(onResult: @escaping (String) -> Void) {
            self.onResult = onResult
        }

        func start(on view: PreviewView) {
            view.previewLayer.session = session
            queue.async { [self] in
                guard let device = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else { return }
                session.beginConfiguration()
                session.addInput(input)
                let output = AVCaptureMetadataOutput()
                if session.canAddOutput(output) {
                    session.addOutput(output)
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    output.metadataObjectTypes = [.qr]
                }
                session.commitConfiguration()
                // startRunning blocks; never on the main thread.
                session.startRunning()
            }
        }

        func stop() {
            queue.async { [session] in session.stopRunning() }
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                            from connection: AVCaptureConnection) {
            guard !delivered,
                  let code = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first?.stringValue
            else { return }
            delivered = true
            stop()
            // Delivered on the main queue (see setMetadataObjectsDelegate).
            let onResult = onResult
            MainActor.assumeIsolated {
                Haptics.play(.success)
                onResult(code)
            }
        }
    }
}
