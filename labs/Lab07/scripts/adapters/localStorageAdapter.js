// scripts/adapters/localStorageAdapter.js
// Persistent adapter (LocalStorage) - Same contract: load(), save(next), reset(), snapshot()
import { seedDoc } from "../model.js";

export class LocalStorageAdapter {
  #key;
  #stampOnSave;

  constructor({ key = "mockdb:doc", stampOnSave = true } = {}) {
    this.#key = key;
    this.#stampOnSave = stampOnSave;

    // Bind methods so they’re safe to pass around
    this.load = this.load.bind(this);
    this.save = this.save.bind(this);
    this.reset = this.reset.bind(this);
    this.snapshot = this.snapshot.bind(this);
  }

  // Standardize revision/last-modified
  #stamp(d) {
    d.rev = (d.rev ?? 0) + 1;
    d.updatedAt = new Date().toISOString();
  }

  // Load from LocalStorage, seeding with seedDoc() on first use or corrupt JSON
  async load() {
    const raw = localStorage.getItem(this.#key);

    if (!raw) {
      const doc = seedDoc();
      if (this.#stampOnSave) this.#stamp(doc);
      localStorage.setItem(this.#key, JSON.stringify(doc));
      return doc;
    }

    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt JSON → reseed
      const doc = seedDoc();
      if (this.#stampOnSave) this.#stamp(doc);
      localStorage.setItem(this.#key, JSON.stringify(doc));
      return doc;
    }
  }

  // Save into LocalStorage (write-through)
  async save(next) {
    if (this.#stampOnSave) this.#stamp(next);
    localStorage.setItem(this.#key, JSON.stringify(next));
  }

  // Remove the stored doc; next load() reseeds
  reset() {
    localStorage.removeItem(this.#key);
  }

  // Deep copy of current stored doc (no mutation)
  snapshot() {
    const raw = localStorage.getItem(this.#key);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    return typeof structuredClone === "function"
      ? structuredClone(doc)
      : JSON.parse(JSON.stringify(doc));
  }
}

// Default instance (matches prior export style)
export const localStorageAdapter = new LocalStorageAdapter();
