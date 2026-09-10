import { CommandContext, Context, InlineKeyboard } from "grammy";
import {
  getLocale,
  getLocaleOptions,
  isSupportedLocale,
  setRuntimeLocale,
  t,
  type Locale,
} from "../../i18n/index.js";
import { setLocalePreference } from "../../settings/manager.js";
import { logger } from "../../utils/logger.js";
import {
  clearActiveInlineMenu,
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";

export const LANGUAGE_SET_PREFIX = "langset:";

export function getLanguageLabel(locale: Locale): string {
  return getLocaleOptions().find((option) => option.code === locale)?.label ?? locale;
}

export function buildLanguageMenu(currentLocale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const options = getLocaleOptions();

  options.forEach((option) => {
    const isActive = option.code === currentLocale;
    keyboard.text(
      isActive ? `✅ ${option.label}` : option.label,
      `${LANGUAGE_SET_PREFIX}${option.code}`,
    );
    keyboard.row();
  });

  return keyboard;
}

export async function languageCommand(ctx: CommandContext<Context>): Promise<void> {
  try {
    const currentLocale = getLocale();
    const keyboard = buildLanguageMenu(currentLocale);
    const text = t("language.set.title", { language: getLanguageLabel(currentLocale) });

    await replyWithInlineMenu(ctx, {
      menuKind: "language",
      text,
      keyboard,
    });
  } catch (err) {
    logger.error("[LanguageCommand] Error showing language menu:", err);
    await ctx.reply(
      t("language.set.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}

export async function handleLanguageSetCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith(LANGUAGE_SET_PREFIX)) {
    return false;
  }

  const isActiveMenu = await ensureActiveInlineMenu(ctx, "language");
  if (!isActiveMenu) {
    return true;
  }

  const scopeKey = getScopeKeyFromContext(ctx);

  try {
    const locale = data.slice(LANGUAGE_SET_PREFIX.length);
    if (!isSupportedLocale(locale)) {
      await ctx.answerCallbackQuery({ text: t("language.set.error"), show_alert: true });
      return true;
    }

    setRuntimeLocale(locale);
    setLocalePreference(locale);

    await ctx.answerCallbackQuery({
      text: t("language.set.changed", { language: getLanguageLabel(locale) }),
    });

    logger.info(`[LanguageHandler] Bot language set to ${locale} for scope=${scopeKey}`);

    clearActiveInlineMenu("language_set_changed", scopeKey);
    await ctx.deleteMessage().catch(() => {});

    return true;
  } catch (err) {
    clearActiveInlineMenu("language_set_error", scopeKey);
    logger.error("[LanguageHandler] Error handling language set:", err);
    await ctx.answerCallbackQuery({ text: t("language.set.error") }).catch(() => {});
    return true;
  }
}