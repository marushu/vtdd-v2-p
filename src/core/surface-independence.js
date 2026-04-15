export const ButlerSurface = Object.freeze({
  CUSTOM_GPT: "custom_gpt",
  WEB: "web",
  MOBILE: "mobile",
  CLI: "cli",
  OTHER: "other"
});

export const DEFAULT_BUTLER_JUDGMENT_MODEL = "vtdd-butler-core-v1";

export function evaluateSurfaceIndependence(input) {
  const {
    surface = ButlerSurface.OTHER,
    judgmentModelId,
    expectedJudgmentModelId = DEFAULT_BUTLER_JUDGMENT_MODEL
  } = input ?? {};

  if (!judgmentModelId) {
    return deny(
      "missing_judgment_model_id",
      "surface must provide a judgment model id"
    );
  }

  const normalizedSurface = normalizeSurface(surface);
  const normalizedJudgment = normalize(judgmentModelId);
  const normalizedExpected = normalize(expectedJudgmentModelId);

  if (normalizedJudgment !== normalizedExpected) {
    return deny(
      "surface_must_not_override_judgment_model",
      `surface ${normalizedSurface} attempted to use ${normalizedJudgment} instead of ${normalizedExpected}`
    );
  }

  return {
    ok: true,
    surface: normalizedSurface,
    judgmentModelId: normalizedJudgment
  };
}

function normalizeSurface(surface) {
  const value = normalize(surface);
  if (Object.values(ButlerSurface).includes(value)) {
    return value;
  }
  return ButlerSurface.OTHER;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function deny(rule, reason) {
  return { ok: false, rule, reason };
}
