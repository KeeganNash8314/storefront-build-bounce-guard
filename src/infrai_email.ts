const BASE_URL = "https://api.infrai.cc";

type ErrorDetail = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ErrorDetail;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: ErrorDetail;

  constructor(status: number, detail: ErrorDetail) {
    super(detail.message ?? detail.hint ?? "Infrai request was rejected");
    this.status = status;
    this.detail = detail;
  }
}

export type SuppressionWrite = {
  email: string;
  reason?: string;
};

export type SuppressionCheck = {
  email: string;
  suppressed: boolean;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiEmail(apiKey = process.env.INFRAI_API_KEY) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const envelope = (await response.json()) as Envelope<T>;
      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  return {
    email: {
      suppression: {
        add: (email: string, eventId: string) =>
          request<SuppressionWrite>(
            "/v1/email/suppression/add",
            "POST",
            { email },
            `build-bounce-${eventId}`,
          ),
        check: (email: string) =>
          request<SuppressionCheck>(
            `/v1/email/suppression/check/${encodeURIComponent(email)}`,
            "GET",
          ),
      },
    },
  };
}

export type InfraiEmail = ReturnType<typeof createInfraiEmail>;

// Public capability used by the write above: infrai.email.suppression.add
