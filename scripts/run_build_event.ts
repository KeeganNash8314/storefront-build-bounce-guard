import { handleBuildMailEvent } from "../src/build_bounce_service.js";
import { createInfraiEmail } from "../src/infrai_email.js";

const recipient = process.env.DEMO_EMAIL_TO;
if (!recipient) throw new Error("DEMO_EMAIL_TO is required");

const result = await handleBuildMailEvent(
  {
    eventId: `demo-${Date.now()}`,
    buildId: "storefront-preview-1842",
    recipient,
    outcome: "hard_bounce",
  },
  createInfraiEmail(),
);

console.log(JSON.stringify(result, null, 2));
