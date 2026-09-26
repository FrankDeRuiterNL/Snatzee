import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import Vision

/// Reads a photographed paper scoresheet, on the phone.
///
/// The website's order of work, with Apple's tools where they help:
///
/// 1. `straighten`: for a picture from the photo library, find the sheet
///    and correct its perspective (Vision's document segmentation) — the
///    document camera has already done this for a scan.
/// 2. `locate`: find the playing grid on a small copy, crop the photo to
///    the grid alone, and find the grid again on that crop at full
///    detail. Every box is known by its place: block, row, column.
/// 3. Read what is written in each box (next step).
///
/// Nothing is stored or sent.
enum SheetScanner {
    /// The grid on the cropped photo, ready to be read.
    struct Located: @unchecked Sendable {
        /// The crop, prepared: flattened, level, black and white.
        let prepared: SheetImage.Prepared
        let grid: SheetGrid
        /// Where the crop was taken from the photo, or nil when the whole
        /// photo was used.
        let crop: CGRect?
    }

    /// Resolution of the first, locating pass: it only has to place the
    /// table to within a few pixels.
    private static let locateSize = 900
    /// Room around the boxes when cropping, as a fraction of the grid, so
    /// its border stays inside the crop.
    private static let margin = 0.05

    /// Finds the grid and crops to it. Nil when the photo holds no grid.
    static func locate(_ image: CGImage) -> Located? {
        if let overview = SheetImage.prepare(image, maxSide: locateSize),
           let found = SheetGrid.detect(in: overview.mask), let bounds = found.bounds {
            // The grid's corners, back in the photo: all four, because the
            // work image was levelled and a rotated rectangle's corners
            // are what bound it.
            let mx = Double(bounds.width) * margin, my = Double(bounds.height) * margin
            let corners = [
                overview.sourcePoint(x: Double(bounds.x0) - mx, y: Double(bounds.y0) - my),
                overview.sourcePoint(x: Double(bounds.x1) + mx, y: Double(bounds.y0) - my),
                overview.sourcePoint(x: Double(bounds.x0) - mx, y: Double(bounds.y1) + my),
                overview.sourcePoint(x: Double(bounds.x1) + mx, y: Double(bounds.y1) + my),
            ]
            let xs = corners.map(\.x), ys = corners.map(\.y)
            let rect = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
                .integral
                .intersection(CGRect(x: 0, y: 0, width: image.width, height: image.height))
            if !rect.isEmpty, let crop = image.cropping(to: rect),
               let prepared = SheetImage.prepare(crop), let grid = SheetGrid.detect(in: prepared.mask) {
                return Located(prepared: prepared, grid: grid, crop: rect)
            }
        }
        // No grid on the small copy, or not again on the crop: the whole
        // photo at full detail.
        guard let prepared = SheetImage.prepare(image), let grid = SheetGrid.detect(in: prepared.mask) else { return nil }
        return Located(prepared: prepared, grid: grid, crop: nil)
    }

    /// Finds the sheet in a photo and corrects its perspective; the photo
    /// as it was when no sheet-shaped outline is found.
    static func straighten(_ image: CGImage) -> CGImage {
        let request = VNDetectDocumentSegmentationRequest()
        let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
        guard (try? handler.perform([request])) != nil,
              let document = request.results?.first,
              document.confidence > 0.5 else { return image }
        // Too small to be the sheet: probably a detail on it.
        guard area([document.topLeft, document.topRight, document.bottomRight, document.bottomLeft]) > 0.25 else { return image }

        let size = CGSize(width: image.width, height: image.height)
        func point(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * size.width, y: p.y * size.height) }
        let filter = CIFilter.perspectiveCorrection()
        filter.inputImage = CIImage(cgImage: image)
        filter.topLeft = point(document.topLeft)
        filter.topRight = point(document.topRight)
        filter.bottomLeft = point(document.bottomLeft)
        filter.bottomRight = point(document.bottomRight)
        guard let output = filter.outputImage,
              let corrected = CIContext().createCGImage(output, from: output.extent) else { return image }
        return corrected
    }

    private static func area(_ points: [CGPoint]) -> CGFloat {
        var sum: CGFloat = 0
        for i in points.indices {
            let a = points[i], b = points[(i + 1) % points.count]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2
    }
}
