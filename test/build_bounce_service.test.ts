import assert from "node:assert/strict";
import test from "node:test";
import { handleBuildMailEvent } from "../src/build_bounce_service.js";
import type { InfraiEmail } from "../src/infrai_email.js";

test("a hard bounce suppresses the checkout recipient with the event id", async () => {
  const writes: Array<{ email: string; eventId: string }> = [];
  const fakeApi = {
    email: {
      suppression: {
        add: async (email: string, eventId: string) => {
          writes.push({ email, eventId });
          return { email };
        },
        check: async (email: string) => ({ email, suppressed: true }),
      },
    },
  } satisfies InfraiEmail;

  const result = await handleBuildMailEvent(
    {
      eventId: "evt-build-42",
      buildId: "checkout-preview-42",
      recipient: "buyer@example.com",
      outcome: "hard_bounce",
    },
    fakeApi,
  );

  assert.deepEqual(writes, [{ email: "buyer@example.com", eventId: "evt-build-42" }]);
  assert.deepEqual(result, {
    action: "suppressed",
    buildId: "checkout-preview-42",
    recipient: "buyer@example.com",
  });
});

test("a soft bounce remains observable without suppressing the recipient", async () => {
  let addCalls = 0;
  const fakeApi = {
    email: {
      suppression: {
        add: async (email: string) => {
          addCalls += 1;
          return { email };
        },
        check: async (email: string) => ({ email, suppressed: true }),
      },
    },
  } satisfies InfraiEmail;

  const result = await handleBuildMailEvent(
    {
      eventId: "evt-build-43",
      buildId: "checkout-preview-43",
      recipient: "buyer@example.com",
      outcome: "soft_bounce",
    },
    fakeApi,
  );

  assert.equal(addCalls, 0);
  assert.equal(result.action, "observed");
});
