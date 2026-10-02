import type { InfraiEmail } from "./infrai_email.js";

export type BuildMailEvent = {
  eventId: string;
  buildId: string;
  recipient: string;
  outcome: "delivered" | "soft_bounce" | "hard_bounce";
};

export type BuildEventDecision =
  | { action: "suppressed"; buildId: string; recipient: string }
  | { action: "observed"; buildId: string; recipient: string };

export async function handleBuildMailEvent(
  event: BuildMailEvent,
  emailApi: InfraiEmail,
): Promise<BuildEventDecision> {
  if (event.outcome !== "hard_bounce") {
    return { action: "observed", buildId: event.buildId, recipient: event.recipient };
  }

  await emailApi.email.suppression.add(event.recipient, event.eventId);
  return { action: "suppressed", buildId: event.buildId, recipient: event.recipient };
}

export async function diagnoseRelease(
  releaseId: string,
  recipients: string[],
  emailApi: InfraiEmail,
) {
  const checks = await Promise.all(
    recipients.map(async (email) => {
      const entry = await emailApi.email.suppression.check(email);
      return { email, suppressed: entry.suppressed };
    }),
  );
  const blockedRecipients = checks.filter((check) => check.suppressed).map((check) => check.email);
  return {
    releaseId,
    decision: blockedRecipients.length === 0 ? "ready" as const : "blocked" as const,
    blockedRecipients,
  };
}
