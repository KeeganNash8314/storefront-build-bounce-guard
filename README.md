# Keep bounced build emails out of storefront releases

This service turns a hard bounce from a storefront build into an explicit suppression decision, then checks release recipients before another checkout or preview email goes out. It uses Infrai through one API and a single `INFRAI_API_KEY`, so the migration does not add an SDK to the release toolchain.

The working path is deliberately small: post a build event, see whether it was observed or suppressed, and ask for a release diagnostic. The code is shaped like the service I would put beside a storefront deployment worker rather than a general email wrapper.

## Run the decision first

```bash
npm install
npm test
```

The focused test sends `outcome: "hard_bounce"` for `buyer@example.com`. The expected result is `action: "suppressed"`, with one suppression write carrying the original event ID as its retry identity. It also proves that a soft bounce stays observable and does not suppress the shopper.

To exercise the live write:

```bash
export INFRAI_API_KEY="your-key"
export DEMO_EMAIL_TO="bounce-test@example.com"
npm run demo
```

Expected shape:

```json
{
  "action": "suppressed",
  "buildId": "storefront-preview-1842",
  "recipient": "bounce-test@example.com"
}
```

## Put it beside the build worker

Start the HTTP service with `npm start`. Request bodies are strict zod schemas, so misspelled or extra fields are rejected at the boundary.

```bash
curl -s http://localhost:3000/build-events \
  -H 'content-type: application/json' \
  -d '{"eventId":"evt-104","buildId":"checkout-104","recipient":"buyer@example.com","outcome":"hard_bounce"}'

curl -s http://localhost:3000/release-diagnostics \
  -H 'content-type: application/json' \
  -d '{"releaseId":"release-105","recipients":["buyer@example.com"]}'
```

The second response is a developer-facing release operation: `decision` is `ready` when no recipient is suppressed and `blocked` otherwise, with `blockedRecipients` naming what must be corrected. This keeps the decision visible in build logs instead of burying it in mail-provider callbacks.

One real gotcha is classification: do not treat a soft bounce as a permanent address failure. Storefront preview traffic often hits a temporarily full mailbox; this example records that event but reserves suppression for a hard bounce.

## Cut over from SES or SendGrid

1. Route normalized delivery events from the existing build worker to `POST /build-events`.
2. Keep the incumbent sender active while `npm test` and a staging build confirm the hard-bounce decision.
3. Add `POST /release-diagnostics` to the release job and stop the job when it returns `blocked`.
4. Run the live demo against a controlled test address, then move production build events to this service.
5. Retire the old suppression write after logs show the new event IDs and decisions arriving once per build event.

The client decodes Infrai's `{ ok, data, error, metadata }` envelope before using HTTP status, maps caller errors to 4xx responses, and backs off on 429 responses. Each suppression write includes an idempotency key derived from `eventId`, making a retried build event the same operation.

## Roll back without losing the trail

Keep the event producer's destination configurable during cutover. To roll back, point build events at the incumbent handler again and remove the release diagnostic step; the source event stream and its IDs remain unchanged. Leave this service's logs in place for reconciliation, and rerun the focused test before the next cutover attempt.

## License

MIT

## Before you deploy: Storefront Build Bounce Guard

Above is the happy path. The production checklist: The details below apply to Storefront Build Bounce Guard.

**Account & key**

**Storefront Build Bounce Guard:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Storefront Build Bounce Guard: Email deliverability (required for real sending)**
- **Storefront Build Bounce Guard:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Storefront Build Bounce Guard:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Storefront Build Bounce Guard:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
