import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureRunManifest, MANIFEST } from "./manifest";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "eval-manifest-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const manifestPath = () => join(dir, MANIFEST);
const readManifest = () => JSON.parse(readFileSync(manifestPath(), "utf8")) as { fingerprint: unknown };

describe("ensureRunManifest", () => {
  it("crea el manifiesto completo cuando no existe y no deja temporales", () => {
    ensureRunManifest(dir, "aaaa");
    expect(readManifest().fingerprint).toBe("aaaa");
    expect(readdirSync(dir)).toEqual([MANIFEST]);
  });

  it("con la misma huella sigue sin tocar el manifiesto", () => {
    ensureRunManifest(dir, "aaaa");
    const before = readFileSync(manifestPath(), "utf8");
    expect(() => ensureRunManifest(dir, "aaaa")).not.toThrow();
    expect(readFileSync(manifestPath(), "utf8")).toBe(before);
    expect(readdirSync(dir)).toEqual([MANIFEST]);
  });

  it("con otra huella se niega y deja el manifiesto como estaba", () => {
    ensureRunManifest(dir, "aaaa");
    expect(() => ensureRunManifest(dir, "bbbb")).toThrow(/no sería comparable/);
    expect(readManifest().fingerprint).toBe("aaaa");
    expect(readdirSync(dir)).toEqual([MANIFEST]);
  });

  it("los temporales que dejó un corte no lo rompen ni se toman por el manifiesto", () => {
    const leftovers = [`.${MANIFEST}.999.dead.tmp`, `.${MANIFEST}.999.empty.tmp`];
    writeFileSync(join(dir, leftovers[0] ?? ""), "{\"fingerp");
    writeFileSync(join(dir, leftovers[1] ?? ""), "");
    ensureRunManifest(dir, "aaaa");
    expect(readManifest().fingerprint).toBe("aaaa");
    expect(readdirSync(dir).sort()).toEqual([...leftovers, MANIFEST].sort());
  });

  it("un manifiesto ilegible se rechaza, no se sobrescribe", () => {
    writeFileSync(manifestPath(), "{");
    expect(() => ensureRunManifest(dir, "aaaa")).toThrow(/No se puede leer/);
    expect(readFileSync(manifestPath(), "utf8")).toBe("{");
  });

  it("varias corridas a la vez con distinta huella: gana exactamente una y nunca se ve un manifiesto a medias", async () => {
    const fingerprints = Array.from({ length: 8 }, (_, index) => `huella-${index}-${"x".repeat(4000)}`);
    // [0] cuántos hilos están listos, [1] la señal de salida, [2] cuántos terminaron.
    const flags = new Int32Array(new SharedArrayBuffer(12));
    const source = `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const flags = new Int32Array(workerData.flags);
        try {
          const { ensureRunManifest } = await import(workerData.module);
          Atomics.add(flags, 0, 1);
          Atomics.wait(flags, 1, 0);
          try { ensureRunManifest(workerData.dir, workerData.fingerprint); parentPort.postMessage({ ok: true }); }
          catch (error) { parentPort.postMessage({ ok: false, message: String(error && error.message) }); }
        } catch (error) {
          parentPort.postMessage({ ok: false, message: "arranque: " + String(error && error.message) });
        } finally {
          Atomics.add(flags, 2, 1);
        }
      })();`;
    const module = new URL("./manifest.ts", import.meta.url).href;
    const workers = fingerprints.map(fingerprint => new Worker(source, { eval: true, workerData: { module, dir, fingerprint, flags: flags.buffer } }));
    const results = workers.map(worker => new Promise<{ ok: boolean; message?: string }>((done, fail) => {
      worker.once("message", done);
      worker.once("error", fail);
    }));
    try {
      const deadline = Date.now() + 20_000;
      while (Atomics.load(flags, 0) + Atomics.load(flags, 2) < workers.length && Date.now() < deadline) await new Promise(done => setTimeout(done, 1));
      Atomics.store(flags, 1, 1);
      Atomics.notify(flags, 1);
      // Mientras compiten, cualquier lectura del manifiesto tiene que encontrarlo entero.
      const torn: string[] = [];
      while (Atomics.load(flags, 2) < workers.length && Date.now() < deadline) {
        if (!existsSync(manifestPath())) continue;
        const text = readFileSync(manifestPath(), "utf8");
        try {
          if (!fingerprints.includes(String((JSON.parse(text) as { fingerprint?: unknown }).fingerprint))) torn.push(text.slice(0, 40));
        } catch {
          torn.push(text.slice(0, 40));
        }
      }
      const outcomes = await Promise.all(results);
      expect(outcomes.filter(outcome => outcome.message?.startsWith("arranque:"))).toEqual([]);
      expect(torn).toEqual([]);
      const winners = outcomes.flatMap((outcome, index) => (outcome.ok ? [index] : []));
      expect(winners).toHaveLength(1);
      expect(outcomes.filter(outcome => !outcome.ok).every(outcome => /no sería comparable/.test(outcome.message ?? ""))).toBe(true);
      expect(readManifest().fingerprint).toBe(fingerprints[winners[0] ?? -1]);
      expect(readdirSync(dir)).toEqual([MANIFEST]);
    } finally {
      await Promise.all(workers.map(worker => worker.terminate()));
    }
  });
});
