import { CommandContext, Context, InlineKeyboard } from "grammy";
import { getAllAvailableModels, fetchCurrentModel } from "../../model/manager.js";
import { formatModelForDisplay } from "../../model/types.js";
import type { FavoriteModel } from "../../model/types.js";
import { registerModelCallback } from "../../model/callback-registry.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import { config } from "../../config.js";
import {
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";

export const MODEL_ALL_PAGE_PREFIX = "modelall:page:";
const MAX_INLINE_BUTTON_LABEL_LENGTH = 64;

function truncateModelLabel(model: FavoriteModel): string {
  const raw = formatModelForDisplay(model.providerID, model.modelID);

  if (raw.length <= MAX_INLINE_BUTTON_LABEL_LENGTH) {
    return raw;
  }

  return `${raw.slice(0, MAX_INLINE_BUTTON_LABEL_LENGTH - 3)}...`;
}

function buildModelPageKeyboard(
  models: FavoriteModel[],
  page: number,
  pageSize: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const totalPages = Math.max(1, Math.ceil(models.length / pageSize));
  const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);
  const startIndex = normalizedPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, models.length);

  for (let index = startIndex; index < endIndex; index += 1) {
    const model = models[index];
    keyboard
      .text(truncateModelLabel(model), `model:${registerModelCallback(model.providerID, model.modelID)}`)
      .row();
  }

  if (totalPages > 1) {
    if (normalizedPage > 0) {
      keyboard.text(t("model.button.prev_page"), `${MODEL_ALL_PAGE_PREFIX}${normalizedPage - 1}`);
    }

    if (normalizedPage < totalPages - 1) {
      keyboard.text(t("model.button.next_page"), `${MODEL_ALL_PAGE_PREFIX}${normalizedPage + 1}`);
    }

    keyboard.row();
  }

  return keyboard;
}

function getCallbackMessageId(ctx: Context): number | null {
  const message = ctx.callbackQuery?.message;
  if (!message || !("message_id" in message)) {
    return null;
  }

  const messageId = (message as { message_id?: number }).message_id;
  return typeof messageId === "number" ? messageId : null;
}

export async function modelCommand(ctx: CommandContext<Context>): Promise<void> {
  const scopeKey = getScopeKeyFromContext(ctx);

  try {
    const models = await getAllAvailableModels();

    if (models.length === 0) {
      await ctx.reply(t("model.menu.empty"));
      return;
    }

    const pageSize = config.bot.commandsListLimit;
    const totalPages = Math.ceil(models.length / pageSize);
    const keyboard = buildModelPageKeyboard(models, 0, pageSize);
    const currentModel = fetchCurrentModel(scopeKey);
    const currentLabel = currentModel?.providerID
      ? `${currentModel.providerID}/${currentModel.modelID}`
      : t("common.unknown");

    const text = [
      t("model.menu.current", { name: currentLabel }),
      "",
      t("model.all.title", { total: models.length, page: 1, pages: totalPages }),
    ].join("\n");

    await replyWithInlineMenu(ctx, {
      menuKind: "model",
      text,
      keyboard,
    });
  } catch (err) {
    logger.error("[Model] Error showing all models:", err);
    await ctx.reply(
      t("model.menu.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}

export async function handleModelAllPageCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith(MODEL_ALL_PAGE_PREFIX)) {
    return false;
  }

  const scopeKey = getScopeKeyFromContext(ctx);

  const isActive = await ensureActiveInlineMenu(ctx, "model");
  if (!isActive) {
    return true;
  }

  const callbackMessageId = getCallbackMessageId(ctx);
  if (callbackMessageId === null) {
    await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
    return true;
  }

  try {
    const rawPage = data.slice(MODEL_ALL_PAGE_PREFIX.length);
    const page = Number(rawPage);

    if (!Number.isInteger(page) || page < 0) {
      await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
      return true;
    }

    const models = await getAllAvailableModels();

    if (models.length === 0) {
      await ctx.answerCallbackQuery({ text: t("model.menu.empty"), show_alert: true });
      return true;
    }

    const pageSize = config.bot.commandsListLimit;
    const totalPages = Math.max(1, Math.ceil(models.length / pageSize));
    const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);

    const keyboard = buildModelPageKeyboard(models, normalizedPage, pageSize);
    const currentModel = fetchCurrentModel(scopeKey);
    const currentLabel = currentModel?.providerID
      ? `${currentModel.providerID}/${currentModel.modelID}`
      : t("common.unknown");

    const text = [
      t("model.menu.current", { name: currentLabel }),
      "",
      t("model.all.title", {
        total: models.length,
        page: normalizedPage + 1,
        pages: totalPages,
      }),
    ].join("\n");

    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();

    return true;
  } catch (err) {
    logger.error("[Model] Error handling model page callback:", err);
    await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
    return true;
  }
}