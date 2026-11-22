// Run: swift tools/extract-art/render-page.swift <pdf> <pageNumber(1-based)> <scale> <out.png> [x y w h in PDF points, origin top-left]
import Foundation
import PDFKit
import AppKit

let args = CommandLine.arguments
guard args.count >= 5 else {
    FileHandle.standardError.write("usage: render-page.swift <pdf> <page> <scale> <out.png> [x y w h]\n".data(using: .utf8)!)
    exit(1)
}
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
let page = doc.page(at: Int(args[2])! - 1)!
let scale = CGFloat(Double(args[3])!)
let box = page.bounds(for: .mediaBox)
let rot = page.rotation
// Page size as displayed (after rotation)
let dispW = (rot % 180 == 0) ? box.width : box.height
let dispH = (rot % 180 == 0) ? box.height : box.width
var crop = CGRect(x: 0, y: 0, width: dispW, height: dispH)
if args.count >= 9 {
    crop = CGRect(x: Double(args[5])!, y: Double(args[6])!, width: Double(args[7])!, height: Double(args[8])!)
}
let pw = Int((crop.width * scale).rounded()), ph = Int((crop.height * scale).rounded())
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: pw, height: ph))
ctx.interpolationQuality = .high
// Map display coords (top-left origin) to CG (bottom-left origin)
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: -crop.minX, y: -(dispH - crop.maxY))
// PDFPage.draw handles rotation for the display box
page.draw(with: .mediaBox, to: ctx)
let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[4]))
print("page \(args[2]) mediaBox=\(box) rotation=\(rot) display=\(dispW)x\(dispH) out=\(pw)x\(ph)")
