import assert from "node:assert/strict";
import test from "node:test";
import {
  browserScannerUrl,
  formatTextResult,
  parseArguments,
  requestScan,
  runCli
} from "../bin/mail-domain-check.mjs";

const fixture = {
  domain: "example.com",
  sendingIp: "8.8.8.8",
  scannedAt: "2026-07-17T00:00:00.000Z",
  score: 82,
  grade: "B",
  counts: { fail: 1, warn: 1, pass: 4, info: 1 },
  durationMs: 42,
  checks: [{
    id: "mx",
    status: "pass",
    title: { en: "MX records", zh: "MX 记录" },
    summary: { en: "Mail exchangers were found.", zh: "已找到邮件交换服务器。" }
  }]
};

test("parses positional and named CLI arguments", () => {
  assert.deepEqual(parseArguments([
    "example.com",
    "--selector=google",
    "--sending-ip",
    "8.8.8.8",
    "--lang",
    "zh",
    "--json"
  ]), {
    domain: "example.com",
    selector: "google",
    sendingIp: "8.8.8.8",
    lang: "zh",
    json: true,
    help: false,
    version: false
  });
  assert.throws(() => parseArguments([]), /domain is required/i);
  assert.throws(() => parseArguments(["example.com", "--unknown"]), /Unknown option/);
  assert.throws(() => parseArguments(["example.com", "--lang", "fr"]), /en or zh/);
});

test("posts only supplied scan inputs with CLI attribution", async () => {
  let capturedUrl;
  let capturedRequest;
  const result = await requestScan({
    domain: "example.com",
    selector: "google",
    sendingIp: ""
  }, {
    endpoint: "https://scanner.example/api/scan",
    fetchImpl: async (url, request) => {
      capturedUrl = url;
      capturedRequest = request;
      return Response.json(fixture);
    }
  });

  assert.deepEqual(result, fixture);
  assert.equal(capturedUrl, "https://scanner.example/api/scan?utm_source=cli");
  assert.equal(capturedRequest.method, "POST");
  assert.deepEqual(JSON.parse(capturedRequest.body), {
    domain: "example.com",
    dkimSelector: "google"
  });
  assert.equal(capturedRequest.headers["User-Agent"], "mail-domain-check-cli/0.1.0");
});

test("formats readable localized output and an attributed browser URL", () => {
  const english = formatTextResult(fixture, "en");
  assert.match(english, /example\.com  score 82\/100  grade B/);
  assert.match(english, /\[PASS\] MX records/);
  assert.match(english, /not raw domains or sending IPs/);

  const chinese = formatTextResult(fixture, "zh");
  assert.match(chinese, /\[通过\] MX 记录/);
  assert.match(chinese, /不保存原始域名或发送 IP/);

  const url = new URL(browserScannerUrl(fixture, "en"));
  assert.equal(url.pathname, "/en/");
  assert.equal(url.searchParams.get("domain"), "example.com");
  assert.equal(url.searchParams.get("sendingIp"), "8.8.8.8");
  assert.equal(url.searchParams.get("utm_source"), "cli");
});

test("prints exact JSON for automation", async () => {
  const result = await runCli(["example.com", "--json"], {
    fetchImpl: async () => Response.json(fixture)
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), fixture);
  assert.equal(result.stderr, "");
});

test("reports HTTP failures and retry guidance without a stack trace", async () => {
  const result = await runCli(["example.com"], {
    fetchImpl: async () => Response.json(
      { error: "Too many scans" },
      { status: 429, headers: { "retry-after": "12" } }
    )
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Error: Too many scans Try again in 12 seconds.\n");
  assert.doesNotMatch(result.stderr, /at requestScan|CliError:/);
});
