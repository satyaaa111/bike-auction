import pino from "pino";

// Structured, JSON logging so it's grep/query-able in any log aggregator
// (Datadog, CloudWatch, Loki, etc.) without a parsing step.
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "auction-web" },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.passwordHash"],
});

// Every request handler wraps its logger.child({ correlationId }) so a
// single bid's lifecycle (HTTP request -> DB transaction -> Redis publish
// -> socket broadcast -> audit log) can be traced with one grep.
export function withCorrelation(correlationId: string) {
  return logger.child({ correlationId });
}
