# Mail Domain Check CLI

A dependency-free Node.js command for checking public email-domain configuration:
MX, SPF, DKIM, DMARC, PTR, MTA-STS, TLS-RPT, and CAA.

## Quick start

Node.js 20 or newer is required.

```sh
curl -fsSL https://mail-domain-check-zac2.coral-ibis-2405.chatgpt.site/cli/mail-domain-check.mjs -o mail-domain-check.mjs
node mail-domain-check.mjs example.com
```

Or clone the repository:

```sh
git clone https://github.com/zac343/mail-domain-check-cli.git
cd mail-domain-check-cli
node bin/mail-domain-check.mjs example.com
```

For a version-pinned download:

```sh
curl -fsSL https://github.com/zac343/mail-domain-check-cli/releases/download/v0.1.0/mail-domain-check.mjs -o mail-domain-check.mjs
node mail-domain-check.mjs example.com
```

GitHub publishes the digest for each release asset. Verify the downloaded file
against the asset digest before using it in an automated or privileged
environment.

## Usage

Add a known DKIM selector or the actual outbound IP when available:

```sh
node mail-domain-check.mjs example.com --selector google --sending-ip 8.8.8.8
```

When running from a clone, replace `mail-domain-check.mjs` with
`bin/mail-domain-check.mjs`.

- `--selector <name>` checks a specific DKIM selector.
- `--sending-ip <address>` verifies PTR and forward DNS for an outbound IP.
- `--json` prints machine-readable JSON.
- `--lang zh` prints Chinese text output.
- `--help` shows the full command reference.

For an interactive report and remediation guidance, use the
[web checker](https://mail-domain-check-zac2.coral-ibis-2405.chatgpt.site/developers/cli/?utm_source=github&utm_medium=repository&utm_campaign=mail_domain_check_cli).

## Privacy and limits

The command sends the supplied domain, selector, and optional sending IP over
HTTPS to the public Mail Domain Check API. Free analytics retain irreversible
hashes and aggregate metrics, not raw domains or sending IPs. The public
endpoint is rate-limited and intended for interactive diagnostics, not bulk
enumeration.

Results describe public configuration at scan time. They do not guarantee inbox
placement and do not replace a complete security or compliance audit.

## Development

The CLI uses only Node.js built-ins.

```sh
npm test
```

## License

MIT
