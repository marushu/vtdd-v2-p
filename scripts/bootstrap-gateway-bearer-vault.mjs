#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_VTDD_VAULT_MANIFEST_PATH } from "../src/core/desktop-bootstrap-vault.js";

const DEFAULT_TOKEN_RELATIVE_PATH = "gateway/bearer-token.txt";

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--manifest-path") {
      parsed.manifestPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--token-path") {
      parsed.tokenPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === "--token-stdin") {
      parsed.tokenStdin = true;
      continue;
    }
    if (current === "--generate") {
      parsed.generate = true;
      continue;
    }
    if (current === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (current === "--pretty") {
      parsed.pretty = true;
      continue;
    }
  }
  return parsed;
}

export async function bootstrapGatewayBearerVault(options = {}) {
  const manifestPath = path.resolve(
    normalizeText(options.manifestPath) || DEFAULT_VTDD_VAULT_MANIFEST_PATH
  );
  const manifestDir = path.dirname(manifestPath);
  const tokenRelativePath = normalizeText(options.tokenPath) || DEFAULT_TOKEN_RELATIVE_PATH;
  if (path.isAbsolute(tokenRelativePath)) {
    throw new Error("token path must be relative to the credentials manifest directory");
  }

  const token = await resolveToken(options);
  if (!token) {
    throw new Error("gateway bearer token source is required via VTDD_GATEWAY_BEARER_TOKEN, --token-stdin, or --generate");
  }

  const tokenPath = path.join(manifestDir, tokenRelativePath);
  const manifest = await readExistingManifest(manifestPath);
  const nextManifest = {
    ...manifest,
    version: 1,
    gateway: {
      ...(manifest.gateway && typeof manifest.gateway === "object" ? manifest.gateway : {}),
      bearerTokenPath: tokenRelativePath
    }
  };

  if (!options.dryRun) {
    await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
    await fs.mkdir(manifestDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
    await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, { mode: 0o600 });
    await chmodBestEffort(path.dirname(tokenPath), 0o700);
    await chmodBestEffort(manifestDir, 0o700);
    await chmodBestEffort(tokenPath, 0o600);
    await chmodBestEffort(manifestPath, 0o600);
  }

  return {
    ok: true,
    dryRun: options.dryRun === true,
    manifestPath,
    tokenPath,
    manifestUpdated: true,
    tokenWritten: options.dryRun !== true,
    tokenSource: token.source,
    tokenPreview: "[redacted]"
  };
}

async function resolveToken(options) {
  const envToken = normalizeText(options.env?.VTDD_GATEWAY_BEARER_TOKEN ?? process.env.VTDD_GATEWAY_BEARER_TOKEN);
  if (envToken) {
    return Object.assign(new String(envToken), { source: "env" });
  }
  if (options.tokenStdin) {
    const stdinToken = normalizeText(options.stdinText ?? (await readStdin()));
    if (stdinToken) {
      return Object.assign(new String(stdinToken), { source: "stdin" });
    }
  }
  if (options.generate) {
    const generated = crypto.randomBytes(32).toString("base64url");
    return Object.assign(new String(generated), { source: "generated" });
  }
  return "";
}

async function readExistingManifest(manifestPath) {
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw new Error(`existing manifest is unreadable: ${manifestPath}`);
  }
}

async function chmodBestEffort(targetPath, mode) {
  try {
    await fs.chmod(targetPath, mode);
  } catch {
    // Some filesystems do not support POSIX modes. Creation still succeeds.
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  bootstrapGatewayBearerVault(args)
    .then((result) => {
      const spacing = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
