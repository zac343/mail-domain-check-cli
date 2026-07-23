#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const VERSION = "0.1.0";
export const API_ENDPOINT = "https://mail-domain-check-zac2.coral-ibis-2405.chatgpt.site/api/scan";
export const SITE_ORIGIN = "https://mail-domain-check-zac2.coral-ibis-2405.chatgpt.site";

const DEFAULT_TIMEOUT_MS = 20_000;
const LANGUAGES = new Set(["en", "zh"]);

const messages = {
  en: {
    title: "Mail Domain Check",
    score: "score",
    grade: "grade",
    scanned: "Scanned",
    duration: "duration",
    open: "Open the browser scanner",
    privacy: "Privacy: free analytics retain irreversible hashes and aggregate metrics, not raw domains or sending IPs.",
    status: { pass: "PASS", warn: "WARN", fail: "FAIL", info: "INFO" }
  },
  zh: {
    title: "邮件域名体检",
    score: "健康分",
    grade: "等级",
    scanned: "扫描时间",
    duration: "耗时",
    open: "在浏览器中继续",
    privacy: "隐私：免费分析只保留不可逆哈希与汇总指标，不保存原始域名或发送 IP。",
    status: { pass: "通过", warn: "警告", fail: "失败", info: "信息" }
  }
};

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function optionValue(argument, optionName) {
  const prefix = `${optionName}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : null;
}

export function parseArguments(argv) {
  const options = {
    domain: "",
    selector: "",
    sendingIp: "",
    lang: "en",
    json: false,
    help: false,
    version: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      options.version = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }

    const namedOptions = [
      ["--selector", "selector"],
      ["--sending-ip", "sendingIp"],
      ["--lang", "lang"]
    ];
    const named = namedOptions.find(([name]) => argument === name || argument.startsWith(`${name}=`));
    if (named) {
      const [name, property] = named;
      const inline = optionValue(argument, name);
      const value = inline === null ? argv[index + 1] : inline;
      if (value === undefined || String(value).trim() === "" || (inline === null && String(value).startsWith("-"))) {
        throw new CliError(`${name} requires a value`, 2);
      }
      options[property] = String(value).trim();
      if (inline === null) index += 1;
      continue;
    }

    if (argument.startsWith("-")) throw new CliError(`Unknown option: ${argument}`, 2);
    if (options.domain) throw new CliError("Provide exactly one domain", 2);
    options.domain = argument.trim();
  }

  if (!LANGUAGES.has(options.lang)) throw new CliError("--lang must be en or zh", 2);
  if (!options.help && !options.version && !options.domain) {
    throw new CliError("A domain is required. Run with --help for usage.", 2);
  }
  return options;
}

export function helpText() {
  return `Mail Domain Check CLI ${VERSION}

Usage:
  node mail-domain-check.mjs <domain> [options]

Options:
  --selector <name>       Check a specific DKIM selector
  --sending-ip <address>  Verify PTR and forward DNS for an outbound IP
  --lang <en|zh>          Output language (default: en)
  --json                  Print machine-readable JSON
  -h, --help              Show this help
  -v, --version           Show the version

Examples:
  node mail-domain-check.mjs example.com
  node mail-domain-check.mjs example.com --selector google --sending-ip 8.8.8.8
  node mail-domain-check.mjs example.com --json`;
}

function localized(value, lang) {
  if (value && typeof value === "object") {
    return String(value[lang] || value.en || value.zh || "");
  }
  return String(value || "");
}

export function browserScannerUrl(result, lang = "en") {
  const url = new URL(lang === "zh" ? "/" : "/en/", SITE_ORIGIN);
  if (result?.domain) url.searchParams.set("domain", result.domain);
  if (result?.sendingIp) url.searchParams.set("sendingIp", result.sendingIp);
  url.searchParams.set("utm_source", "cli");
  return url.toString();
}

export function formatTextResult(result, lang = "en") {
  const copy = messages[lang] || messages.en;
  const counts = result?.counts || {};
  const lines = [
    copy.title,
    `${result.domain || "unknown"}  ${copy.score} ${result.score ?? "?"}/100  ${copy.grade} ${result.grade || "?"}`,
    `${copy.status.pass} ${counts.pass || 0} | ${copy.status.warn} ${counts.warn || 0} | ${copy.status.fail} ${counts.fail || 0} | ${copy.status.info} ${counts.info || 0}`,
    `${copy.scanned}: ${result.scannedAt || "unknown"}  ${copy.duration}: ${result.durationMs ?? "?"} ms`,
    ""
  ];

  for (const check of Array.isArray(result?.checks) ? result.checks : []) {
    const status = copy.status[check.status] || String(check.status || "info").toUpperCase();
    const title = localized(check.title, lang) || check.id || "Check";
    const summary = localized(check.summary, lang);
    lines.push(`[${status}] ${title}`);
    if (summary) lines.push(`  ${summary}`);
  }

  lines.push("", `${copy.open}: ${browserScannerUrl(result, lang)}`, copy.privacy);
  return lines.join("\n");
}

function endpointWithAttribution(endpoint) {
  const url = new URL(endpoint);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "cli");
  return url.toString();
}

export async function requestScan(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new CliError("This command requires Node.js 20 or newer.");

  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(endpointWithAttribution(dependencies.endpoint || API_ENDPOINT), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `mail-domain-check-cli/${VERSION}`
      },
      body: JSON.stringify({
        domain: options.domain,
        ...(options.selector ? { dkimSelector: options.selector } : {}),
        ...(options.sendingIp ? { sendingIp: options.sendingIp } : {})
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new CliError(`The scan timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
    }
    throw new CliError(`Could not reach the scan service: ${error?.message || "network error"}`);
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CliError(`The scan service returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const retryHint = retryAfter ? ` Try again in ${retryAfter} seconds.` : "";
    throw new CliError(`${payload?.error || `Scan failed with HTTP ${response.status}.`}${retryHint}`);
  }
  return payload;
}

export async function runCli(argv, dependencies = {}) {
  try {
    const options = parseArguments(argv);
    if (options.help) return { exitCode: 0, stdout: `${helpText()}\n`, stderr: "" };
    if (options.version) return { exitCode: 0, stdout: `${VERSION}\n`, stderr: "" };
    const result = await requestScan(options, dependencies);
    const output = options.json
      ? JSON.stringify(result, null, 2)
      : formatTextResult(result, options.lang);
    return { exitCode: 0, stdout: `${output}\n`, stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: error instanceof CliError ? error.exitCode : 1,
      stdout: "",
      stderr: `Error: ${message}\n`
    };
  }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const result = await runCli(argv, dependencies);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.exitCode;
}

const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedUrl) process.exitCode = await main();
