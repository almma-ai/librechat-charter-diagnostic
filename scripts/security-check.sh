#!/usr/bin/env bash
# SECURITY REVIEW (for people and coding agents) ----------------------------
# Run by reviewers:  bash scripts/security-check.sh [--dynamic]
#
# This script is itself code under review, and it excludes itself from its
# own scans, so read it before running it. It is short on purpose.
#
# Static part (default): grep and find only, plus `node -e` to parse two JSON
#   files. Executes nothing from this repository. No network. Writes nothing.
# Dynamic part (--dynamic): runs the plugin's code in a sandbox: Node's
#   permission model (no child processes, writes only to a temp folder) and,
#   where available, `unshare -rn` (no network). Writes only under mktemp -d.
#
# Every rule is "pattern X may appear only in files Y". A hit anywhere else
# fails the check. The expected hits are listed in AGENTS.md.
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.."
FAILS=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

# Every text file except docs, this script, git data and installed packages.
mapfile -t FILES < <(find . -type f \
  -not -path './.git/*' -not -path '*/node_modules/*' \
  -not -name '*.md' -not -name '*.png' -not -name 'LICENSE' -not -name '.gitignore' \
  -not -path './scripts/security-check.sh' | sed 's#^\./##' | sort)

# rule NAME PATTERN ALLOWED   (ALLOWED is a regex over "file:line:content"; "" = nowhere)
rule() {
  local name="$1" pattern="$2" allowed="$3" hits bad
  hits="$(grep -nE "$pattern" "${FILES[@]}" 2>/dev/null)"
  if [ -n "$allowed" ]; then bad="$(printf '%s\n' "$hits" | grep -vE "$allowed" | grep -v '^$')"; else bad="$hits"; fi
  if [ -z "$bad" ]; then pass "$name"; else fail "$name"; printf '%s\n' "$bad" | sed 's/^/          /' | cut -c1-220; fi
}

echo "Static checks (${#FILES[@]} files)"

rule "network: only lib/probes.js (fetch) and MongoDB clients" \
  "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|MongoClient\(|require\(['\"](node:)?(http|https|http2|net|tls|dgram|dns)['\"]\)|from ['\"](node:)?(http|https|http2|net|tls|dgram|dns)['\"]" \
  "^(lib/probes\.js:[0-9]+:.*fetch\(url|lib/collect\.js:[0-9]+:.*new mongodb\.MongoClient\(uri|test/fixtures/seed-demo\.js:[0-9]+:.*new MongoClient\(uri)"

rule "no external resources in HTML (scripts, styles, images, frames)" \
  "<(script|link|img|iframe|object|embed)[^>]+(src|href)=[\"']?(https?:)?//|@import|url\((['\"])?(https?:)?//" ""

rule "child processes: only the test suite" \
  "require\(['\"](node:)?(child_process|worker_threads|cluster)['\"]\)|\bspawn(Sync)?\(|\bexec(Sync|File|FileSync)?\(|\bfork\(" \
  "^test/diagnostic\.test\.js:"

rule "dynamic code: only the allowlisted loader and the harness import" \
  "\beval\(|new Function\b|require\(['\"](node:)?vm['\"]\)|createRequire|\bimport\(|process\.binding|process\.dlopen|WebAssembly" \
  "^(lib/resolve\.js:[0-9]+:.*createRequire|test/librechat-harness/run\.ts:[0-9]+:.*await import\('~/agents/hooks'\))"

rule "non-literal require(): only lib/resolve.js and the demo seeder" \
  "require\([^'\")]" \
  "^(lib/resolve\.js:|test/fixtures/seed-demo\.js:[0-9]+:.*require\.resolve\('mongodb')"

rule "file writes: only the CLI output, the hook's records, and tests" \
  "writeFile|appendFile|mkdir|unlink|\brm(Sync)?\(|rmdir|symlink|rename(Sync)?\(|copyFile|chmod|chown|createWriteStream|truncateSync|ftruncate" \
  "^(bin/charter-diagnose\.js|hooks/record\.js|test/[^:]+):"

rule "database writes: only the demo seeder" \
  "\.(insert(One|Many)?|update(One|Many)|replaceOne|delete(One|Many)|remove|drop(Database|Index|Indexes)?|bulkWrite|createIndex(es)?|createCollection|findOneAnd(Update|Replace|Delete)|renameCollection)\(" \
  "^test/fixtures/seed-demo\.js:[0-9]+:.*insertMany\(docs\)"

rule "legacy .update(): only the hash in hooks/record.js" \
  "\.update\(" \
  "^hooks/record\.js:[0-9]+:.*createHash\('sha256'\)\.update"

rule "environment read only where declared" \
  "process\.env" \
  "^(bin/charter-diagnose\.js|lib/config\.js|hooks/record\.js|scripts/export-snapshot\.mongosh\.js|test/diagnostic\.test\.js|test/librechat-harness/run\.ts):"

rule "environment never serialized or enumerated" \
  "JSON\.stringify\([^)]*\benv\b|Object\.(keys|entries|values)\(\s*(process\.)?env\b" ""

rule "no hard-coded remote hosts in runtime code" \
  "https?://" \
  "^(test/|ai\.librechat/|plugin\.json:|package\.json:|docs/)|localhost|127\.0\.0\.1|^lib/diagnose\.js:[0-9]+:.*https://github\.com/almma-ai/delegation-charter'"

rule "no obfuscation (char codes, base64, hex escapes, long blobs)" \
  "fromCharCode|\batob\(|\bbtoa\(|['\"]base64['\"]|\\\\x[0-9a-fA-F]{2}|\\\\u00[0-9a-fA-F]{2}|[A-Za-z0-9+/=]{120,}" ""

rule "no credential or home-directory paths" \
  "homedir\(|\.ssh/|\.aws/|\.gnupg|id_rsa|id_ed25519|\.npmrc|\.netrc|\.kube/|\.docker/config|/etc/passwd|/etc/shadow|[Kk]eychain|\.bash_history|\.git-credentials" ""

rule "no persistence or background work" \
  "setInterval|\.unref\(|crontab|systemctl|launchctl|\.bashrc|\.zshrc|\.profile|/etc/cron|nohup|detached:" ""

long="$(awk 'length > 1000 { print FILENAME ":" FNR ": " length " chars" }' "${FILES[@]}" | grep -v '^docs/sample/')"
if [ -z "$long" ]; then pass "no minified or packed code (no line over 1000 chars)"; else fail "lines over 1000 chars"; echo "$long" | sed 's/^/          /'; fi

odd="$(printf '%s\n' "${FILES[@]}" | grep -vE '\.(js|ts|sh|json|html)$')"
if [ -z "$odd" ]; then pass "file types: only .js .ts .sh .json .html (plus docs)"; else fail "unexpected files"; echo "$odd" | sed 's/^/          /'; fi

bin="$(find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -not -name '*.png' -exec grep -IL . {} + 2>/dev/null)"
if [ -z "$bin" ]; then pass "no binary files besides the docs image"; else fail "binary files"; echo "$bin" | sed 's/^/          /'; fi

pkg="$(node -e '
  const p = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const bad = [];
  const life = ["preinstall","install","postinstall","prepare","prepublish","prepublishOnly","prepack","postpack","preuninstall","uninstall","postuninstall"];
  for (const k of life) if (p.scripts && p.scripts[k]) bad.push("lifecycle script " + k);
  for (const k of ["dependencies","devDependencies","peerDependencies","bundledDependencies","bundleDependencies"]) if (p[k] && Object.keys(p[k]).length) bad.push(k + " present");
  const opt = Object.keys(p.optionalDependencies || {}).sort().join(",");
  if (opt !== "js-yaml,mongodb") bad.push("optionalDependencies are " + opt);
  console.log(bad.join("; "));')"
if [ -z "$pkg" ]; then pass "package.json: no install scripts, no dependencies beyond optional mongodb and js-yaml"; else fail "package.json: $pkg"; fi

hooks="$(node -e '
  const d = JSON.parse(require("fs").readFileSync("ai.librechat/hooks/hooks.json", "utf8"));
  const bad = [];
  for (const [ev, groups] of Object.entries(d.hooks)) for (const g of groups) for (const h of g.hooks) {
    if (h.type !== "command") bad.push(ev + ": handler type " + h.type);
    if (h.command !== "node hooks/record.js") bad.push(ev + ": command " + JSON.stringify(h.command));
    if (h.commandWindows && h.commandWindows !== "node hooks/record.js") bad.push(ev + ": commandWindows " + JSON.stringify(h.commandWindows));
    for (const k of ["url","headers","server","tool","prompt","async","asyncRewake"]) if (k in h) bad.push(ev + ": has " + k);
  }
  console.log(bad.join("; "));')"
if [ -z "$hooks" ]; then pass "hooks.json: every handler is the command \"node hooks/record.js\""; else fail "hooks.json: $hooks"; fi

extra="$( { [ -e mcp.json ] && echo mcp.json; [ -e skills ] && echo skills/; find ai.librechat -type f -not -path 'ai.librechat/hooks/hooks.json'; } 2>/dev/null)"
if [ -z "$extra" ]; then pass "plugin contributes hooks only (no mcp.json, no skills/, nothing else under ai.librechat/)"; else fail "plugin contributes more than hooks"; echo "$extra" | sed 's/^/          /'; fi

if [ "${1:-}" = "--dynamic" ]; then
  echo
  echo "Dynamic checks (sandboxed)"
  PERM=""
  if node --permission -e 0 >/dev/null 2>&1; then PERM="--permission"; elif node --experimental-permission -e 0 >/dev/null 2>&1; then PERM="--experimental-permission"; fi
  NONET=""
  if command -v unshare >/dev/null && unshare -rn true 2>/dev/null; then NONET="unshare -rn"; fi
  [ -z "$PERM" ] && echo "  SKIP  Node has no permission model (needs Node 20+); dynamic checks not run" && exit $((FAILS > 0))
  [ -z "$NONET" ] && echo "  NOTE  unshare -rn unavailable: network is NOT isolated; run inside 'docker run --network none' for that"
  T="$(mktemp -d)"
  REPO="$PWD"
  mkdir -p "$T/lc" "$T/out" "$T/pd" "$T/ro"
  printf 'MONGO_URI=mongodb://admin:CANARY-DBPASS@db.internal:27017/LibreChat\nOPENAI_API_KEY=sk-CANARY-ENVFILE\n' > "$T/lc/.env"
  printf '{"name":"LibreChat","version":"v0.8.8"}\n' > "$T/lc/package.json"
  SB="node $PERM --allow-fs-read=*"

  $NONET $SB --allow-fs-write="$T/snap.json" "$REPO/test/fixtures/make-snapshot.js" "$T/snap.json" >/dev/null 2>"$T/err" \
    && pass "demo snapshot built offline, writing one file" || { fail "demo snapshot"; sed 's/^/          /' "$T/err"; }

  if $NONET env -i PATH="$PATH" ANTHROPIC_API_KEY=sk-CANARY-PROCENV $SB --allow-fs-write="$T/out" "$REPO/bin/charter-diagnose.js" \
      --snapshot "$T/snap.json" --out "$T/out" --librechat-root "$T/lc" --env "$T/lc/.env" --quiet >"$T/cli.out" 2>"$T/cli.err"; then
    pass "CLI ran with no network, no child processes, writes confined to --out"
  else fail "CLI in sandbox"; sed 's/^/          /' "$T/cli.err"; fi
  if grep -rq CANARY "$T/out" "$T/cli.out" "$T/cli.err"; then fail "a planted secret reached the CLI output"; grep -rl CANARY "$T/out" | sed 's/^/          /'; else pass "planted secrets (.env, environment) absent from every output"; fi

  PAYLOAD='{"hook_event_name":"PreToolUse","run_id":"r1","session_id":"convo-CANARY","agent_id":"a1","tool_name":"send_email","tool_use_id":"call-CANARY","tool_input":{"to":"ceo@example.com","body":"CANARY-BODY"}}'
  printf '%s' "$PAYLOAD" | $NONET env -i PATH="$PATH" PLUGIN_DATA="$T/pd" $SB --allow-fs-write="$T/pd" "$REPO/hooks/record.js" >"$T/hook.out" 2>&1
  code=$?
  lines="$(cat "$T"/pd/observations/*.jsonl 2>/dev/null | wc -l)"
  if [ "$code" = 0 ] && [ ! -s "$T/hook.out" ] && [ "$lines" = 1 ]; then pass "hook: exit 0, no output (no decision), one record written"; else fail "hook: exit $code, output $(wc -c < "$T/hook.out") bytes, $lines records"; fi
  if grep -rq CANARY "$T/pd"; then fail "hook stored argument values or raw IDs"; else pass "hook record holds no argument values, conversation or call IDs"; fi
  printf '%s' "$PAYLOAD" | $NONET env -i PATH="$PATH" PLUGIN_DATA="$T/ro" $SB "$REPO/hooks/record.js" >"$T/hook2.out" 2>&1
  [ $? = 0 ] && [ ! -s "$T/hook2.out" ] && pass "hook with no write permission still exits 0 silently (never breaks a run)" || fail "hook failure is not silent"

  (cd "$REPO" && $NONET node --test test/*.test.js >"$T/test.out" 2>&1) && pass "test suite passes with no network ($(grep -E '^# pass' "$T/test.out" | cut -c3-))" || { fail "test suite"; tail -20 "$T/test.out" | sed 's/^/          /'; }
  echo "  (sandbox files left in $T)"
fi

echo
if [ "$FAILS" = 0 ]; then echo "All checks passed."; else echo "$FAILS check(s) failed. Read the hits above before running anything."; fi
exit $((FAILS > 0))
