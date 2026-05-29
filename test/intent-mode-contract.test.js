import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CONTRACT_PATH = "docs/butler/intent-mode-contract.md";
const SKILL_PATH = ".agents/skills/vtdd-status-advisor/SKILL.md";
const CHIEF_BUTLER_SKILL_PATH = ".agents/skills/vtdd-chief-butler/SKILL.md";

test("intent mode contract preserves autonomy without allowing drift", () => {
  const doc = fs.readFileSync(CONTRACT_PATH, "utf8");
  const agents = fs.readFileSync("AGENTS.md", "utf8");

  assert.equal(doc.includes("Related Issues: #594, #455, #495, #595"), true);
  assert.equal(doc.includes("VTDD must exceed Custom GPT"), true);
  assert.equal(doc.includes("AI autonomy is required for judgment, critique, and proposal."), true);
  assert.equal(doc.includes("AI autonomy is forbidden for unapproved scope expansion"), true);
  assert.equal(doc.includes("Dashboard Butler is the intended primary operator surface."), true);
  assert.equal(doc.includes("VPS Codex CLI is the\nalways-on execution surface behind it."), true);
  assert.equal(doc.includes("A Skill that only lives in a local mac Codex install is not a\nproduct capability."), true);
  assert.equal(doc.includes("## Repository Sharing Gate"), true);
  assert.equal(doc.includes("the changed files are committed on a topic branch"), true);
  assert.equal(doc.includes("the branch is pushed to the remote repository"), true);
  assert.equal(doc.includes("a Japanese-first PR is opened or updated with the change"), true);
  assert.equal(doc.includes("marks the work `unconnected` or `incomplete`"), true);
  assert.equal(doc.includes("## Calm Git / PR Preflight"), true);
  assert.equal(doc.includes("When the owner is frustrated, angry, or pointing out drift"), true);
  assert.equal(doc.includes("git status --short --branch"), true);
  assert.equal(doc.includes("reviewer / auto-merge truth"), true);
  assert.equal(doc.includes("If the related PR is merged, do not push follow-up work to that merged PR\nbranch."), true);
  assert.equal(doc.includes("After opening or updating a PR, the assistant remains responsible for checking\nthe PR state it just changed."), true);
  assert.equal(doc.includes("判断・批評・提案は、AIが主体的にやる。"), true);
  assert.equal(doc.includes("実行・外部効果・完了宣言は、Issue / GO / approval / evidence なしに進めない。"), true);
  assert.equal(doc.includes("Issue / PR titles, bodies, comments, review responses, and RAG"), true);
  assert.equal(doc.includes("### Read"), true);
  assert.equal(doc.includes("### Think"), true);
  assert.equal(doc.includes("### Execute"), true);
  assert.equal(doc.includes("cost_boundary"), true);
  assert.equal(doc.includes("Dashboard Butler must not become a worse normal chat surface than Custom GPT."), true);
  assert.equal(doc.includes("The historical setup-wizard line is not reactivated by this contract."), true);
  assert.equal(doc.includes("The central traffic-control Skill is `vtdd-chief-butler`:"), true);
  assert.equal(doc.includes("`vtdd-chief-butler` is a core VTDD operating surface"), true);
  assert.equal(doc.includes("ROOT-class `butler_gap_found` / `vps_handoff_gap_found`"), true);
  assert.equal(agents.includes(CONTRACT_PATH), true);
  assert.equal(agents.includes("Dashboard Butler is the intended primary operator surface."), true);
  assert.equal(agents.includes("A local mac Codex Skill is not a VTDD product capability by\nitself."), true);
  assert.equal(agents.includes("committed on a topic branch, pushed, and\nrepresented in a Japanese-first PR body"), true);
  assert.equal(agents.includes("mark\nthe PR and status as `unconnected` or `incomplete`"), true);
  assert.equal(agents.includes("When the owner is frustrated or points out drift, do not rush into edits."), true);
  assert.equal(agents.includes("checks/reviews, and auto-merge risk"), true);
  assert.equal(agents.includes("After creating or updating a PR, check\nthe PR state again"), true);
  assert.equal(agents.includes(".agents/skills/vtdd-status-advisor/SKILL.md"), true);
  assert.equal(agents.includes("readonly does not mean\npassive"), true);
});

test("vtdd chief butler skill is repository-backed traffic control", () => {
  const skill = fs.readFileSync(CHIEF_BUTLER_SKILL_PATH, "utf8");

  assert.equal(skill.includes("name: vtdd-chief-butler"), true);
  assert.equal(skill.includes("repository-backed traffic-control contract"), true);
  assert.equal(skill.includes("must not exist\nonly in a local mac Codex install"), true);
  assert.equal(skill.includes("Owner on iPhone/iPad -> Dashboard Butler -> VTDD runtime -> VPS Codex CLI"), true);
  assert.equal(skill.includes("defect, not as an acceptable operating mode"), true);
  assert.equal(skill.includes("`mac_codex_only_probe`"), true);
  assert.equal(skill.includes("`butler_gap_found`"), true);
  assert.equal(skill.includes("`vps_handoff_gap_found`"), true);
  assert.equal(skill.includes("`recovery_gap_found`"), true);
  assert.equal(skill.includes("Before runtime code edits"), true);
  assert.equal(skill.includes("Repository Sharing Gate"), true);
  assert.equal(skill.includes("Dashboard Butler / VPS Codex CLI readability is stated honestly"), true);
  assert.equal(skill.includes("Operator URL Rule"), true);
  assert.equal(skill.includes("short clickable Markdown link"), true);
  assert.equal(skill.includes("complete same-origin absolute URL"), true);
  assert.equal(skill.includes("Using this Skill is not completion evidence."), true);
});

test("vtdd status advisor skill is readonly but still gives judgment", () => {
  const skill = fs.readFileSync(SKILL_PATH, "utf8");

  assert.equal(skill.includes("name: vtdd-status-advisor"), true);
  assert.equal(skill.includes("readonly answer, blocker judgment, and next-action advice"), true);
  assert.equal(skill.includes("This is not a passive reader."), true);
  assert.equal(skill.includes("Dashboard Butler is the intended primary surface for this Skill."), true);
  assert.equal(skill.includes("VPS Codex CLI\nmust be able to read and follow the same repo-backed behavior."), true);
  assert.equal(skill.includes("`mac_codex_only_probe`"), true);
  assert.equal(skill.includes("committed,\npushed, and represented in a Japanese-first PR body"), true);
  assert.equal(skill.includes("say `unconnected` or\n`incomplete`"), true);
  assert.equal(skill.includes("If the owner is frustrated, angry, or says the assistant is drifting, slow down."), true);
  assert.equal(skill.includes("checks/reviews, and auto-merge\nrisk"), true);
  assert.equal(skill.includes("the current git branch or related PR state has not been checked in this turn"), true);
  assert.equal(skill.includes("Use Japanese-first owner-facing language"), true);
  assert.equal(skill.includes("Issue / PR titles, bodies, comments, review responses, and RAG"), true);
  assert.equal(skill.includes("launch VPS runner, reviewer, deploy"), true);
  assert.equal(skill.includes("Do not make `vtddStartupPreflight` the first step"), true);
  assert.equal(skill.includes("lightweight_read_only: Codex CLI / reviewer / deploy は起動していません"), true);
  assert.equal(skill.includes("Using this Skill is not completion evidence."), true);
});
