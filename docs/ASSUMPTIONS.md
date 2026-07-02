# Assumptions & Trade-offs

This is a companion to `ARCHITECTURE.md`. Anything cut for time is recorded
here with the production alternative named explicitly — nothing is silently
missing.

## Product assumptions

- Single currency (INR), no payment/escrow integration — auctions determine
  a winner; settlement is out of scope.
- No KYC — registration is email/password only. A real auction platform
  handling money would need identity verification before allowing bids.
- One motorcycle per auction, no bundled lots or reserve-price-not-met
  re-listing flow.
- Bid increments: fixed minimum increment (e.g. ₹500) rather than a
  dynamic increment curve — simpler rule, stated explicitly so it's not
  mistaken for an oversight.
- No "soft close" / anti-sniping auto-extension when a bid lands in the
  final seconds. This is a common real-auction-platform feature and a
  natural v2 addition; not implemented here because it meaningfully
  complicates the closing-worker logic (the end time becomes mutable during
  the LIVE window) and wasn't worth the risk under a 12-hour timebox.

## Engineering trade-offs made under time pressure

| Area | What was cut | Production alternative |
|---|---|---|
| Socket server | Runs in-process with Next.js | Separate persistent-process service + Socket.io Redis adapter for horizontal scale |
| Test coverage | Concurrency-critical paths covered; not exhaustive coverage of every CRUD endpoint | Full coverage pass, contract tests for API |
| Rate limiting | Redis token-bucket on the bid endpoint only | Apply consistently across all mutating endpoints, tune thresholds from real traffic |
| Observability | Structured logs + audit table + metrics endpoint stubbed | Full Prometheus/Grafana stack, alerting rules, distributed tracing (OpenTelemetry) wired to a real collector |
| CI/CD | GitHub Actions workflow file included | Not necessarily verified against a live repo/secrets in this session |
| Prisma schema location | Single schema in `apps/web/prisma`, copied into the worker's Docker build context | A `packages/db` shared workspace with its own build step — cleaner, but more moving parts than the timebox justified for one shared file |
| Image handling | Motorcycle images assumed to be URLs (external host or placeholder) | Direct upload to S3/Cloudinary with signed URLs, image processing pipeline |
| Auth | Credentials-based (email/password via Auth.js) | Add OAuth providers, 2FA for admin accounts given money is involved |
| Multi-region | Not addressed | Postgres read replicas, Redis cluster, CDN for static assets |

## Why these particular corners, and not others

The concurrency-safe bid transaction, the audit log, and the auction
lifecycle worker were treated as non-negotiable — they're the parts of the
system that are actually hard to retrofit and are what "production-grade"
concretely means for an auction platform (money-adjacent correctness).
UI polish, exhaustive test coverage, and infra automation are comparatively
cheap to add later and were the first things deprioritized when time ran
short.
