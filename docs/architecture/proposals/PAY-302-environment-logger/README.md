# PAY-302: Logging Library Comparison — Pino vs Winston vs Bunyan

## Purpose

This document compares the three logging solutions researched for PAY-302 to support the team's selection decision. Each option has a dedicated implementation plan in this folder. This document focuses on trade-offs relevant to the Payment Portal's context: AWS Lambda, CloudWatch, TypeScript, structured JSON, and developer experience.

---

## At a Glance

|                                 | Pino                                           | Winston                                         | Bunyan                                                                            |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| **GitHub stars**                | ~18k                                           | ~23k                                            | ~7k                                                                               |
| **Last active**                 | Active                                         | Active                                          | Low activity (last release 2021)                                                  |
| **JSON output by default**      | Yes                                            | Requires config                                 | Yes                                                                               |
| **Log levels**                  | trace/debug/info/warn/error/fatal/silent       | error/warn/info/http/verbose/debug/silly        | trace/debug/info/warn/error/fatal                                                 |
| **Level values in JSON**        | Numbers (configurable to strings)              | Strings (configurable)                          | Numbers only                                                                      |
| **Message key**                 | `msg`                                          | `message`                                       | `msg`                                                                             |
| **Timestamp key**               | `time`                                         | `timestamp`                                     | `time`                                                                            |
| **Child logger**                | `logger.child()`                               | `logger.child()`                                | `logger.child()`                                                                  |
| **Built-in redaction**          | Yes (`redact` option, path-based)              | No (manual)                                     | No (manual via serializers)                                                       |
| **Pretty local output**         | `pino-pretty` (transport, dev dependency)      | Built-in colorize/printf formatters             | `bunyan` CLI (global install)                                                     |
| **TypeScript support**          | First-class (`pino` ships types)               | Good (`@types/winston` not needed; ships types) | Types available via `@types/bunyan`                                               |
| **Performance**                 | Fastest (offloads formatting to worker thread) | Moderate                                        | Moderate                                                                          |
| **Extra fields always present** | `pid`, `hostname` (suppressible)               | None beyond what you configure                  | `name`, `hostname`, `pid`, `time`, `v` (not suppressible without post-processing) |

---

## Detailed Pros and Cons

### Pino

#### Pros

- **Fastest logging throughput** of the three. Pino offloads all JSON serialization and transport formatting to a worker thread via `pino.transport()`, keeping the main thread minimally blocked. Benchmarks show it is 5x or more faster than alternatives.
- **Structured JSON by default** — no extra configuration needed to produce CloudWatch-queryable output.
- **Built-in path-based redaction** via the `redact` option using `fast-redact`. Sensitive fields are censored before serialization with no manual guard code required.
- **First-class TypeScript support** — types ship with the package.
- **`pino-pretty` runs in a separate thread** — zero performance cost to pretty-printing in development; it is simply not loaded in production.
- **Level values are configurable as strings** via `formatters.level`, which makes CloudWatch filter expressions straightforward (e.g., `level = "error"`).
- **`pid` and `hostname` are suppressible** via `base: undefined` or a custom `base` object.
- Actively maintained with a large ecosystem and wide adoption in production Node.js services.

#### Cons

- **`msg` not `message`** as the default message key. CloudWatch queries must use `msg`. This is a minor friction point if the team has existing tooling or dashboards that expect `message`.
- **`pino-pretty` is a required dev dependency** for readable local output. It needs to be installed separately and configured as a transport. Not a significant burden, but one extra step compared to Winston.
- **Logging signature** requires the merging object first: `logger.info({ field }, "message")`. This is the opposite of the natural English reading order and takes some adjustment for developers coming from `console.log`-style logging.
- **Worker thread transport** adds architectural complexity for cases where custom transports are needed (e.g., routing logs to multiple destinations with per-level filtering).

---

### Winston

#### Pros

- **Most widely adopted** Node.js logging library with the largest community and ecosystem.
- **Flexible format pipeline** — Winston's `format.combine()` system makes it straightforward to compose custom output formats using built-in helpers (`colorize`, `timestamp`, `printf`, `json`, `errors`).
- **Familiar logging signature**: `logger.info("message", { field })` or `logger.info("message")` — closest to `console.log` style.
- **String level labels** by default (`"level": "info"` in JSON output) — easy to read in CloudWatch without any extra configuration.
- **No required extra packages** for pretty local output — Winston's built-in `colorize` and `printf` formatters are sufficient.
- **`message` as the message key** — matches the expectations of developers familiar with structured logging in other ecosystems.
- Good TypeScript support — types ship with the package.

#### Cons

- **Not JSON by default** — structured JSON output requires explicit configuration (`format.json()`). Forgetting this during setup means logs land as unstructured text.
- **No built-in redaction** — sensitive fields must be manually guarded before logging or through a custom format. Easy to miss.
- **Slower than Pino** — Winston processes format transforms synchronously on the main thread, which can add latency under high log volume on Lambda cold starts or bursts.
- **More boilerplate to initialize** — getting correct JSON output with timestamps, error stacks, and context requires combining several format steps. Higher chance of misconfiguration in early setup.
- **`http` and `verbose` levels** are not standard across logging libraries. They have no equivalent in Pino or Bunyan, which can cause confusion in a mixed codebase or when writing CloudWatch filter rules.

---

### Bunyan

#### Pros

- **Structured JSON from day one** — Bunyan was one of the original JSON logging libraries for Node.js. JSON is the only output format; there is no risk of accidentally emitting plain text.
- **Established child logger pattern** — `logger.child()` with bound fields was popularized by Bunyan and is well-understood in its community.
- **`bunyan` CLI tool** for local log pretty-printing and filtering. The CLI supports level filtering (`| bunyan -l warn`), field-based filtering (`| bunyan -c 'this.feeId == "FEE-001"'`), and short/long output modes. This makes ad-hoc log analysis during development quite powerful.
- **Serializer system** provides structured control over how objects are rendered in log lines. Particularly useful for ensuring consistent shape of `err`, `req`, and `res` fields.
- **Simple, minimal API** — `bunyan.createLogger()` with sensible defaults. Less to configure than Winston.

#### Cons

- **Low maintenance activity** — the last stable npm release was 2021 and GitHub shows limited recent activity. This is a meaningful concern for a production service that will need security patches and Node.js compatibility updates over time.
- **Numeric level values only** — Bunyan always writes `"level": 30` for `info` in JSON. There is no built-in option to emit string labels. CloudWatch filter expressions must use numeric comparisons (`level >= 30`) rather than string matches (`level = "info"`), which is less readable.
- **`v: 0` field always present** — Bunyan adds a log format version field to every record. It cannot be removed without custom stream post-processing. This adds noise to CloudWatch queries and storage.
- **`hostname` and `pid` always present** and not suppressible via configuration. In Lambda, `pid` is not meaningful and `hostname` is internal infrastructure detail. Bunyan does not offer a `base: undefined`-style override.
- **No built-in redaction** — same as Winston; redaction must be done manually via custom serializers.
- **Pretty-printing requires a separate step** — unlike Pino's transport or Winston's built-in formats, Bunyan relies on a global CLI install. This is an external tool dependency that must be documented for every developer's setup.
- **Slower than Pino** — similar performance characteristics to Winston; synchronous JSON serialization on the main thread.

---

## Side-by-Side Feature Comparison

### Log Level Defaults for This Project

| Environment | Pino default | Winston default | Bunyan default |
| ----------- | ------------ | --------------- | -------------- |
| local       | info         | info            | info           |
| test        | error        | error           | error          |
| development | debug        | debug           | debug          |
| staging     | info         | info            | info           |
| production  | info         | info            | info           |

All three support `LOG_LEVEL` override in any environment using the same resolution logic.

### Local Developer Experience

|                         | Pino                                 | Winston                        | Bunyan                                    |
| ----------------------- | ------------------------------------ | ------------------------------ | ----------------------------------------- |
| Pretty output mechanism | `pino-pretty` transport (dev dep)    | Built-in `colorize` + `printf` | `bunyan` CLI (global install)             |
| Setup required          | `npm install --save-dev pino-pretty` | None                           | `npm install -g bunyan`                   |
| Output on by default    | No (must configure transport)        | Yes                            | Yes (JSON piped to CLI)                   |
| Color support           | Yes (via pino-pretty)                | Yes (via colorize format)      | Yes (via CLI)                             |
| Field filtering         | No built-in (CLI tooling external)   | No built-in                    | Yes (`bunyan -c 'this.field == "value"'`) |

### CloudWatch Queryability (Staging/Production)

|                             | Pino                             | Winston              | Bunyan                                                    |
| --------------------------- | -------------------------------- | -------------------- | --------------------------------------------------------- |
| JSON by default             | Yes                              | No (requires config) | Yes                                                       |
| Message key                 | `msg`                            | `message`            | `msg`                                                     |
| Level in JSON               | Number or string (configurable)  | String               | Number only                                               |
| Timestamp key               | `time`                           | `timestamp`          | `time`                                                    |
| Extra always-present fields | `pid`, `hostname` (suppressible) | None                 | `name`, `hostname`, `pid`, `time`, `v` (not suppressible) |
| Built-in redaction          | Yes                              | No                   | No                                                        |

### Performance Characteristics (relative)

|                     | Pino                  | Winston            | Bunyan             |
| ------------------- | --------------------- | ------------------ | ------------------ |
| Serialization model | Worker thread (async) | Main thread (sync) | Main thread (sync) |
| Relative throughput | Fastest               | Moderate           | Moderate           |
| Cold start impact   | Minimal               | Low-moderate       | Low-moderate       |

Performance matters most under high log volume. For Lambda functions handling payment transactions at low-to-moderate volume, the difference between Pino and the others is unlikely to be a blocking concern — but Pino's model is inherently safer under burst load.

---

## Recommendation Summary

**For this project (AWS Lambda, CloudWatch, TypeScript, payment transactions), Pino is the strongest choice:**

- Structured JSON by default with no accidental plain-text risk.
- Native redaction for sensitive payment-related fields without extra code.
- Best performance under burst load, important for Lambda cold starts.
- Actively maintained with a large ecosystem.
- `pino-pretty` provides excellent local developer experience with minimal setup.

**Winston is the lowest-friction choice if team familiarity is the top priority:**

- Most developers will already know it.
- String level labels and `message` key are familiar.
- Built-in formatters mean no extra packages for local output.
- The trade-off is manual redaction, slower throughput, and more boilerplate to configure correctly.

**Bunyan should not be selected for new work given its maintenance status:**

- No meaningful updates since 2021 with 230+ open issues.
- Numeric-only level values, non-suppressible extra fields, and no built-in redaction are all friction points for this project's CloudWatch and security requirements.
- Its child logger and serializer patterns influenced both Pino and Winston, so adopting either of those captures the same design benefits with better long-term support.

---

## ADR Reference

The logging decision should be recorded in `docs/architecture/decisions/` (next available number) once the team has aligned. The ADR should cite this comparison document as supporting research for PAY-302.
