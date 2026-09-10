import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  handleModelProvidersCallback,
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

const MOCK_MENU_MESSAGE_ID = 321;

type FlatButton = { text: string; callback_data?: string };

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

function getReplyButtons(ctx: Context): FlatButton[] {
  const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
  const markup = replyArgs[1] as { reply_markup: { inline_keyboard: unknown[][] } };
  return markup.reply_markup.inline_keyboard.flat() as FlatButton[];
}

function getEditedButtons(ctx: Context): FlatButton[] {
  const editArgs = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
  const markup = editArgs[1] as { reply_markup: { inline_keyboard: unknown[][] } };
  return markup.reply_markup.inline_keyboard.flat() as FlatButton[];
}

function getEditedText(ctx: Context): string {
  return (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
}

function startActiveModelMenu(): void {
  interactionManager.start(
    {
      kind: "inline",
      expectedInput: "callback",
      metadata: { menuKind: "model", messageId: MOCK_MENU_MESSAGE_ID },
    },
    "chat:777",
  );
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

  it("shows the providers list and starts inline menu interaction", async () => {
    const ctx = createContext(123);
    await modelCommand({ ...ctx, match: "model" } as never);

    expect(mocked.getAllAvailableModelsMock).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledTimes(1);

    const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    const text = replyArgs[0] as string;
    expect(text).toContain("openrouter/free");
    expect(text).toContain("Providers");

    const buttons = getReplyButtons(ctx);
    const texts = buttons.map((button) => button.text);
    expect(texts).toContain("openrouter");
    expect(texts).toContain("auto");
    expect(texts).toContain("opencode");

    for (const button of buttons) {
      if (button.callback_data?.startsWith("modelprov:sel:")) {
        expect(button.callback_data.length).toBeLessThanOrEqual(64);
      }
    }

    const state = interactionManager.getSnapshot("chat:777");
    expect(state?.kind).toBe("inline");
    expect(state?.metadata.menuKind).toBe("model");
  });

  it("paginates the providers list when it exceeds the page size", async () => {
    mocked.allModels = Array.from({ length: 25 }, (_, index) => ({
      providerID: `provider-${index}`,
      modelID: "model-a",
    }));
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);

    const ctx = createContext(1);
    await modelCommand({ ...ctx, match: "model" } as never);

    const texts = getReplyButtons(ctx).map((button) => button.text);
    expect(texts).toContain("Next ➡️");
    expect(texts).not.toContain("Prev");
  });

  it("replies with empty message when no models are available", async () => {
    mocked.getAllAvailableModelsMock.mockResolvedValue([]);

    const ctx = createContext(5);
    await modelCommand({ ...ctx, match: "model" } as never);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(text).toContain("No available models");
    expect(interactionManager.getSnapshot()).toBeNull();
  });

  it("shows the selected provider's models", async () => {
    startActiveModelMenu();
    const ctx = createContext(MOCK_MENU_MESSAGE_ID);
    await modelCommand({ ...ctx, match: "model" } as never);

    const providersButton = getReplyButtons(ctx).find(
      (button) => button.callback_data?.startsWith("modelprov:sel:"),
    );
    expect(providersButton).toBeDefined();

    const selectCtx = {
      ...createContext(MOCK_MENU_MESSAGE_ID),
      callbackQuery: {
        data: providersButton?.callback_data,
        message: { message_id: MOCK_MENU_MESSAGE_ID },
      },
    } as unknown as Context;

    const handled = await handleModelProvidersCallback(selectCtx);

    expect(handled).toBe(true);
    expect(selectCtx.editMessageText).toHaveBeenCalledTimes(1);
    expect(getEditedText(selectCtx)).toContain("models");

    const modelButtons = getEditedButtons(selectCtx).filter(
      (button) => button.callback_data?.startsWith("model:mp:"),
    );
    expect(modelButtons.length).toBeGreaterThan(0);

    const backButton = getEditedButtons(selectCtx).find(
      (button) => button.callback_data === "modelprov:back",
    );
    expect(backButton).toBeDefined();
  });

  it("edits the message when paginating the providers list", async () => {
    mocked.allModels = Array.from({ length: 25 }, (_, index) => ({
      providerID: `provider-${index}`,
      modelID: "model-a",
    }));
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);

    startActiveModelMenu();
    const ctx = {
      ...createContext(MOCK_MENU_MESSAGE_ID),
      callbackQuery: {
        data: "modelprov:page:1",
        message: { message_id: MOCK_MENU_MESSAGE_ID },
      },
    } as unknown as Context;

    const handled = await handleModelProvidersCallback(ctx);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    expect(getEditedText(ctx)).toContain("Page 2 of");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("paginates the models of a selected provider", async () => {
    mocked.allModels = Array.from({ length: 25 }, (_, index) => ({
      providerID: "openrouter",
      modelID: `model-${index}`,
    }));
    mocked.getAllAvailableModelsMock.mockResolvedValue(mocked.allModels);

    startActiveModelMenu();
    const ctx = createContext(MOCK_MENU_MESSAGE_ID);
    await modelCommand({ ...ctx, match: "model" } as never);

    const providersButton = getReplyButtons(ctx).find(
      (button) => button.callback_data?.startsWith("modelprov:sel:"),
    );
    expect(providersButton).toBeDefined();

    const selectCtx = {
      ...createContext(MOCK_MENU_MESSAGE_ID),
      callbackQuery: {
        data: providersButton?.callback_data,
        message: { message_id: MOCK_MENU_MESSAGE_ID },
      },
    } as unknown as Context;
    await handleModelProvidersCallback(selectCtx);

    const nextButton = getEditedButtons(selectCtx).find(
      (button) => button.callback_data?.startsWith("modelprov:pg:"),
    );
    expect(nextButton).toBeDefined();
    expect(selectCtx.editMessageText).toHaveBeenCalledTimes(1);

    const pageCtx = {
      ...createContext(MOCK_MENU_MESSAGE_ID),
      callbackQuery: {
        data: nextButton?.callback_data,
        message: { message_id: MOCK_MENU_MESSAGE_ID },
      },
    } as unknown as Context;

    const handled = await handleModelProvidersCallback(pageCtx);

    expect(handled).toBe(true);
    expect(getEditedText(pageCtx)).toContain("Page 2 of 3");
  });

  it("returns false for unrelated callbacks", async () => {
    const ctx = {
      ...createContext(1),
      callbackQuery: { data: "model:openrouter:free", message: { message_id: 1 } },
    } as unknown as Context;

    const handled = await handleModelProvidersCallback(ctx);
    expect(handled).toBe(false);
  });

  it("returns false for non-modelprov callbacks", async () => {
    const ctx = {
      ...createContext(1),
      callbackQuery: { data: "session:select:abc", message: { message_id: 1 } },
    } as unknown as Context;

    const handled = await handleModelProvidersCallback(ctx);
    expect(handled).toBe(false);
  });
});