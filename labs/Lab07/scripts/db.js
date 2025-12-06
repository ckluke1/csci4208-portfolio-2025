// scripts/db.js
// Core browser DB layer: adapter seam + CRUD + advanced operations.

let _adapter = null;
let _doc = null;

/* =========================
   ADAPTER / BOOT
   ========================= */

// choose storage engine
export function useAdapter(adapter) {
  _adapter = adapter;
}

// load the app document via the adapter and cache it
export async function boot() {
  if (!_adapter) throw new Error("No adapter set. Call useAdapter(...) first.");
  _doc = await _adapter.load();
  return _doc;
}

/* =========================
   UTILITIES
   ========================= */

// Unique ID for new entries
// (served over HTTP so crypto.randomUUID is available)
export const uid = () => crypto.randomUUID().slice(0, 8);

// get a safe copy of the cached doc
export function getDoc() {
  // Return a safe copy so callers can't mutate the cached doc directly
  return structuredClone(_doc);
}

/* =========================
   CREATE
   ========================= */

// insert a new record into collection `col`
export async function insertOne(col, data) {
  const d = getDoc();
  const rec = { id: uid(), ...data };
  d[col].push(rec);
  await _adapter.save(d);
  _doc = d;
  return rec;
}

/* =========================
   READ (basic)
   ========================= */

// read many
export function findMany(col, pred = () => true) {
  return getDoc()[col].filter(pred);
}

// read one
export function findOne(col, pred) {
  const rows = findMany(col, pred);
  return rows.length ? rows[0] : null;
}

/* =========================
   UPDATE
   ========================= */

// apply shallow patch; arrays are replaced
export async function updateOne(col, id, patch) {
  const d = getDoc();
  const arr = d[col];
  const idx = arr.findIndex(r => r.id === id);
  if (idx === -1) return 0;

  // Shallow patch; arrays are replaced
  arr[idx] = { ...arr[idx], ...patch };

  await _adapter.save(d);
  _doc = d;
  return 1;
}

/* =========================
   DELETE
   ========================= */

export async function deleteOne(col, id) {
  const d = getDoc();
  const arr = d[col];
  const before = arr.length;
  const next = arr.filter(r => r.id !== id);
  d[col] = next;

  const deleted = before - next.length;
  if (!deleted) return 0;

  await _adapter.save(d);
  _doc = d;
  return deleted; // 0 or 1 in normal usage
}

/* =================================
   Advanced CRUD Operations (Dev Cycle 2)
   ================================= */

/* =========================
   FILTER OBJECTS
   ========================= */

// very small filter interpreter (eq/neq/gt/gte/lt/lte/in/contains)
export function queryBy(row, filter = {}) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("$in" in v) return v.$in.includes(row[k]);
      if ("$gt" in v) return row[k] > v.$gt;
      if ("$gte" in v) return row[k] >= v.$gte;
      if ("$lt" in v) return row[k] < v.$lt;
      if ("$lte" in v) return row[k] <= v.$lte;
      if ("$ne" in v) return row[k] !== v.$ne;
      if ("$contains" in v) {
        return String(row[k] ?? "").includes(String(v.$contains));
      }
    }
    return row[k] === v;
  });
}

// findManyBy(col, filter) — array of matches
export function findManyBy(col, filter = {}) {
  return getDoc()[col].filter(r => queryBy(r, filter));
}

// findOneBy(col, filter) — first match or null
export function findOneBy(col, filter = {}) {
  return findManyBy(col, filter)[0] ?? null;
}

/* =========================
   FIND (filter + sort + paging + projection)
   ========================= */

/**
 * Combined query:
 *   find("todos", {
 *     filter: {...},                // same shape as findManyBy
 *     sortBy: "due",                // field name
 *     sortDir: "asc" | "desc",      // default "asc"
 *     skip: 0,                      // number of rows to skip
 *     limit: 10,                    // max rows
 *     project: ["id", "title", ...] // optional list of fields to keep
 *   })
 */
export function find(col, args = {}) {
  const {
    filter = {},
    sortBy,
    sortDir = "asc",
    skip = 0,
    limit,
    project
  } = args;

  // 1) filter
  let rows = findManyBy(col, filter);

  // 2) sort
  if (sortBy) {
    const dir = sortDir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }

  // 3) paging (skip/limit)
  let start = typeof skip === "number" && skip > 0 ? skip : 0;
  let end =
    typeof limit === "number" && limit >= 0
      ? start + limit
      : undefined;

  rows = rows.slice(start, end);

  // 4) projection
  if (Array.isArray(project) && project.length > 0) {
    rows = rows.map(row => {
      const out = {};
      for (const key of project) {
        if (key in row) out[key] = row[key];
      }
      return out;
    });
  }

  return rows;
}

/* =========================
   ADVANCED UPDATE OPS
   ========================= */

// Update using Mongo-style operators ($set, $addToSet, $pull)
export async function updateOneOps(col, id, ops = {}) {
  const row = findOne(col, r => r.id === id);
  if (!row) return 0;

  const patch = {};

  // $set: shallow scalar/object/array replacement
  if (ops.$set) Object.assign(patch, ops.$set);

  // $addToSet: add value(s) to array field(s) without duplicates
  if (ops.$addToSet) {
    for (const [k, v] of Object.entries(ops.$addToSet)) {
      const cur = Array.isArray(row[k]) ? row[k] : [];
      patch[k] = Array.from(
        new Set([...cur, ...(Array.isArray(v) ? v : [v])])
      );
    }
  }

  // $pull: remove a single value from array field(s)
  if (ops.$pull) {
    for (const [k, v] of Object.entries(ops.$pull)) {
      const cur = Array.isArray(row[k]) ? row[k] : [];
      patch[k] = cur.filter(x => x !== v);
    }
  }

  return updateOne(col, id, patch);
}

/* =========================
   UPSERT (create-or-update)
   ========================= */

export async function upsertOne(col, filter, data) {
  const existing = findOneBy(col, filter);
  if (existing) {
    // Update the found record, then re-read and return it
    await updateOne(col, existing.id, data);
    return findOne(col, r => r.id === existing.id);
  } else {
    // No match → insert and return the new record
    return insertOne(col, data);
  }
}

/* =========================
   BATCH (TRANSACT)
   ========================= */

export async function transact(mutatorFn) {
  const d = getDoc();
  // allow mutatorFn to change the working copy
  await mutatorFn(d);
  await _adapter.save(d); // single write-through; adapter stamps rev/updatedAt
  _doc = d;               // refresh cache
  return _doc;            // return the new canonical doc
}
