# PAY-302: Logging Library Comparison — Pino vs Winston vs Bunyan vs AWS Lambda Power Tools

## Purpose

This document compares four logging solutions researched for PAY-302 to support the team's selection decision. Each option has a dedicated implementation plan in this folder. This document focuses on trade-offs relevant to the Payment Portal's context: AWS Lambda, CloudWatch, TypeScript, structured JSON, and developer experience.

---

## At a Glance

|                                 | Pino                                           | Winston                                         | Bunyan                                                    | AWS Lambda Power Tools                           |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| **GitHub stars**                | ~18k                                           | ~23k                                            | ~7k                                                       | ~4k                                              |
| **Maintained by**               | Community                                      | Community                                       | Community (low activity)                                  | AWS                                              |
| **Last active**                 | Active                                         | Active                                          | Low activity (last release 2021)                          | Active                                           |
| **JSON output by default**      | Yes                                            | Requires config                                 | Yes                                                       | Yes                                              |
| **Log levels**                  | trace/debug/info/warn/error/fatal/silent       | error/warn/info/http/verbose/debug/silly        | trace/debug/info/warn/error/fatal                         | debug/info/warn/error/fatal/silent               |
| **Level values in JSON**        | Numbers (configurable to strings)              | Strings (configurable)                          | Numbers only                                              | Numbers only                                     |
| **Message key**                 | `msg`                                          | `message`                                       | `msg`                                                     | `message`                                        |
| **Timestamp key**               | `time`                                         | `timestamp`                                     | `time`                                                    | `timestamp`                                      |
| **Child logger**                | `logger.child()`                               | `logger.child()`                                | `logger.child()`                                          | `logger.createChild()`                           |
| **Built-in redaction**          | Yes (`redact` option, path-based)              | No (manual)                                     | No (manual via serializers)                               | Yes (`maskJsonValues()`)                         |
| **Pretty local output**         | `pino-pretty` (transport, dev dependency)      | Built-in colorize/printf formatters             | `bunyan` CLI (global install)                             | None (always JSON)                               |
| **TypeScript support**          | First-class (`pino` ships types)               | Good (`@types/winston` not needed; ships types) | Types available via `@types/bunyan`                       | First-class (TypeScript-first library)           |
| **Performance**                 | Fastest (offloads formatting to worker thread) | Moderate                                        | Moderate                                                  | Very fast (stderr-only, Lambda-optimized)        |
| **Lambda context auto-inject**  | Manual                                         | Manual                                          | Manual                                                    | Automatic                                        |
| **Extra fields always present** | `pid`, `hostname` (suppressible)               | None beyond what you configure                  | `name`, `hostname`, `pid`, `time`, `v` (not suppressible) | Lambda context fields only (function name, etc.) |

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

### AWS Lambda Power Tools

#### Pros

- **Purpose-built for AWS Lambda** — This is the AWS-maintained official logging library for Lambda. It is designed specifically for the Lambda execution environment with automatic context injection for request IDs, function names, cold starts, and memory allocation.
- **Automatic Lambda context injection** — No manual wiring needed. Power Tools automatically captures `awsRequestId`, `functionName`, `functionVersion`, `memorySize`, and `coldStart` from the Lambda runtime context. This is a major advantage over generic loggers that require explicit context passing.
- **Structured JSON by default** — No configuration needed; JSON output is always enabled. CloudWatch integration is seamless and native.
- **First-class TypeScript support** — The library is TypeScript-first with excellent type definitions and IDE support.
- **Built-in sensitive data redaction** — The `maskJsonValues()` method provides path-based redaction of sensitive fields before serialization.
- **Very fast and Lambda-optimized** — Logs go directly to stderr; no transport layer, no formatters, no worker threads. Minimal overhead on the main thread and optimized for Lambda's execution model.
- **AWS support and maintenance** — Unlike community-maintained libraries, Power Tools is supported and maintained by AWS. Critical security patches are prioritized and deployed rapidly.
- **Zero external dependencies for logging** — The logger works out of the box without requiring `pino-pretty`, `bunyan` CLI, or other external tools.

#### Cons

- **Lock-in to Lambda ecosystem** — This logger is designed specifically for AWS Lambda. If the application ever moves to other runtimes (traditional servers, Kubernetes, etc.), a migration would be required.
- **No alternative output formats** — All output is JSON to stderr. There is no built-in pretty-printing for local development. You must pipe through `jq` or similar CLI tools, or accept raw JSON output locally (less polished than Winston or Pino-with-pino-pretty).
- **Numeric log levels only** — Like Bunyan, Power Tools uses numeric level values in JSON output (`20` for `INFO`). CloudWatch filter expressions must use `level >= 20` rather than string matches.
- **Smaller ecosystem** — While AWS-maintained, the ecosystem and third-party integrations are smaller than Pino or Winston. Custom extensions are less common.
- **Limited to stderr transport** — All logs go to stderr, which is forwarded by Lambda to CloudWatch. There is no mechanism to route logs to multiple destinations (e.g., some logs to a third-party service, others to CloudWatch) without post-processing in CloudWatch itself.
- **Less community documentation** — Although AWS-maintained, community-generated blog posts, examples, and Stack Overflow answers are less abundant than for Pino or Winston.

---

## Side-by-Side Feature Comparison

### Log Level Defaults for This Project

| Environment | Pino default | Winston default | Bunyan default | AWS Lambda Power Tools default |
| ----------- | ------------ | --------------- | -------------- | ------------------------------ |
| local       | info         | info            | info           | info                           |
| test        | error        | error           | error          | error                          |
| development | debug        | debug           | debug          | debug                          |
| staging     | info         | info            | info           | info                           |
| production  | info         | info            | info           | info                           |

All three support `LOG_LEVEL` override in any environment using the same resolution logic.

### Local Developer Experience

|                         | Pino                                 | Winston                        | Bunyan                                    | AWS Lambda Power Tools                   |
| ----------------------- | ------------------------------------ | ------------------------------ | ----------------------------------------- | ---------------------------------------- |
| Pretty output mechanism | `pino-pretty` transport (dev dep)    | Built-in `colorize` + `printf` | `bunyan` CLI (global install)             | Pipe through `jq` or `bunyan` CLI        |
| Setup required          | `npm install --save-dev pino-pretty` | None                           | `npm install -g bunyan`                   | None (but `jq` is recommended)           |
| Output on by default    | No (must configure transport)        | Yes                            | Yes (JSON piped to CLI)                   | Yes (raw JSON to stderr)                 |
| Color support           | Yes (via pino-pretty)                | Yes (via colorize format)      | Yes (via CLI)                             | No (pipe to jq/bunyan for color)         |
| Field filtering         | No built-in (CLI tooling external)   | No built-in                    | Yes (`bunyan -c 'this.field == "value"'`) | Yes (`jq 'select(.feeId == "FEE-001")'`) |

### CloudWatch Queryability (Staging/Production)

|                             | Pino                             | Winston              | Bunyan                                                    | AWS Lambda Power Tools                                    |
| --------------------------- | -------------------------------- | -------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| JSON by default             | Yes                              | No (requires config) | Yes                                                       | Yes                                                       |
| Message key                 | `msg`                            | `message`            | `msg`                                                     | `message`                                                 |
| Level in JSON               | Number or string (configurable)  | String               | Number only                                               | Number only                                               |
| Timestamp key               | `time`                           | `timestamp`          | `time`                                                    | `timestamp`                                               |
| Extra always-present fields | `pid`, `hostname` (suppressible) | None                 | `name`, `hostname`, `pid`, `time`, `v` (not suppressible) | Lambda context only (`function_name`, `request_id`, etc.) |
| Built-in redaction          | Yes                              | No                   | No                                                        | Yes                                                       |
| Automatic Lambda context    | No (manual)                      | No (manual)          | No (manual)                                               | Yes (automatic from Lambda runtime)                       |

### Performance Characteristics (relative)

|                     | Pino                  | Winston            | Bunyan             | AWS Lambda Power Tools |
| ------------------- | --------------------- | ------------------ | ------------------ | ---------------------- |
| Serialization model | Worker thread (async) | Main thread (sync) | Main thread (sync) | Main thread (sync)     |
| Relative throughput | Fastest               | Moderate           | Moderate           | Very fast              |
| Cold start impact   | Minimal               | Low-moderate       | Low-moderate       | Minimal                |

Performance matters most under high log volume. For Lambda functions handling payment transactions at low-to-moderate volume, the difference between Pino and the others is unlikely to be a blocking concern — but Pino's and AWS Lambda Power Tools' models are inherently safer under burst load. AWS Lambda Power Tools has zero transport overhead by design.

---

## Recommendation Summary

**For this project (AWS Lambda, CloudWatch, TypeScript, payment transactions), Pino is the strongest choice:**

- Structured JSON by default with no accidental plain-text risk.
- Native redaction for sensitive payment-related fields without extra code.
- Best performance under burst load, important for Lambda cold starts.
- Actively maintained with a large ecosystem.
- `pino-pretty` provides excellent local developer experience with minimal setup.

**AWS Lambda Power Tools is the most Lambda-optimized choice if ecosystem lock-in is acceptable:**

- Purpose-built for AWS Lambda with automatic context injection (no manual wiring needed).
- AWS-maintained with priority security patches and long-term support guarantees.
- Zero transport overhead; very fast serialization.
- Seamless CloudWatch integration without custom configuration.
- Built-in redaction for sensitive fields.
- The trade-off is lock-in to Lambda (less portable to other runtimes) and no alternative output formats for local development.

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
