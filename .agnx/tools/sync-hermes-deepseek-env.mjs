// 场景：Hermes 子应用 ensure/探针 — 将 DEEPSEEK_API_KEY 写入 hermes-home/.env 并补默认 model 配置。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const HERMES_DEEPSEEK_PROVIDER = "deepseek";
export const HERMES_DEEPSEEK_MODEL = "deepseek-chat";
const ENV_KEY = "DEEPSEEK_API_KEY";

/**
 * @returns {string}
 */
export function resolveDeepseekApiKey() {
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "";
}

/**
 * @param {string} raw
 * @param {string} key
 */
function parseEnvValue(raw, key) {
  const prefix = `${key}=`;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return "";
}

/**
 * @param {string} raw
 * @param {string} key
 * @param {string} value
 */
function upsertEnvLine(raw, key, value) {
  const lines = raw.length > 0 ? raw.replace(/\s*$/, "").split(/\r?\n/) : [];
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.trim().startsWith(prefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    next.push(`${key}=${value}`);
  }
  return `${next.join("\n")}\n`;
}

/**
 * @param {string} hermesHome
 * @param {string} [apiKey]
 */
export async function syncHermesDeepseekEnv(hermesHome, apiKey = resolveDeepseekApiKey()) {
  const trimmedKey = apiKey?.trim() || "";
  const envPath = join(hermesHome, ".env");
  const configPath = join(hermesHome, "config.yaml");

  await mkdir(hermesHome, { recursive: true });

  let envWritten = false;
  let configPatched = false;
  let configSkipped = "";

  if (trimmedKey) {
    const existingEnv = await readFile(envPath, "utf8").catch(() => "");
    if (parseEnvValue(existingEnv, ENV_KEY) !== trimmedKey) {
      await writeFile(envPath, upsertEnvLine(existingEnv, ENV_KEY, trimmedKey), "utf8");
      envWritten = true;
    }
  }

  const configRaw = await readFile(configPath, "utf8").catch(() => "");
  if (/\nmodel:\s*\n/.test(configRaw) || /^model:\s*\n/m.test(configRaw)) {
    configSkipped = "model section already present";
  } else {
    const block = `\nmodel:\n  provider: ${HERMES_DEEPSEEK_PROVIDER}\n  default: ${HERMES_DEEPSEEK_MODEL}\n`;
    await writeFile(configPath, `${configRaw.trimEnd()}${block}`, "utf8");
    configPatched = true;
  }

  return {
    ok: Boolean(trimmedKey),
    envPath,
    configPath,
    envWritten,
    configPatched,
    configSkipped,
    apiKeyPresent: Boolean(trimmedKey),
  };
}
