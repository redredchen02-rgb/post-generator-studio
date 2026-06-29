import type {
  ContentPort,
  HotspotOptions,
  HotspotPort,
  HotspotSidecarHealth,
  ScoringPort,
} from "@/domain/ports/hotspot-port";
import {
  AppErrorException,
  contentVerdictSchema,
  hotspotAlertsSchema,
  localScoreSchema,
  type ContentVerdict,
  type HotspotAlert,
  type LocalScore,
} from "@/domain/schemas";
import {
  getContentImageTimeoutMs,
  getContentVideoTimeoutMs,
  getHotspotSidecarSecret,
  getHotspotSidecarUrl,
  getScoringTimeoutMs,
} from "@/infrastructure/config/hotspot-sidecar";
import { z } from "zod";

// Validated wire shape of the sidecar's GET /health, so a contract drift surfaces as
// a structured error instead of silent `undefined` field access (parity with the
// safeParse used by score/processSnapshot/analyze).
const healthWireSchema = z.object({
  status: z.string(),
  version: z.string(),
  capabilities: z.object({
    scoring: z.boolean(),
    hotspot: z.boolean(),
    content: z.boolean(),
    telegram: z.boolean(),
  }),
});
import { classifyFetchFailure, combineSignals } from "@/infrastructure/http/with-timeout";

/**
 * Thin HTTP client for the hotspot-sdk FastAPI sidecar. NOT a BaseAdapter subclass —
 * these are synchronous request/response calls, not streaming. Reuses only the
 * domain-neutral timeout/cancel helpers from with-timeout.ts.
 *
 * One class fronts the whole sidecar (scoring today; hotspot/content extend it
 * later) since it is a single service with one health endpoint and one auth gate.
 */
export class HotspotAdapter implements ScoringPort, HotspotPort, ContentPort {
  protected async call<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
    options: HotspotOptions | undefined,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = combineSignals(options?.abortSignal, timeout);
    const secret = getHotspotSidecarSecret();

    let response: Response;
    try {
      response = await fetch(`${getHotspotSidecarUrl()}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-api-key": secret } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw this.fetchError(err, options?.abortSignal, timeout);
    }
    return this.parse<T>(response);
  }

  protected fetchError(
    err: unknown,
    userSignal: AbortSignal | undefined,
    timeout: AbortSignal,
  ): AppErrorException {
    const kind = classifyFetchFailure(userSignal, timeout);
    if (kind === "cancelled") {
      return new AppErrorException({ code: "SIDECAR_CANCELLED", message: "热点边车请求被取消" });
    }
    if (kind === "timeout") {
      return new AppErrorException({ code: "SIDECAR_TIMEOUT", message: "热点边车请求超时", retryable: true });
    }
    return new AppErrorException({
      code: "SIDECAR_UNAVAILABLE",
      message: "无法连接热点边车（hotspot sidecar 未启动？）",
      retryable: true,
      details: { cause: err instanceof Error ? err.message : String(err) },
    });
  }

  protected async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      // A 401 means the shared secret is missing/mismatched — surface it as a
      // distinct, diagnosable code rather than burying it under "unavailable".
      if (response.status === 401) {
        throw new AppErrorException({
          code: "SIDECAR_AUTH_FAILED",
          message: "热点边车认证失败（HOTSPOT_SIDECAR_SECRET 未设或不匹配）",
        });
      }
      let code = "SIDECAR_ERROR";
      let message = `热点边车返回 ${response.status}`;
      try {
        const data = (await response.json()) as { code?: string; message?: string; detail?: string };
        if (data.code) code = data.code;
        if (data.message) message = data.message;
        else if (data.detail) message = data.detail;
      } catch {
        /* non-JSON error body — keep defaults */
      }
      throw new AppErrorException({
        code,
        message,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "热点边车返回了无法解析的响应" });
    }
  }

  async health(options?: HotspotOptions): Promise<HotspotSidecarHealth> {
    const timeout = AbortSignal.timeout(5_000);
    const signal = combineSignals(options?.abortSignal, timeout);
    const secret = getHotspotSidecarSecret();
    let response: Response;
    try {
      response = await fetch(`${getHotspotSidecarUrl()}/health`, {
        headers: secret ? { "x-api-key": secret } : {},
        signal,
      });
    } catch (err) {
      throw this.fetchError(err, options?.abortSignal, timeout);
    }
    const raw = await this.parse<unknown>(response);
    const parsed = healthWireSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "健康检查结构非预期" });
    }
    return {
      ok: parsed.data.status === "ok",
      version: parsed.data.version,
      capabilities: parsed.data.capabilities,
    };
  }

  async score(text: string, options?: HotspotOptions): Promise<LocalScore> {
    const raw = await this.call<unknown>("/score", { text }, getScoringTimeoutMs(), options);
    const parsed = localScoreSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "评分结果结构非预期" });
    }
    return parsed.data;
  }

  async processSnapshot(
    ranking: Record<string, number>,
    options?: HotspotOptions,
  ): Promise<HotspotAlert[]> {
    const raw = await this.call<unknown>("/hotspot/snapshot", { ranking }, getScoringTimeoutMs(), options);
    const parsed = hotspotAlertsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "热点告警结构非预期" });
    }
    return parsed.data;
  }

  async analyze(
    absPath: string,
    kind: "image" | "video",
    options?: HotspotOptions,
  ): Promise<ContentVerdict[]> {
    const timeoutMs = kind === "video" ? getContentVideoTimeoutMs() : getContentImageTimeoutMs();
    const raw = await this.call<unknown>("/content/analyze", { path: absPath, kind }, timeoutMs, options);
    // Image returns a single verdict object; video returns a list of frame verdicts.
    const schema = kind === "video" ? z.array(contentVerdictSchema) : contentVerdictSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "内容检测结构非预期" });
    }
    return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  }
}
