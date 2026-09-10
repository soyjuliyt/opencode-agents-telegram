import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  languageCommand,
  handleLanguageSetCallback,
  getLanguageLabel,
} from "../../../src/bot/commands/language.js";
import { interactionManager } from "../../../src/interaction/manager.js";
import {
  getLocale,
  resetRuntimeLocale,
  setRuntimeLocale,
} from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  setLocalePreference: vi.fn(),
}));

vi.mock("../../../src/settings/manager.js", () => ({
  setLocalePreference: mocked.setLocalePreference,
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

function flatTexts(ctx: Context): string[] {
  const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
  const markup = replyArgs[1] as { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } };
  return markup.reply_markup.inline_keyboard.flat().map((button) => button.text);
}

describe("bot/commands/language", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup");
    resetRuntimeLocale();
    delete process.env.BOT_LOCALE;
    mocked.setLocalePreference.mockReset();
  });

  it("shows the language menu and starts the menu interaction", async () => {
    const ctx = createContext(123);
    await languageCommand({ ...ctx, match: "language" } as never);

    expect(ctx.reply).toHaveBeenCalledTimes(1);

    const texts = flatTexts(ctx);
    expect(texts).toContain("✅ English");
    expect(texts).toContain("Español");
    expect(texts).toContain("Deutsch");
    expect(texts).toContain("Русский");

    const state = interactionManager.getSnapshot("chat:777");
    expect(state?.kind).toBe("inline");
    expect(state?.metadata.menuKind).toBe("language");
  });

  it("highlights the current locale with a check", async () => {
    setRuntimeLocale("es");

    const ctx = createContext(123);
    await languageCommand({ ...ctx, match: "language" } as never);

    const texts = flatTexts(ctx);
    expect(texts).toContain("✅ Español");
    expect(texts).not.toContain("✅ English");
  });

  it("updates the runtime locale and persists the preference on callback", async () => {
    const scopeKey = "chat:777";
    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: { menuKind: "language", messageId: 321 },
      },
      scopeKey,
    );

    const ctx = {
      ...createContext(321),
      callbackQuery: { data: "langset:es", message: { message_id: 321 } },
    } as unknown as Context;

    const handled = await handleLanguageSetCallback(ctx);

    expect(handled).toBe(true);
    expect(mocked.setLocalePreference).toHaveBeenCalledWith("es");
    expect(getLocale()).toBe("es");
    expect(ctx.deleteMessage).toHaveBeenCalledTimes(1);
    expect(interactionManager.getSnapshot(scopeKey)).toBeNull();
  });

  it("returns false for unrelated callbacks", async () => {
    const ctx = {
      ...createContext(1),
      callbackQuery: { data: "permission:none", message: { message_id: 1 } },
    } as unknown as Context;

    const handled = await handleLanguageSetCallback(ctx);
    expect(handled).toBe(false);
    expect(mocked.setLocalePreference).not.toHaveBeenCalled();
  });
});

describe("getLanguageLabel", () => {
  it("maps each supported locale to its native label", () => {
    expect(getLanguageLabel("en")).toBe("English");
    expect(getLanguageLabel("de")).toBe("Deutsch");
    expect(getLanguageLabel("es")).toBe("Español");
    expect(getLanguageLabel("fr")).toBe("Français");
    expect(getLanguageLabel("ru")).toBe("Русский");
    expect(getLanguageLabel("zh")).toBe("简体中文");
  });
});