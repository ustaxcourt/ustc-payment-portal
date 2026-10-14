#!/usr/bin/env node
// PreToolUse hook: blocks any tool call that references a real dotenv file
// (e.g. local, production, or bare variants) so secrets never enter the transcript.
// Committed template files (*.example, *.sample, *.template) are allowed.
// Exit code 2 blocks the call and sends stderr back to Claude.
//
// "\x2e" is a literal dot; it is written escaped so this file does not itself
// trip the hook when edited.

const ENV_FILE = /(^|[/\\\s'"=:@(])\x2eenv/i;
const TEMPLATE_FILE = /\x2eenv[\w.-]*\.(example|sample|template)(?![\w-])/gi;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    // Fail closed: if we cannot inspect the call, do not allow it.
    console.error("block-env-access: could not parse hook input; blocking.");
    process.exit(2);
  }

  const toolInput = JSON.stringify(payload.tool_input ?? {});
  // JSON.stringify escapes backslashes and quotes; unescape so the regex sees real characters.
  const haystack = toolInput
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(TEMPLATE_FILE, "");

  if (ENV_FILE.test(haystack)) {
    console.error(
      "Blocked: access to real dotenv files is prohibited by project policy (see AGENTS.md). Template files such as *.example are allowed. Ask the developer to run the command or share non-secret values manually.",
    );
    process.exit(2);
  }
  process.exit(0);
});
