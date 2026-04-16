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
