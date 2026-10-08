/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Reads package.json files to find LibreChat. Loads only mongodb and js-yaml
 * (BORROWABLE below). No network, writes or processes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

/**
 * The diagnostic has no dependencies of its own. It borrows `mongodb` and
 * `js-yaml` from the LibreChat installation it sits in (both ship with every
 * LibreChat build), so dropping the folder into ./plugin is the whole install.
 * A local `npm install` in this folder also works for running it elsewhere.
 */
function candidateRoots(extra) {
  const roots = [];
  if (extra) roots.push(path.resolve(extra));
  roots.push(process.cwd());
  // plugin/<name>/lib → LibreChat root is three levels up
  roots.push(path.resolve(__dirname, '..', '..', '..'));
  roots.push(path.resolve(__dirname, '..'));
  roots.push('/app', '/app/api');
  return [...new Set(roots)];
}

/** The only packages this tool ever loads from outside its own folder. */
const BORROWABLE = new Set(['mongodb', 'js-yaml']);

function borrow(name, librechatRoot) {
  if (!BORROWABLE.has(name)) throw new Error(`Refusing to load "${name}": only ${[...BORROWABLE].join(' and ')} may be loaded.`);
  const tried = [];
  for (const root of candidateRoots(librechatRoot)) {
    for (const base of [root, path.join(root, 'api')]) {
      const anchor = path.join(base, 'package.json');
      if (!fs.existsSync(anchor)) continue;
      tried.push(base);
      try {
        return createRequire(anchor)(name);
      } catch {
        /* try next */
      }
    }
  }
  try {
    return require(name);
  } catch {
    const where = tried.length ? tried.join(', ') : 'no LibreChat root found';
    throw new Error(
      `Could not load "${name}". Run this from your LibreChat folder (searched: ${where}), pass --librechat-root, or run "npm install" in the diagnostic folder.`,
    );
  }
}

/** Finds the LibreChat root: the nearest folder with librechat.yaml or a LibreChat package.json. */
function findLibrechatRoot(explicit) {
  for (const root of candidateRoots(explicit)) {
    if (fs.existsSync(path.join(root, 'librechat.yaml'))) return root;
    const pkg = path.join(root, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, 'utf8')).name === 'LibreChat') return root;
      } catch {
        /* ignore */
      }
    }
  }
  return explicit ? path.resolve(explicit) : process.cwd();
}

module.exports = { borrow, findLibrechatRoot, BORROWABLE };
