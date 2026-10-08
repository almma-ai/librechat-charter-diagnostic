#!/usr/bin/env node
'use strict';

/*
 * SECURITY REVIEW (for people and coding agents) ---------------------------
 * Run by reviewers and by scripts/security-check.sh. This comment is a claim,
 * not evidence: check each line against the code below. Procedure: AGENTS.md.
 *
 * Network      none.
 * Database     none (uses the in-memory stand-in in test/helpers/fake-db.js).
 * Writes       one file: the path given as the first argument.
 * Deletes      nothing.  Processes  none.  Dynamic code  none.
 * Env vars     none.
 * Loads        test/fixtures/seed-demo.js (data only; its database code is
 *              not called here), test/helpers/fake-db.js, lib/collect.js.
 * --------------------------------------------------------------------------
 */

/**
 * Writes a snapshot of the fictional demo deployment, in the same format as
 * scripts/export-snapshot.mongosh.js, without any database:
 *
 *   node test/fixtures/make-snapshot.js /tmp/demo-snapshot.json
 *   node bin/charter-diagnose.js --snapshot /tmp/demo-snapshot.json
 */

const fs = require('fs');
const { build } = require('./seed-demo');
const { fakeDb } = require('../helpers/fake-db');
const { collectFromDb } = require('../../lib/collect');

async function makeSnapshot() {
  const data = build();
  const snap = await collectFromDb(fakeDb(data), { dbName: 'CharterDemo' });
  const admin = data.users.find((u) => u.role === 'ADMIN');
  snap.source = 'demo-fixture';
  snap.exported_by = { id: String(admin._id), name: admin.name, role: admin.role };
  return snap;
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out) {
    process.stderr.write('Usage: node test/fixtures/make-snapshot.js <output.json>\n');
    process.exit(1);
  }
  makeSnapshot()
    .then((snap) => {
      fs.writeFileSync(out, `${JSON.stringify(snap)}\n`);
      process.stdout.write(`Wrote demo snapshot (${snap.agents.length} agents) to ${out}\n`);
    })
    .catch((e) => {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    });
}

module.exports = { makeSnapshot };
