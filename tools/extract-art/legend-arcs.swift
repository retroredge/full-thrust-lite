// Run: swift tools/extract-art/legend-arcs.swift "Full Thrust Lite.pdf"  -- reads which of the six arc segments are white (can fire) on each weapon icon in the page-13 legend
import Foundation
import PDFKit
import CoreGraphics

let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
let page = doc.page(at: 12)!
let pageH = page.bounds(for: .mediaBox).height
let s = 8.0
let rect = CGRect(x: 752, y: 172, width: 50, height: 92)   // legend icon column: torpedo, class 3, class 2, class 1 rows
let w = Int(rect.width * s), h = Int(rect.height * s)
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: s, y: s); ctx.translateBy(x: -rect.minX, y: -(pageH - rect.maxY))
page.draw(with: .mediaBox, to: ctx)
func rgb(_ i: Int) -> (Int, Int, Int) { (Int(px[i * 4]), Int(px[i * 4 + 1]), Int(px[i * 4 + 2])) }
// icon pixels: white, black stroke, or the blue "cannot fire" fill
let on = (0..<(w * h)).map { i -> Bool in let (r, g, b) = rgb(i); return min(r, g, b) > 200 || max(r, g, b) < 70 || (b > 150 && r < 80) }
var label = [Int](repeating: -1, count: w * h)
var found: [(Double, Double, Double)] = []
for start in 0..<(w * h) where on[start] && label[start] < 0 {
    var stack = [start]; label[start] = 0
    var x0 = w, y0 = h, x1 = 0, y1 = 0
    while let i = stack.popLast() {
        let x = i % w, y = i / w
        x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
        for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] where nx >= 0 && ny >= 0 && nx < w && ny < h {
            let j = ny * w + nx; if on[j] && label[j] < 0 { label[j] = 0; stack.append(j) }
        }
    }
    let cw = Double(x1 - x0 + 1) / s, ch = Double(y1 - y0 + 1) / s
    if abs(cw - ch) < 1.5 && cw > 12 && cw < 17 { found.append((Double(x0 + x1 + 1) / 2, Double(y0 + y1 + 1) / 2, Double(x1 - x0 + 1) / 2)) }
}
found.sort { (Int($0.1) / 40, $0.0) < (Int($1.1) / 40, $1.0) }
let rows = ["Pulse Torpedo (2-arc)", "Class 3 Beam (3-arc)", "Class 2 Beam (5-arc)", "Class 1 Beam (5-arc)"]
for (n, (cx, cy, R)) in found.enumerated() {
    var white: [String] = [], blue: [String] = []
    for (k, name) in ["F", "FS", "AS", "A", "AP", "FP"].enumerated() {
        var nw = 0, nb = 0
        for da in stride(from: -15.0, through: 15.0, by: 3.0) { for rf in [0.74, 0.8, 0.86] {
            let ang = (Double(k) * 60 + da - 90) * .pi / 180
            let (r, g, b) = rgb(Int(cy + sin(ang) * R * rf) * w + Int(cx + cos(ang) * R * rf))
            if min(r, g, b) > 200 { nw += 1 } else if b > 150 && r < 80 { nb += 1 }
        } }
        if nw > nb { white.append(name) } else { blue.append(name) }
    }
    let row = n / 2 < rows.count ? rows[n / 2] : "?"
    print("\(row) \(n % 2 == 0 ? "left " : "right"): white(can fire)=\(white.joined(separator: ",")) blue(cannot)=\(blue.joined(separator: ","))")
}
