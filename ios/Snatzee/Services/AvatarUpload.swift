import SwiftUI
import UIKit
import Supabase

/// Turns a photo into an avatar and uploads it — the same steps as
/// `src/lib/image.ts` on the web: a centred square, 384px (4× the largest
/// avatar on screen), re-encoded as JPEG, which also drops the location
/// data a phone photo carries.
enum AvatarUpload {
    static let targetSize: CGFloat = 384

    static func prepare(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let side = min(image.size.width, image.size.height)
        let crop = CGRect(
            x: (image.size.width - side) / 2,
            y: (image.size.height - side) / 2,
            width: side,
            height: side
        )
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: targetSize, height: targetSize), format: format)
        let square = renderer.image { _ in
            // Drawn so the crop fills the square; draw(in:) honours the
            // photo's orientation, which cgImage cropping would not.
            let scale = targetSize / side
            image.draw(in: CGRect(
                x: -crop.minX * scale,
                y: -crop.minY * scale,
                width: image.size.width * scale,
                height: image.size.height * scale
            ))
        }
        return square.jpegData(compressionQuality: 0.85)
    }

    /// Uploads to avatars/<user>/avatar-<ms>.jpeg and returns the public
    /// URL to store on the profile, on the same canonical host the website
    /// writes (not whichever address this device happened to use).
    static func upload(_ jpeg: Data, userId: UUID) async throws -> String {
        let folder = userId.uuidString.lowercased()
        let path = "\(folder)/avatar-\(Int(Date().timeIntervalSince1970 * 1000)).jpeg"
        do {
            _ = try await API.client().storage.from("avatars").upload(
                path,
                data: jpeg,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )
        } catch {
            throw API.translate(error)
        }
        guard let base = AppConfig.apiURL else { throw APIError.notConfigured }
        return base.appending(path: "storage/v1/object/public/avatars/\(path)").absoluteString
    }
}
