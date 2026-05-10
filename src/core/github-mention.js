export function normalizeMentionLogin(value) {
  const login = normalizeText(value);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) {
    return "";
  }
  if (/\[bot\]$/i.test(login) || /bot$/i.test(login)) {
    return "";
  }
  if (["ghost", "unknown"].includes(login.toLowerCase())) {
    return "";
  }
  return login;
}

export function resolveOperatorMention(candidates = []) {
  return candidates.map(normalizeMentionLogin).find(Boolean) || "";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
