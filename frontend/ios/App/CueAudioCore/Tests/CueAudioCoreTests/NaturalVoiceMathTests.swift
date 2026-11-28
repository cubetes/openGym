import XCTest
@testable import CueAudioCore

final class NaturalVoiceMathTests: XCTestCase {
    func testCacheKey() {
        let a = NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r1")
        XCTAssertEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r1"))
        XCTAssertEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.004, revision: "r1"))
        XCTAssertNotEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "bf", speed: 1.0, revision: "r1"))
        XCTAssertNotEqual(a, NaturalVoiceMath.cacheKey(text: "Set 3", voice: "af", speed: 1.0, revision: "r2"))
        XCTAssertEqual(a.count, 64)
    }

    func testSpeakable() {
        XCTAssertEqual(NaturalVoiceMath.speakable("92.5 kilos for 8"), "92 point 5 kilos for 8")
        XCTAssertEqual(NaturalVoiceMath.speakable("Set 3"), "Set 3")
    }

    func testUsableLengthAndGap() {
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 0, capacity: 120), 120)
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 50, capacity: 120), 50)
        XCTAssertEqual(NaturalVoiceMath.usableLength(reported: 121, capacity: 120), 120)
        XCTAssertEqual(NaturalVoiceMath.gapSamples(rate: 24000), 1920)
    }

    func testPrune() {
        let files = (0..<302).map { (name: "f\($0)", modified: Double(301 - $0)) }
        XCTAssertEqual(NaturalVoiceMath.prune(files, keep: 300), ["f301", "f300"])
        XCTAssertEqual(NaturalVoiceMath.prune(files, keep: 400), [])
    }

    func testShouldFallBack() {
        XCTAssertTrue(NaturalVoiceMath.shouldFallBack(waited: 2.1, hasAudio: false, failed: false))
        XCTAssertFalse(NaturalVoiceMath.shouldFallBack(waited: 1.0, hasAudio: false, failed: false))
        XCTAssertTrue(NaturalVoiceMath.shouldFallBack(waited: 0.1, hasAudio: false, failed: true))
        XCTAssertFalse(NaturalVoiceMath.shouldFallBack(waited: 3.0, hasAudio: true, failed: false))
    }

    func testIsCompleteCopy() {
        XCTAssertTrue(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10, "b": 20], found: ["a": 10, "b": 20, "c": 1]))
        XCTAssertFalse(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10, "b": 20], found: ["a": 10, "b": 19]))
        XCTAssertFalse(NaturalVoiceMath.isCompleteCopy(expected: ["a": 10], found: [:]))
    }

    // MARK: loudness

    private func wav(_ samples: [Int16], extraChunk: Bool = false) -> Data {
        var d = Data()
        func u32(_ v: Int) { var x = UInt32(v).littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: Int) { var x = UInt16(v).littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + samples.count * 2)
        d.append(contentsOf: Array("WAVEfmt ".utf8)); u32(16); u16(1); u16(1); u32(24000); u32(48000); u16(2); u16(16)
        if extraChunk { d.append(contentsOf: Array("LIST".utf8)); u32(5); d.append(contentsOf: [1, 2, 3, 4, 5, 0]) } // odd size is padded
        d.append(contentsOf: Array("data".utf8)); u32(samples.count * 2)
        for s in samples { u16(Int(UInt16(bitPattern: s))) }
        return d
    }

    private func sine(_ amp: Float, count: Int) -> [Float] {
        (0..<count).map { amp * sin(2 * .pi * 440 * Float($0) / 24000) }
    }

    func testPcm16SamplesFindsTheDataChunk() {
        let pcm: [Int16] = [0, 16384, -16384, 32767]
        for extra in [false, true] {
            let out = NaturalVoiceMath.pcm16Samples(wav: wav(pcm, extraChunk: extra))
            XCTAssertEqual(out.count, 4)
            XCTAssertEqual(out[1], 0.5, accuracy: 0.001)
            XCTAssertEqual(out[2], -0.5, accuracy: 0.001)
        }
        XCTAssertEqual(NaturalVoiceMath.pcm16Samples(wav: Data([1, 2, 3])), [])
        XCTAssertEqual(NaturalVoiceMath.pcm16Samples(wav: Data()), [])
    }

    func testLoudnessNormalises() {
        XCTAssertEqual(NaturalVoiceMath.loudness([], rate: 24000), [])
        // 0.1 s at 24 kHz = two 50 ms windows; a steady sine normalises to the 0.9 ceiling (amplitude 0.2: rms 0.14, gain 6.4, under the cap of 8).
        XCTAssertEqual(NaturalVoiceMath.loudness(sine(0.2, count: 2400), rate: 24000), [0.9, 0.9])
        let loudThenQuiet = sine(0.5, count: 1200) + sine(0.05, count: 1200)
        let l = NaturalVoiceMath.loudness(loudThenQuiet, rate: 24000)
        XCTAssertEqual(l.count, 2)
        XCTAssertEqual(l[0], 0.9)
        XCTAssertLessThan(l[1], 0.9)
        XCTAssertGreaterThan(l[1], 0)
        XCTAssertEqual(NaturalVoiceMath.loudness([Float](repeating: 0, count: 1200), rate: 24000), [0])
        // A last partial window still counts.
        XCTAssertEqual(NaturalVoiceMath.loudness(sine(0.2, count: 1500), rate: 24000).count, 2)
        // A very quiet voice is lifted at most 8x.
        let quiet = NaturalVoiceMath.loudness(sine(0.001, count: 1200), rate: 24000)
        XCTAssertLessThan(quiet[0], 0.9)
        XCTAssertGreaterThan(quiet[0], 0)
    }
}
