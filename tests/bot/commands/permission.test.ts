import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  formatPermissionMode,
  permissionCommand,
} from "../../../src/bot/commands/permission.js";
import {
  handlePermissionSetCallback,
  tryAutoHandlePermission,
} from "../../../src/bot/handlers/permission.js";
import { interactionManager } from "../../../src/interaction/manager.js";
import type { PermissionRequest } from "../../../src/permission/types.js";

const mocked = vi.hoisted(() => {
  const permissionModes: Record<string, string> = {};
  return {
    permissionModes,
    getPermissionMode: vi.fn((scopeKey = "global") => permissionModes[scopeKey] ?? "ask"),
    setPermissionMode: vi.fn((mode: string, scopeKey = "global") => {
      permissionModes[scopeKey] = mode;
    }),
    getCurrentProject: vi.fn(() => ({ id: "p", worktree: "/project" })),
    permissionReplyMock: vi.fn(),
    stopTypingMock: vi.fn(),
  };
});

vi.mock("../../../src/settings/manager.js", () => ({
  getPermissionMode: mocked.getPermissionMode,
  setPermissionMode: mocked.setPermissionMode,
  getCurrentProject: mocked.getCurrentProject,
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: { permission: { reply: mocked.permissionReplyMock } },
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: { clear: vi.fn(), stopTypingIndicator: mocked.stopTypingMock },
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: vi.fn(() => undefined),
  getSessionById: vi.fn(() => undefined),
}));

function createContext(messageId: number): Context {
  return {
    chat: { id: 777, type: "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: messageId }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    api: {
      deleteMessage: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

function createPermissionRequest(): PermissionRequest {
  return {
    id: "req1",
    sessionID: "ses-bash",
    permission: "bash",
    patterns: ["npm run build"],
    metadata: {},
    always: [],
  };
}

function flatTexts(ctx: Context): string[] {
  const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
  const markup = replyArgs[1] as { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } };
  return markup.reply_markup.inline_keyboard.flat().map((button) => button.text);
}

describe("bot/commands/permission", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup");
    Object.keys(mocked.permissionModes).forEach((key) => delete mocked.permissionModes[key]);
    mocked.permissionReplyMock.mockReset();
  });

  it("shows the permissions mode menu and starts the menu interaction", async () => {
    const ctx = createContext(123);
    await permissionCommand({ ...ctx, match: "permission" } as never);

    expect(ctx.reply).toHaveBeenCalledTimes(1);

    const texts = flatTexts(ctx);
    expect(texts).toContain("🔓 Allow all automatically");
    expect(texts).toContain("⛔ Deny all automatically");
    expect(texts).toContain("✅ ❓ Ask each time");

    const state = interactionManager.getSnapshot("chat:777");
    expect(state?.kind).toBe("inline");
    expect(state?.metadata.menuKind).toBe("permission_set");

    const textsWithActiveCheck = flatTexts(ctx);
    expect(textsWithActiveCheck.some((text) => text === "✅ ❓ Ask each time")).toBe(true);
  });

  it("highlights the stored mode with a check", async () => {
    mocked.permissionModes["chat:777"] = "allow_all";

    const ctx = createContext(123);
    await permissionCommand({ ...ctx, match: "permission" } as never);

    const texts = flatTexts(ctx);
    expect(texts.some((text) => text === "✅ 🔓 Allow all automatically")).toBe(true);
  });

  it("updates the permission mode on callback", async () => {
    const scopeKey = "chat:777";
    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: { menuKind: "permission_set", messageId: 321 },
      },
      scopeKey,
    );

    mocked.setPermissionMode.mockClear();

    const ctx = {
      ...createContext(321),
      callbackQuery: { data: "permset:deny_all", message: { message_id: 321 } },
    } as unknown as Context;

    const handled = await handlePermissionSetCallback(ctx);

    expect(handled).toBe(true);
    expect(mocked.setPermissionMode).toHaveBeenCalledWith("deny_all", scopeKey);
    expect(ctx.deleteMessage).toHaveBeenCalledTimes(1);
    expect(interactionManager.getSnapshot(scopeKey)).toBeNull();
  });

  it("returns false for unrelated callbacks", async () => {
    const ctx = {
      ...createContext(1),
      callbackQuery: { data: "permission:none", message: { message_id: 1 } },
    } as unknown as Context;

    const handled = await handlePermissionSetCallback(ctx);
    expect(handled).toBe(false);
  });
});

describe("tryAutoHandlePermission", () => {
  beforeEach(() => {
    Object.keys(mocked.permissionModes).forEach((key) => delete mocked.permissionModes[key]);
    mocked.permissionReplyMock.mockReset();
    mocked.permissionReplyMock.mockResolvedValue({ error: null });
    mocked.getCurrentProject.mockReturnValue({ id: "p", worktree: "/project" });
  });

  it("auto-approves in allow_all mode", async () => {
    mocked.permissionModes["chat:777"] = "allow_all";
    const api = createContext(1).api as unknown as Context["api"];

    const handled = await tryAutoHandlePermission(api, 777, null, createPermissionRequest(), "chat:777");

    expect(handled).toBe(true);
    expect(mocked.permissionReplyMock).toHaveBeenCalledWith({
      requestID: "req1",
      directory: "/project",
      reply: "always",
    });
    expect(api.sendMessage).toHaveBeenCalledWith(
      777,
      expect.stringContaining("Auto-approved"),
      expect.anything(),
    );
  });

  it("auto-rejects in deny_all mode", async () => {
    mocked.permissionModes["chat:777"] = "deny_all";
    const api = createContext(1).api as unknown as Context["api"];

    const handled = await tryAutoHandlePermission(api, 777, null, createPermissionRequest(), "chat:777");

    expect(handled).toBe(true);
    expect(mocked.permissionReplyMock).toHaveBeenCalledWith({
      requestID: "req1",
      directory: "/project",
      reply: "reject",
    });
    expect(api.sendMessage).toHaveBeenCalledWith(
      777,
      expect.stringContaining("Auto-denied"),
      expect.anything(),
    );
  });

  it("returns false in ask mode so the manual flow is used", async () => {
    const api = createContext(1).api as unknown as Context["api"];

    const handled = await tryAutoHandlePermission(api, 777, null, createPermissionRequest(), "chat:777");

    expect(handled).toBe(false);
    expect(mocked.permissionReplyMock).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("returns false when no directory can be resolved", async () => {
    mocked.permissionModes["chat:777"] = "allow_all";
    mocked.getCurrentProject.mockReturnValue(undefined);
    const api = createContext(1).api as unknown as Context["api"];

    const handled = await tryAutoHandlePermission(api, 777, null, createPermissionRequest(), "chat:777");

    expect(handled).toBe(false);
    expect(mocked.permissionReplyMock).not.toHaveBeenCalled();
  });
});

describe("formatPermissionMode", () => {
  it("maps each mode to the localized label", () => {
    expect(formatPermissionMode("ask")).toContain("Ask");
    expect(formatPermissionMode("allow_all")).toContain("Allow");
    expect(formatPermissionMode("deny_all")).toContain("Deny");
  });
});