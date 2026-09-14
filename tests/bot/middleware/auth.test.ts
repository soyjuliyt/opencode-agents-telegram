import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, NextFunction } from "grammy";

vi.mock("../../../src/runtime/bootstrap.js", () => ({
  persistOwnerUserId: vi.fn().mockResolvedValue(undefined),
}));

const { persistOwnerUserId } = await import("../../../src/runtime/bootstrap.js");

function stubBaseEnv(extra: Record<string, string> = {}) {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:test-secret");
  vi.stubEnv("OPENCODE_MODEL_PROVIDER", "opencode");
  vi.stubEnv("OPENCODE_MODEL_ID", "big-pickle");
  for (const [key, value] of Object.entries(extra)) {
    vi.stubEnv(key, value);
  }
}

function createContext(overrides: Partial<Context>): Context {
  const ctx = {
    from: { id: 42 },
    chat: { id: 42, type: "private" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      setMyCommands: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as Context;
  return ctx;
}

async function loadAuth() {
  vi.resetModules();
  return (await import("../../../src/bot/middleware/auth.js")).authMiddleware;
}

describe("authMiddleware onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adopts the first DM sender as owner and persists the user id", async () => {
    stubBaseEnv({ TELEGRAM_ALLOWED_USER_ID: "" });
    const auth = await loadAuth();
    const ctx = createContext({});
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);

    await auth(ctx, next);

    expect(persistOwnerUserId).toHaveBeenCalledWith(42);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("updates the in-memory config so the adopted owner is immediately authorized", async () => {
    stubBaseEnv({ TELEGRAM_ALLOWED_USER_ID: "" });
    const auth = await loadAuth();
    const ctx = createContext({});
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);

    await auth(ctx, next);

    const { config } = await import("../../../src/config.js");
    expect(config.telegram.allowedUserId).toBe(42);
  });

  it("ignores non-DM updates while waiting for owner adoption", async () => {
    stubBaseEnv({ TELEGRAM_ALLOWED_USER_ID: "" });
    const auth = await loadAuth();
    const ctx = createContext({ from: undefined, chat: { id: -1001, type: "supergroup" } });
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);

    await auth(ctx, next);

    expect(persistOwnerUserId).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("grants access normally once an owner is configured", async () => {
    stubBaseEnv({ TELEGRAM_ALLOWED_USER_ID: "42" });
    const auth = await loadAuth();
    const ctx = createContext({});
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);

    await auth(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ignores unauthorized users once an owner is configured", async () => {
    stubBaseEnv({ TELEGRAM_ALLOWED_USER_ID: "42" });
    const auth = await loadAuth();
    const ctx = createContext({ from: { id: 7 }, chat: { id: 999, type: "private" } });
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);

    await auth(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.api.setMyCommands).toHaveBeenCalled();
  });
});