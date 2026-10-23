#!/usr/bin/env node
/**
 * 场景：G6 runtime-sidecar ensure 公共库 — supervised 门闩、stateFile、HTTP 健康检查；各 App ensure 只填 launch/health。
 */
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export function requireSupervised(supervised, ensureId) {
  if (!supervised) {
    console.error(`${ensureId}: 请使用 --supervised（Agnx process-supervisor 合同）`);
    process.exit(2);
  }
}

export async function pathExists(target) {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonState(statePath) {
  if (!(await pathExists(statePath))) {
    return null;
  }
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

export async function writeJsonState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function emitEnsureJson(payload, exitCode = 0) {
  console.log(JSON.stringify(payload));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

export function emitEnsureFailure({ appId, ensureId, error, warnings = [] }) {
  emitEnsureJson({ ok: false, appId, ensureId, error, warnings }, 1);
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 */
export function probeHttpHealth(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2500;
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * @param {object} input
 * @param {string} input.statePath
 * @param {string} input.wantedFingerprint
 * @param {() => Promise<boolean>} input.isHealthy
 * @param {(existing: object) => object} input.buildReusedPayload
 */
export async function tryReuseSupervisedSidecar(input) {
  if (input.forceRestart) {
    return null;
  }
  const existing = await readJsonState(input.statePath);
  if (!existing || existing.fingerprint !== input.wantedFingerprint) {
    return null;
  }
  if (!(await input.isHealthy())) {
    return null;
  }
  return input.buildReusedPayload(existing);
}
