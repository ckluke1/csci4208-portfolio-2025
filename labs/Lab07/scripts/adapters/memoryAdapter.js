// scripts/adapters/memoryAdapter.js
// Minimal in-memory adapter for Part 1 - Establish the DB contract without persistence.
import { seedDoc } from "../model.js";

export class MemoryAdapter {
  constructor({ stampOnSave = true } = {}) {
    this._doc = null;
    this._stampOnSave = stampOnSave;
  }

  // Standardize rev/updatedAt on successful writes
  _stamp(d) {
    d.rev = (d.rev ?? 0) + 1;
    d.updatedAt = new Date().toISOString();
  }

  // Load the AppDoc into memory (lazy seed on first call)
  async load() {
    if (!this._doc) {
      this._doc = seedDoc();
      if (this._stampOnSave) this._stamp(this._doc);
    }
    return this._doc;
  }

  // Save a new AppDoc into memory and stamp it
  async save(next) {
    if (this._stampOnSave) this._stamp(next);
    this._doc = next;
  }

  // Clear the cached document; next load() will reseed
  reset() {
    this._doc = null;
  }

  // Deep copy of the cached AppDoc for safe inspection
  snapshot() {
    return typeof structuredClone === "function"
      ? structuredClone(this._doc)
      : JSON.parse(JSON.stringify(this._doc));
  }
}

// Default instance used by tests/demos
export const memoryAdapter = new MemoryAdapter();
