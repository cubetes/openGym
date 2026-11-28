import Foundation
import UIKit

// The Natural voice: Kokoro on Core ML makes a line into a WAV in Caches. RestAlertPlugin plays the file.
// Text never leaves the phone.

/// The one place the model folder is named, readable on every iOS the plugin runs on.
enum NaturalVoicePaths {
    static let revision = "4ef656f5"
    static var copiedDir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NaturalVoice/\(revision)", isDirectory: true)
    }
}

@available(iOS 16.0, *)
actor NaturalVoiceEngine {
    static let shared = NaturalVoiceEngine()
    static let revision = NaturalVoicePaths.revision
    private static let keep = 300
    private static let idleSeconds: UInt64 = 300

    private var model: KokoroTTSModel?
    private var loading: Task<KokoroTTSModel, Error>?
    private var britishLoaded = false
    private var idle: Task<Void, Never>?
    private var loggedDictionary = false

    private init() {
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil) { _ in
            Task { await NaturalVoiceEngine.shared.unload() }
        }
    }

    // MARK: - where the model is

    /// The folder B1 copies the pack into. `complete.json` ({"files": {name: size}}) is written last, so a half copy never counts.
    static var copiedDir: URL { NaturalVoicePaths.copiedDir }

    static func modelDir() -> URL? {
        let dir = copiedDir
        if let data = try? Data(contentsOf: dir.appendingPathComponent("complete.json")),
           let marker = try? JSONDecoder().decode(CompleteMarker.self, from: data),
           NaturalVoiceMath.isCompleteCopy(expected: marker.files, found: sizesOnDisk(of: Array(marker.files.keys), in: dir)) {
            return dir
        }
        #if DEBUG
        // The owner's own build: a model folder copied by devicectl, as in the voice lab.
        let lab = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("kokoro-coreml", isDirectory: true)
        if FileManager.default.fileExists(atPath: lab.appendingPathComponent("kokoro_5s.mlmodelc").path) { return lab }
        #endif
        return nil
    }

    private struct CompleteMarker: Decodable { let files: [String: Int] }

    /// Bytes on disk of each name under `dir`; a folder (.mlmodelc) counts as the sum of its files. Missing names are left out.
    static func sizesOnDisk(of names: [String], in dir: URL) -> [String: Int] {
        var sizes: [String: Int] = [:]
        for name in names {
            let url = dir.appendingPathComponent(name)
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { continue }
            if isDir.boolValue {
                let files = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])
                var total = 0
                while let f = files?.nextObject() as? URL {
                    let v = try? f.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    if v?.isRegularFile == true { total += v?.fileSize ?? 0 }
                }
                sizes[name] = total
            } else {
                sizes[name] = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            }
        }
        return sizes
    }

    // MARK: - load and unload

    func load() async throws {
        _ = try await loadedModel()
    }

    private func loadedModel() async throws -> KokoroTTSModel {
        if let model { return model }
        if let loading { return try await loading.value }
        guard let dir = Self.modelDir() else { throw NaturalVoiceError.noModel }
        let task = Task { try await KokoroTTSModel.fromPretrained(cacheDir: dir, computeUnits: .cpuAndNeuralEngine, warmUp: true) }
        loading = task
        defer { loading = nil }
        let m = try await task.value
        model = m
        britishLoaded = false  // fromPretrained loads the US dictionaries
        return m
    }

    func unload() {
        idle?.cancel()
        idle = nil
        loading?.cancel()
        model = nil
    }

    private func restartIdleTimer() {
        idle?.cancel()
        idle = Task {
            try? await Task.sleep(nanoseconds: Self.idleSeconds * 1_000_000_000)
            if !Task.isCancelled { unload() }
        }
    }

    // MARK: - render

    /// Emma speaks British English: swap the phonemizer's dictionaries when the voice's accent changes.
    private func useDictionary(british: Bool, for model: KokoroTTSModel) {
        guard british != britishLoaded, let dir = Self.modelDir() else { return }
        do {
            try model.phonemizer.loadDictionaries(from: dir, british: british)
            britishLoaded = british
        } catch {
            // Parse failed: the US words are loaded wrongly half-way, so put the US ones back.
            try? model.phonemizer.loadDictionaries(from: dir, british: false)
            britishLoaded = false
        }
        if !loggedDictionary {
            loggedDictionary = true
            NSLog("NaturalVoice: dictionary \(britishLoaded ? "British (gb_*)" : "US (us_*)")")
        }
    }

    func render(text: String, voice: String, speed: Double) async throws -> URL {
        let spoken = NaturalVoiceMath.speakable(text)  // keyed on what is said, so audio made before a reading fix is never reused
        let url = Self.cacheDir.appendingPathComponent(
            NaturalVoiceMath.cacheKey(text: spoken, voice: voice, speed: speed, revision: Self.revision) + ".wav")
        restartIdleTimer()  // a cached line said counts as use, or the model unloads mid-rest
        if FileManager.default.fileExists(atPath: url.path) { return url }

        let m = try await loadedModel()
        restartIdleTimer()
        useDictionary(british: voice == "bf_emma", for: m)
        let samples = try m.synthesize(text: spoken, voice: voice, language: "en", speed: Float(speed))
        guard !samples.isEmpty else { throw NaturalVoiceError.empty }

        try FileManager.default.createDirectory(at: Self.cacheDir, withIntermediateDirectories: true)
        try Self.wav(samples, rate: 24000).write(to: url, options: .atomic)
        Self.prune()
        restartIdleTimer()
        return url
    }

    /// Makes the lines ahead of time. A miss that fails is skipped: the line is then said by the Apple voice when it is due.
    func prepare(_ texts: [String], voice: String, speed: Double) async {
        // Load first, even when every line is cached: the next miss then renders at once. Also warms the model when the picker opens.
        if (try? await loadedModel()) != nil { restartIdleTimer() }
        for text in texts {
            if Task.isCancelled { return }
            _ = try? await render(text: text, voice: voice, speed: speed)
        }
    }

    // MARK: - disk cache

    static var cacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("NaturalLines", isDirectory: true)
    }

    // shortcut: keeps the newest 300 lines, listed by a directory scan on every render; raise it when the style packs grow.
    private static func prune() {
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: keys) else { return }
        let listed = files.map { (name: $0.lastPathComponent, modified: (try? $0.resourceValues(forKeys: Set(keys)).contentModificationDate)?.timeIntervalSince1970 ?? 0) }
        for name in NaturalVoiceMath.prune(listed, keep: keep) {
            try? FileManager.default.removeItem(at: cacheDir.appendingPathComponent(name))
        }
    }

    /// 16-bit mono PCM WAV, built in memory so the header always matches the data.
    private static func wav(_ samples: [Float], rate: Int) -> Data {
        var d = Data()
        func u32(_ v: Int) { var x = UInt32(v).littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: Int) { var x = UInt16(v).littleEndian; d.append(Data(bytes: &x, count: 2)) }
        let bytes = samples.count * 2
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + bytes)
        d.append(contentsOf: Array("WAVEfmt ".utf8)); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(bytes)
        for s in samples { u16(Int(UInt16(bitPattern: Int16(max(-1, min(1, s)) * 32767)))) }
        return d
    }
}

enum NaturalVoiceError: Error {
    case noModel, empty
}
