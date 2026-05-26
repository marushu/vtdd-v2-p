import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ButlerSurface,
  DEFAULT_BUTLER_JUDGMENT_MODEL,
  evaluateSurfaceIndependence
} from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "butler", "surface-independence.md");

test("surface independence doc defines role/contract/runtime/surface separation", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("role"), true);
  assert.equal(doc.includes("contract"), true);
  assert.equal(doc.includes("runtime"), true);
  assert.equal(doc.includes("surface"), true);
  assert.equal(
    doc.includes("Replacing the surface must not redefine Butler's judgment model or memory model."),
    true
  );
});

test("surface independence doc preserves Custom GPT fallback while defining Dashboard Butler path", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const compact = doc.replace(/\s+/g, " ");
  assert.equal(doc.includes("Custom GPT Butler remains a supported Butler surface and fallback."), true);
  assert.equal(compact.includes("Dashboard Butler does not replace it as a fallback"), true);
  assert.equal(compact.includes("Dashboard Butler should eventually exceed Custom GPT for the VTDD owner workflow."), true);
  assert.equal(doc.includes("The target is not a weaker homegrown chat UI."), true);
  assert.equal(compact.includes("more useful than Custom GPT for operating VTDD from iPhone or iPad"), true);
  assert.equal(doc.includes("Custom GPT Butler\n  -> Action Schema operationId"), true);
  assert.equal(doc.includes("Dashboard Butler PWA\n  -> Worker / Durable Object dashboard chat room"), true);
  assert.equal(compact.includes("The two surfaces may share VTDD core actions when the operation is the same"), true);
  assert.equal(doc.includes("Dashboard-only capabilities are the reason Dashboard Butler exists."), true);
  assert.equal(doc.includes("iOS/PWA notifications, badges, and notification recovery"), true);
  assert.equal(doc.includes("Action Schema and Instructions update guidance with owner-facing next steps"), true);
  assert.equal(doc.includes("owner-facing setup recovery for Custom GPT Action Schema and Instructions"), true);
  assert.equal(doc.includes("Action Schema operationId exposure"), true);
  assert.equal(doc.includes("Custom GPT Action Authentication guidance"), true);
});

test("surface independence doc requires separate surface update reporting", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const compact = doc.replace(/\s+/g, " ");
  assert.equal(doc.includes("Custom GPT Action Schema update"), true);
  assert.equal(doc.includes("Custom GPT Instructions update"), true);
  assert.equal(doc.includes("Cloudflare deploy update"), true);
  assert.equal(doc.includes("Dashboard Butler UI/runtime update"), true);
  assert.equal(doc.includes("iPhone/PWA live E2E evidence"), true);
  assert.equal(doc.includes("runtimeParity=in_sync"), true);
  assert.equal(
    compact.includes("the runtime cannot read the editor's pasted state"),
    true
  );
});

test("surface independence allows supported surfaces when judgment model is unchanged", () => {
  for (const surface of [
    ButlerSurface.CUSTOM_GPT,
    ButlerSurface.WEB,
    ButlerSurface.MOBILE,
    ButlerSurface.CLI
  ]) {
    const result = evaluateSurfaceIndependence({
      surface,
      judgmentModelId: DEFAULT_BUTLER_JUDGMENT_MODEL
    });
    assert.equal(result.ok, true);
    assert.equal(result.surface, surface);
  }
});

test("surface independence blocks missing or overridden judgment model id", () => {
  const missing = evaluateSurfaceIndependence({
    surface: ButlerSurface.CUSTOM_GPT
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.rule, "missing_judgment_model_id");

  const overridden = evaluateSurfaceIndependence({
    surface: ButlerSurface.WEB,
    judgmentModelId: "vendor-specific-model"
  });
  assert.equal(overridden.ok, false);
  assert.equal(overridden.rule, "surface_must_not_override_judgment_model");
});
