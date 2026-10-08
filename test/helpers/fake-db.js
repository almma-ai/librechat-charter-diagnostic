/*
 * SECURITY REVIEW: loaded by the tests; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * In-memory stand-in for a database, used by tests. No network, files or
 * processes.
 */
'use strict';

/**
 * In-memory stand-in for the parts of a mongodb `Db` that lib/collect.js and
 * lib/admin.js use. Supports the query operators the collector sends
 * ($in, $ne, $exists) and returns documents as stored (projection ignored),
 * which is the stricter case: the collector must drop what it does not need.
 */

function matches(doc, query) {
  return Object.entries(query || {}).every(([k, cond]) => {
    const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), doc);
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond.toHexString || cond.hex)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.map(String).includes(String(v));
        if (op === '$ne') return arg === null ? v != null : String(v) !== String(arg);
        if (op === '$exists') return arg ? v !== undefined : v === undefined;
        throw new Error(`fake-db: unsupported operator ${op}`);
      });
    }
    return String(v) === String(cond);
  });
}

function cursor(docs) {
  return {
    toArray: async () => docs.map((d) => ({ ...d })),
    [Symbol.asyncIterator]: async function* it() {
      for (const d of docs) yield { ...d };
    },
  };
}

function fakeDb(data, name = 'LibreChat') {
  const reads = [];
  return {
    databaseName: name,
    reads,
    listCollections: () => ({ toArray: async () => Object.keys(data).map((n) => ({ name: n })) }),
    collection(n) {
      const all = () => data[n] || [];
      return {
        find: (q) => {
          reads.push(n);
          return cursor(all().filter((d) => matches(d, q)));
        },
        findOne: async (q) => all().find((d) => matches(d, q)) || null,
        countDocuments: async (q) => all().filter((d) => matches(d, q)).length,
        estimatedDocumentCount: async () => all().length,
        distinct: async (field) => [...new Set(all().map((d) => d[field]).filter((x) => x != null).map(String))],
      };
    },
  };
}

module.exports = { fakeDb };
