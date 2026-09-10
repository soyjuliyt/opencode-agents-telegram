import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, InlineKeyboard } from "grammy";
import { buildModelSelectionMenu } from "../../../src/bot/handlers/model.js";
import { handleModelAllPageCallback } from "../../../src/bot/commands/model.js";
import type { ModelSelectionLists } from "../../../src/model/types.js";
import { interactionManager } from "../../../src/interaction/manager.js";

const mocked = vi.hoisted(() => ({
  allModels: [] as Array<{ providerID: string; modelID: string }>,
  getAllAvailableModelsMock: vi.fn(),
}));

vi.mock("../../../src/model/manager.js", () => ({
  getAllAvailableModels: mocked.getAllAvailableModelsMock,
  selectModel: vi.fn(),
  fetchCurrentModel: vi.fn(() => ({ providerID: "opencode", modelID: "big-pickle", variant: "default" })),
  getModelSelectionLists: vi.fn(),
  getStoredModel: vi.fn(),
}));

function getFlatButtons(keyboard: InlineKeyboard): Array<{ text: string; callback_data?: string }> {
  return keyboard.inline_keyboard.flat() as Array<{ text: string; callback_data?: string }>;
}

describe("buildModelSelectionMenu", () => {
  beforeEach(() => {
    mocked.allModels = [];
    mocked.getAllAvailableModelsMock.mockResolvedValue([]);
  });

  it("includes a Models button that opens the all-models list", async () => {
    const modelLists: ModelSelectionLists = {
      favorites: [{ providerID: "opencode", modelID: "big-pickle" }],
      recent: [],
    };

    const keyboard = await buildModelSelectionMenu(undefined, modelLists);
    const buttons = getFlatButtons(keyboard);

    const modelsButton = buttons.find((button) => button.callback_data === "modelall:page:0");
    expect(modelsButton).toBeDefined();
    expect(modelsButton?.text).toBe("📋 Models");
  });

  it("adds the Models button when favorites is empty but recent has entries", async () => {
    const modelLists: ModelSelectionLists = {
      favorites: [],
      recent: [{ providerID: "openrouter", modelID: "free" }],
    };

    const keyboard = await buildModelSelectionMenu(undefined, modelLists);
    const buttons = getFlatButtons(keyboard);

    expect(buttons.some((button) => button.callback_data === "modelall:page:0")).toBe(true);
  });
});

describe("handleModelAllPageCallback via Models button", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup");
    mocked.allModels = [
      { providerID: "openrouter", modelID: "free" },
      { providerID: "opencode", modelID: "big-pickle" },
      { providerID: "auto", modelID: "best-free" },
    ];
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);
  });

  it("replaces the favorites menu with the all-models page", async () => {
    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: { menuKind: "model", messageId: 321 },
      },
      "chat:777",
    );

    const ctx = {
      chat: { id: 777, type: "supergroup" },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      callbackQuery: { data: "modelall:page:0", message: { message_id: 321 } },
    } as unknown as Context;

    const handled = await handleModelAllPageCallback(ctx);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const text = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(text).toContain("All models");
  });
});