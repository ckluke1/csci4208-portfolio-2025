// scripts/adapters/jsonBinAdapter.js
// Persistent adapter (JSONBin) - Same contract: load(), save(next), reset(), snapshot()
import { seedDoc } from "../model.js";

export class JsonBinAdapter {
  #binId;
  #root;
  #stampOnSave;
  #allowReset;

  constructor(
    {
      binId,
      root = "https://api.jsonbin.io/v3",
      stampOnSave = true,
      allowReset = false
    } = {}
  ) {
    if (!binId) throw new Error("JsonBinAdapter: 'binId' is required.");
    this.#binId = binId;
    this.#root = root.replace(/\/+$/, "");
    this.#stampOnSave = stampOnSave;
    this.#allowReset = allowReset;

    this.load = this.load.bind(this);
    this.save = this.save.bind(this);
    this.reset = this.reset.bind(this);
    this.snapshot = this.snapshot.bind(this);
  }

  #urlLatest() {
    return `${this.#root}/b/${this.#binId}/latest?meta=false`;
  }

  #urlBin() {
    return `${this.#root}/b/${this.#binId}`;
  }

  #stamp(d) {
    d.rev = (d.rev ?? 0) + 1;
    d.updatedAt = new Date().toISOString();
  }

  async #readLatest() {
    const res = await fetch(this.#urlLatest());
    if (!res.ok) throw new Error(`JSONBin read failed: ${res.status}`);
    return res.json();
  }

  async #write(next) {
    const res = await fetch(this.#urlBin(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    if (!res.ok) throw new Error(`JSONBin write failed: ${res.status}`);
  }

  // Load the latest document from the bin
  async load() {
    return await this.#readLatest();
  }

  // Save with optimistic concurrency: compare remote.rev vs next.rev
  async save(next) {
    // Fetch the freshest remote to avoid writing stale data
    const remote = await this.#readLatest();
    const rRev = remote?.rev ?? 0;
    const nRev = next?.rev ?? 0;
    if (rRev > nRev) {
      // Someone else wrote to the bin; caller should reload/merge
      throw new Error("Remote is newer; reload/merge before saving.");
    }
    if (this.#stampOnSave) this.#stamp(next);
    await this.#write(next);
  }

  // Overwrite the bin with a fresh seed (disabled by default)
  async reset() {
    if (!this.#allowReset) {
      throw new Error(
        "JsonBinAdapter.reset(): disabled. Enable with { allowReset:true }."
      );
    }
    const fresh = seedDoc();
    if (this.#stampOnSave) this.#stamp(fresh);
    await this.#write(fresh);
  }

  // Return a safe copy of the current remote doc (no mutation)
  async snapshot() {
    const doc = await this.#readLatest();
    // structuredClone may not exist in some older engines; JSON dance is fine too
    return typeof structuredClone === "function"
      ? structuredClone(doc)
      : JSON.parse(JSON.stringify(doc));
  }
}

// Convenience factory to keep backward-compatible usage: useAdapter(jsonBinAdapter(BIN_ID))
// You can still `new JsonBinAdapter({ binId: BIN_ID, ...opts })` if preferred.
export function jsonBinAdapter(binId, opts = {}) {
  return new JsonBinAdapter({ binId, ...opts });
}
