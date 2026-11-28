import Foundation
import CryptoKit

/// Natural voice: the pure rules (cache key, decimals, cache trimming, fall-back, chunk joins).
public enum NaturalVoiceMath {
    /// Same text, voice, rounded speed and model revision give the same file name.
    public static func cacheKey(text: String, voice: String, speed: Double, revision: String) -> String {
        let raw = [text, voice, String(format: "%.2f", speed), revision].joined(separator: "\u{1F}")
        return SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// "92.5" is read "92 point 5" so the voice does not say "ninety-two five".
    public static func speakable(_ text: String) -> String {
        text.replacingOccurrences(of: #"(\d+)\.(\d+)"#, with: "$1 point $2", options: .regularExpression)
    }

    /// The model's reported length when it is in 1...capacity, else the whole window (never cut speech on a bad value).
    public static func usableLength(reported: Int, capacity: Int) -> Int { (1...max(capacity, 1)).contains(reported) ? reported : capacity }

    /// Silence between two joined chunks.
    public static let gapMs = 80
    public static func gapSamples(rate: Int) -> Int { rate * gapMs / 1000 }

    /// Names to delete so only `keep` files remain, oldest first.
    public static func prune(_ files: [(name: String, modified: Double)], keep: Int) -> [String] {
        files.sorted { $0.modified < $1.modified }.prefix(max(files.count - keep, 0)).map { $0.name }
    }

    /// Longest wait for the natural voice before the system voice speaks instead.
    public static let fallBackSec = 2.0
    public static func shouldFallBack(waited: Double, hasAudio: Bool, failed: Bool) -> Bool {
        !hasAudio && (failed || waited >= fallBackSec)
    }

    /// A copied folder is usable only when every expected file is there at its full size.
    public static func isCompleteCopy(expected: [String: Int], found: [String: Int]) -> Bool {
        expected.allSatisfy { found[$0.key] == $0.value }
    }

    /// The samples of a 16-bit mono PCM WAV, -1...1. Walks the chunks to `data` (the header is not always 44 bytes); [] for anything unreadable.
    public static func pcm16Samples(wav: Data) -> [Float] {
        let b = [UInt8](wav)
        func u32(_ at: Int) -> Int { Int(b[at]) | Int(b[at + 1]) << 8 | Int(b[at + 2]) << 16 | Int(b[at + 3]) << 24 }
        guard b.count >= 12, b[0..<4].elementsEqual("RIFF".utf8), b[8..<12].elementsEqual("WAVE".utf8) else { return [] }
        var at = 12
        while at + 8 <= b.count {
            let size = u32(at + 4)
            if b[at..<at + 4].elementsEqual("data".utf8) {
                let end = min(at + 8 + size, b.count)
                return stride(from: at + 8, to: end - 1, by: 2).map { Float(Int16(bitPattern: UInt16(b[$0]) | UInt16(b[$0 + 1]) << 8)) / 32768 }
            }
            at += 8 + size + (size & 1) // chunks are padded to an even size
        }
        return []
    }

    /// RMS per window (the last partial one too), lifted so the loudest window sits at 0.9 (at most 8x), 2 decimals.
    public static func loudness(_ samples: [Float], rate: Int, windowMs: Int = 50) -> [Double] {
        let n = max(rate * windowMs / 1000, 1)
        let rms = stride(from: 0, to: samples.count, by: n).map { i -> Double in
            let w = samples[i..<min(i + n, samples.count)]
            return (w.reduce(0.0) { $0 + Double($1) * Double($1) } / Double(w.count)).squareRoot()
        }
        let peak = rms.max() ?? 0
        let gain = peak > 0 ? min(0.9 / peak, 8) : 0
        return rms.map { (min(1, $0 * gain) * 100).rounded() / 100 }
    }
}
