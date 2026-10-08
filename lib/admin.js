/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Database reads only, through the connection it is given: users.findOne by the
 * --admin email (returns _id, name, role) and agentapikeys.find (userId and
 * keyPrefix; never keyHash). No network of its own, no files, no processes.
 */
'use strict';

/**
 * Admin-only gate. The diagnosis reads every agent's instructions, sharing and
 * usage, so it runs only for a LibreChat user whose role is ADMIN
 * (SystemRoles.ADMIN in librechat-data-provider). The check happens before
 * anything else is read.
 *
 * Be clear about what this protects: anyone holding the database credentials
 * can already read all of this. The gate makes the run attributable to a
 * named admin and stops the tool being used casually by someone who is not
 * one; database and server access remain the real boundary.
 */

const ADMIN_ROLE = 'ADMIN';

class NotAdminError extends Error {}

function describe(user) {
  return { id: String(user._id), name: user.name || user.username || null, role: user.role || null };
}

/** @param {object} db  a connected mongodb Db */
async function verifyAdminInDb(db, who, { ObjectId } = {}) {
  if (!who) {
    throw new NotAdminError('Only LibreChat admins can run this. Pass --admin <your LibreChat email> (or set CHARTER_DIAG_ADMIN).');
  }
  const query = ObjectId && /^[a-f0-9]{24}$/i.test(who) ? { _id: new ObjectId(who) } : { email: String(who).toLowerCase().trim() };
  const user = await db.collection('users').findOne(query, { projection: { _id: 1, name: 1, username: 1, role: 1 } });
  if (!user) throw new NotAdminError(`No LibreChat user matches "${who}".`);
  if (user.role !== ADMIN_ROLE) {
    throw new NotAdminError(`${user.name || 'That user'} has role "${user.role || 'USER'}". Only users with the ${ADMIN_ROLE} role can run the charter diagnosis.`);
  }
  return describe(user);
}

/**
 * Live probes send messages with an Agent API key. The key must belong to an
 * ADMIN, and to the same admin who ran the diagnosis. Keys are matched by
 * their stored prefix; the key hash is never read.
 */
async function verifyApiKeyOwner(db, apiKey, admin) {
  const keys = await db.collection('agentapikeys').find({}, { projection: { _id: 0, userId: 1, keyPrefix: 1 } }).toArray();
  const match = keys.filter((k) => k.keyPrefix && String(apiKey).startsWith(k.keyPrefix)).sort((a, b) => b.keyPrefix.length - a.keyPrefix.length)[0];
  if (!match) throw new NotAdminError('The API key does not match any Agent API key in this deployment.');
  if (String(match.userId) !== admin.id) {
    throw new NotAdminError('The API key belongs to a different user. Use an Agent API key created by the admin running the diagnosis.');
  }
}

function verifySnapshotAdmin(snap) {
  const by = snap.exported_by;
  if (!by || by.role !== ADMIN_ROLE) {
    throw new NotAdminError('This snapshot was not exported by a LibreChat admin. Re-export it with scripts/export-snapshot.mongosh.js and ADMIN_EMAIL set to an admin account.');
  }
  return by;
}

module.exports = { ADMIN_ROLE, NotAdminError, verifyAdminInDb, verifyApiKeyOwner, verifySnapshotAdmin };
