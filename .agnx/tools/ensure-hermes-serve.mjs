#!/usr/bin/env node
/**
 * 场景：Hermes G6.3 ensure — supervised 启动 `hermes dashboard` gateway + Web UI，供 electron-module Tab 加载。
 * 用法：node agnx/tools/ensure-hermes-serve.mjs [--work-dir <dataRoot>] [--port <n>] [--mode dashboard|serve] [--force-restart] [--supervised]
 * stdout：单行或多行 JSON { ok, plan?, origin?, rendererEntry?, gatewayOrigin?, reused?, warnings? }
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  emitEnsureFailure,
  emitEnsureJson,
  pathExists,
  probeHttpHealth,
  requireSupervised,
  tryReuseSupervisedSidecar,
  writeJsonState,
} from "./ensure-runtime-base.mjs";
import { resolveDeepseekApiKey, syncHermesDeepseekEnv } from "./sync-hermes-deepseek-env.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const defaultPort = 9119;
const appId = "hermes-agent";
const ensureId = "ensure-hermes-serve";

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let port = defaultPort;
  let mode = "dashboard";
  let forceRestart = false;
  let supervised = false;
  let rendererEntry = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) {
        port = n;
      }
      i += 1;
    } else if ((arg === "--mode" || arg === "--runtimeMode") && next) {
      mode = next === "serve" ? "serve" : "dashboard";
      i += 1;
    } else if (arg === "--renderer-entry" && next) {
      rendererEntry = String(next).trim();
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    }
  }
  return {
    workDir: workDir || path.join(repoRoot, ".agnx-hermes-runtime"),
    port,
    mode,
    repoRoot,
    forceRestart,
    supervised,
    rendererEntry,
  };
}

function fingerprint(cfg, hermesHome, launch) {
  return JSON.stringify({
    repoRoot: cfg.repoRoot,
    port: cfg.port,
    mode: cfg.mode,
    hermesHome,
    command: launch.command,
    argsPrefix: launch.argsPrefix,
  });
}

function resolveHermesHome(workDir) {
  return path.join(workDir, "hermes-home");
}

async function resolveHermesLaunch() {
  const venvHermes = path.join(repoRoot, ".venv", "bin", "hermes");
  if (await pathExists(venvHermes)) {
    return { command: venvHermes, argsPrefix: [], kind: "venv" };
  }
  const venvPython = path.join(repoRoot, ".venv", "bin", "python3");
  if (await pathExists(venvPython)) {
    return { command: venvPython, argsPrefix: ["-m", "hermes_cli.main"], kind: "venv-python" };
  }
  try {
    await execFileAsync("uv", ["--version"], { timeout: 5_000 });
    return { command: "uv", argsPrefix: ["run", "hermes"], kind: "uv" };
  } catch {
    /* fall through */
  }
  const python = process.env.PYTHON?.trim() || "python3";
  return { command: python, argsPrefix: ["-m", "hermes_cli.main"], kind: "python-module" };
}

function buildHermesArgs(cfg, launch) {
  const subcommand = cfg.mode === "serve" ? "serve" : "dashboard";
  const args = [
    ...launch.argsPrefix,
    subcommand,
    "--no-open",
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "--isolated",
    "--skip-build",
  ];
  return args;
}

function originForPort(port) {
  return `http://127.0.0.1:${port}`;
}

function resolveRendererEntry(cfg, gatewayOrigin) {
  if (cfg.rendererEntry) {
    return cfg.rendererEntry;
  }
  if (cfg.mode === "dashboard") {
    return `${gatewayOrigin}/`;
  }
  const desktopDev = "http://127.0.0.1:5174/";
  return desktopDev;
}

async function isApiHealthy(port) {
  return probeHttpHealth(`${originForPort(port)}/api/health`);
}

async function validateHermesPrereqs(warnings) {
  const launch = await resolveHermesLaunch();
  const webDist = path.join(repoRoot, "hermes_cli", "web_dist", "index.html");
  if (!(await pathExists(webDist))) {
    warnings.push(
      "缺少 hermes_cli/web_dist/index.html；请在 Hermes 仓执行：cd web && npm install && npm run build",
    );
  }
  try {
    const probeArgs = [...launch.argsPrefix, "--help"];
    await execFileAsync(launch.command, probeArgs, {
      cwd: repoRoot,
      timeout: 20_000,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr || "") : "";
    const hint =
      launch.kind === "uv"
        ? "请在 Hermes 仓根执行：uv sync && uv run hermes --help"
        : "请在 Hermes 仓根执行：uv sync 或 python -m pip install -e .";
    return {
      ok: false,
      error: stderr.trim()
        ? `Hermes CLI 不可用：${stderr.trim().slice(0, 240)}。${hint}`
        : `Hermes CLI 不可用。${hint}`,
    };
  }
  return { ok: true, launch };
}

async function buildSupervisedPlan(cfg, warnings, wantedFp) {
  const prereq = await validateHermesPrereqs(warnings);
  if (!prereq.ok) {
    return prereq;
  }
  const hermesHome = resolveHermesHome(cfg.workDir);
  const deepseekSync = await syncHermesDeepseekEnv(hermesHome);
  if (!deepseekSync.apiKeyPresent) {
    warnings.push(
      "未检测到 DEEPSEEK_API_KEY；Hermes chat 需配置 DeepSeek 密钥（env 或 hermes-home/.env）",
    );
  } else if (deepseekSync.envWritten || deepseekSync.configPatched) {
    warnings.push("已同步 DeepSeek 配置到 hermes-home（.env / config.yaml model）");
  }
  const gatewayOrigin = originForPort(cfg.port);
  const rendererEntry = resolveRendererEntry(cfg, gatewayOrigin);
  const healthUrl = `${gatewayOrigin}/api/health`;
  const launch = prereq.launch;
  const deepseekApiKey = resolveDeepseekApiKey();
  return {
    ok: true,
    plan: {
      command: launch.command,
      args: buildHermesArgs(cfg, launch),
      cwd: cfg.repoRoot,
      env: {
        HERMES_HOME: hermesHome,
        PYTHONUNBUFFERED: "1",
        ...(deepseekApiKey ? { DEEPSEEK_API_KEY: deepseekApiKey } : {}),
      },
      fingerprint: wantedFp,
      healthUrl,
      port: cfg.port,
      launchMode: cfg.mode,
    },
    origin: gatewayOrigin,
    gatewayOrigin,
    rendererEntry,
    port: cfg.port,
    mode: cfg.mode,
    repoRoot: cfg.repoRoot,
  };
}

async function tryReusedResponse(cfg, statePath, wantedFp) {
  const gatewayOrigin = originForPort(cfg.port);
  return tryReuseSupervisedSidecar({
    forceRestart: cfg.forceRestart,
    statePath,
    wantedFingerprint: wantedFp,
    isHealthy: () => isApiHealthy(cfg.port),
    buildReusedPayload: (existing) => ({
      ok: true,
      reused: true,
      port: cfg.port,
      mode: cfg.mode,
      pid: existing.pid ?? null,
      origin: gatewayOrigin,
      gatewayOrigin,
      rendererEntry: existing.rendererEntry || resolveRendererEntry(cfg, gatewayOrigin),
      repoRoot: cfg.repoRoot,
      warnings: existing.warnings || [],
    }),
  });
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const warnings = [];
  const hermesHome = resolveHermesHome(cfg.workDir);
  const launch = await resolveHermesLaunch();
  const wantedFp = fingerprint(cfg, hermesHome, launch);
  const statePath = path.join(cfg.workDir, "hermes-gateway.json");

  if (!cfg.supervised) {
    requireSupervised(false, ensureId);
  }

  const reused = await tryReusedResponse(cfg, statePath, wantedFp);
  if (reused) {
    emitEnsureJson(reused);
    return;
  }

  const planned = await buildSupervisedPlan(cfg, warnings, wantedFp);
  if (!planned.ok) {
    emitEnsureFailure({ appId, ensureId, error: planned.error, warnings });
    return;
  }

  await writeJsonState(statePath, {
    fingerprint: wantedFp,
    port: cfg.port,
    mode: cfg.mode,
    rendererEntry: planned.rendererEntry,
    gatewayOrigin: planned.gatewayOrigin,
    warnings,
    updatedAt: Date.now(),
  });

  emitEnsureJson({
    ok: true,
    reused: false,
    plan: planned.plan,
    origin: planned.origin,
    gatewayOrigin: planned.gatewayOrigin,
    rendererEntry: planned.rendererEntry,
    port: planned.port,
    mode: planned.mode,
    repoRoot: planned.repoRoot,
    warnings,
    appId,
    ensureId,
  });
}

main().catch((error) => {
  emitEnsureFailure({
    appId,
    ensureId,
    error: error instanceof Error ? error.message : String(error),
  });
});
