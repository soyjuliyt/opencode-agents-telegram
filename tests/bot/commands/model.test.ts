import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  handleModelAllPageCallback,
  modelCommand,
} from "../../../src/bot/commands/model.js";
import { interactionManager } from "../../../src/interaction/manager.js";

const mocked = vi.hoisted(() => ({
  allModels: [] as Array<{ providerID: string; modelID: string }>,
  currentModel: { providerID: "openrouter", modelID: "free", variant: "default" },
  getAllAvailableModelsMock: vi.fn(),
  fetchCurrentModelMock: vi.fn(),
}));

vi.mock("../../../src/model/manager.js", () => ({
  getAllAvailableModels: mocked.getAllAvailableModelsMock,
  fetchCurrentModel: mocked.fetchCurrentModelMock,
}));

function createContext(messageId: number): Context {
  return {
    chat: { id: 777, type: "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: messageId }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    api: {
      deleteMessage: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

describe("bot/commands/model", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup");
    mocked.allModels = [
      { providerID: "openrouter", modelID: "free" },
      { providerID: "openrouter", modelID: "gpt-4o" },
      { providerID: "auto", modelID: "best-free" },
      { providerID: "opencode", modelID: "big-pickle" },
    ];
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);
    mocked.fetchCurrentModelMock.mockReturnValue(mocked.currentModel);
  });

  it("shows all models and starts inline menu interaction", async () => {
    const ctx = createContext(123);
    await modelCommand({ ...ctx, match: "model" } as never);

    expect(mocked.getAllAvailableModelsMock).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledTimes(1);

    const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    const text = replyArgs[0] as string;
    const markup = replyArgs[1] as { reply_markup: { inline_keyboard: unknown[][] } };

    expect(text).toContain("openrouter/free");

    const flatButtons = markup.reply_markup.inline_keyboard.flat();
    const modelButtons = flatButtons.map((button) => (button as { text: string }).text);
    expect(modelButtons).toContain("openrouter / free");
    expect(modelButtons).toContain("auto / best-free");

    for (const button of flatButtons as Array<{ text: string; callback_data?: string }>) {
      if (button.callback_data?.startsWith("model:")) {
        expect(button.callback_data).toMatch(/^model:mp:[a-z0-9]+$/);
        expect(button.callback_data.length).toBeLessThanOrEqual(64);
      }
    }

    const state = interactionManager.getSnapshot("chat:777");
    expect(state?.kind).toBe("inline");
    expect(state?.metadata.menuKind).toBe("model");
  });

  it("paginates when models exceed page size", async () => {
    mocked.allModels = Array.from({ length: 25 }, (_, index) => ({
      providerID: "provider",
      modelID: `model-${index}`,
    }));
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);

    const ctx = createContext(1);
    await modelCommand({ ...ctx, match: "model" } as never);

    const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    const markup = replyArgs[1] as { reply_markup: { inline_keyboard: unknown[][] } };
    const flatButtons = markup.reply_markup.inline_keyboard.flat();
    const texts = flatButtons.map((button) => (button as { text: string }).text);

    expect(texts).toContain("Next ➡️");
    expect(texts).not.toContain("Prev");
  });

  it("replies with empty message when no models available", async () => {
    mocked.getAllAvailableModelsMock.mockResolvedValue([]);

    const ctx = createContext(5);
    await modelCommand({ ...ctx, match: "model" } as never);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(text).toContain("No available models");
    expect(interactionManager.getSnapshot()).toBeNull();
  });

  it("edits message on page callback", async () => {
    mocked.allModels = Array.from({ length: 25 }, (_, index) => ({
      providerID: "provider",
      modelID: `model-${index}`,
    }));
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);

    const scopeKey = "chat:777";
    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: { menuKind: "model", messageId: 321 },
      },
      scopeKey,
    );

    const ctx = {
      ...createContext(321),
      callbackQuery: { data: "modelall:page:1", message: { message_id: 321 } },
    } as unknown as Context;

    const handled = await handleModelAllPageCallback(ctx);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const text = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(text).toContain("Page 2 of");
  });

  it("returns false for unrelated callbacks", async () => {
    const ctx = {
      ...createContext(1),
      callbackQuery: { data: "model:openrouter:free", message: { message_id: 1 } },
    } as unknown as Context;

    const handled = await handleModelAllPageCallback(ctx);
    expect(handled).toBe(false);
  });
});