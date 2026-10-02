import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { diagnoseRelease, handleBuildMailEvent } from "./build_bounce_service.js";
import { createInfraiEmail, InfraiError } from "./infrai_email.js";

const buildEventBody = z.object({
  eventId: z.string().min(1),
  buildId: z.string().min(1),
  recipient: z.string().email(),
  outcome: z.enum(["delivered", "soft_bounce", "hard_bounce"]),
}).strict();

const releaseBody = z.object({
  releaseId: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(100),
}).strict();

export function createReleaseDiagnostics(api = createInfraiEmail()) {
  const service = express();
  service.use(express.json({ limit: "32kb" }));

  service.post("/build-events", async (request, response, next) => {
    try {
      const event = buildEventBody.parse(request.body);
      response.status(202).json(await handleBuildMailEvent(event, api));
    } catch (error) {
      next(error);
    }
  });

  service.post("/release-diagnostics", async (request, response, next) => {
    try {
      const operation = releaseBody.parse(request.body);
      response.json(await diagnoseRelease(operation.releaseId, operation.recipients, api));
    } catch (error) {
      next(error);
    }
  });

  service.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: "email_request_rejected", detail: error.detail });
      return;
    }
    response.status(502).json({ error: "email_transport_error" });
  });

  return service;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  createReleaseDiagnostics().listen(port, () => {
    console.log(`release diagnostics listening on http://localhost:${port}`);
  });
}
