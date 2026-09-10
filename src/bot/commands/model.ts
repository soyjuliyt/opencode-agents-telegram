import { CommandContext, Context, InlineKeyboard } from "grammy";
import { getAllAvailableModels, fetchCurrentModel } from "../../model/manager.js";
import { formatModelForDisplay } from "../../model/types.js";
import type { FavoriteModel } from "../../model/types.js";
import {
  registerModelCallback,
  registerProviderCallback,
  resolveProviderCallback,
} from "../../model/callback-registry.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import { config } from "../../config.js";
import {
  appendInlineMenuCancelButton,
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";

export const MODEL_PROVIDERS_PAGE_PREFIX = "modelprov:page:";
export const MODEL_PROVIDER_SELECT_PREFIX = "modelprov:sel:";
export const MODEL_PROVIDER_MODELS_PAGE_PREFIX = "modelprov:pg:";
export const MODEL_PROVIDERS_BACK_CALLBACK = "modelprov:back";

const MAX_INLINE_BUTTON_LABEL_LENGTH = 64;

function truncateLabel(label: string): string {
  if (label.length <= MAX_INLINE_BUTTON_LABEL_LENGTH) {
    return label;
  }

  return `${label.slice(0, MAX_INLINE_BUTTON_LABEL_LENGTH - 3)}...`;
}

function truncateModelLabel(model: FavoriteModel): string {
  return truncateLabel(formatModelForDisplay(model.providerID, model.modelID));
}

function groupModelsByProvider(models: FavoriteModel[]): Map<string, FavoriteModel[]> {
  const grouped = new Map<string, FavoriteModel[]>();

  for (const model of models) {
    let providerModels = grouped.get(model.providerID);
    if (!providerModels) {
      providerModels = [];
      grouped.set(model.providerID, providerModels);
    }
    providerModels.push(model);
  }

  return grouped;
}

function buildProvidersKeyboard(
  grouped: Map<string, FavoriteModel[]>,
  page: number,
  pageSize: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const providers = Array.from(grouped.keys()).sort();
  const totalPages = Math.max(1, Math.ceil(providers.length / pageSize));
  const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);
  const startIndex = normalizedPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, providers.length);

  for (let index = startIndex; index < endIndex; index += 1) {
    const providerID = providers[index];
    keyboard
      .text(
        truncateLabel(providerID),
        `${MODEL_PROVIDER_SELECT_PREFIX}${registerProviderCallback(providerID)}`,
      )
      .row();
  }

  if (totalPages > 1) {
    if (normalizedPage > 0) {
      keyboard.text(t("model.button.prev_page"), `${MODEL_PROVIDERS_PAGE_PREFIX}${normalizedPage - 1}`);
    }

    if (normalizedPage < totalPages - 1) {
      keyboard.text(t("model.button.next_page"), `${MODEL_PROVIDERS_PAGE_PREFIX}${normalizedPage + 1}`);
    }

    keyboard.row();
  }

  return keyboard;
}

function buildProviderModelsKeyboard(
  models: FavoriteModel[],
  providerID: string,
  page: number,
  pageSize: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const providerToken = registerProviderCallback(providerID);
  const providerModels = models.filter((model) => model.providerID === providerID);
  const totalPages = Math.max(1, Math.ceil(providerModels.length / pageSize));
  const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);
  const startIndex = normalizedPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, providerModels.length);

  for (let index = startIndex; index < endIndex; index += 1) {
    const model = providerModels[index];
    keyboard
      .text(
        truncateModelLabel(model),
        `model:${registerModelCallback(model.providerID, model.modelID)}`,
      )
      .row();
  }

  if (totalPages > 1) {
    if (normalizedPage > 0) {
      keyboard.text(
        t("model.button.prev_page"),
        `${MODEL_PROVIDER_MODELS_PAGE_PREFIX}${providerToken}:${normalizedPage - 1}`,
      );
    }

    if (normalizedPage < totalPages - 1) {
      keyboard.text(
        t("model.button.next_page"),
        `${MODEL_PROVIDER_MODELS_PAGE_PREFIX}${providerToken}:${normalizedPage + 1}`,
      );
    }

    keyboard.row();
  }

  keyboard.text(t("model.button.back"), MODEL_PROVIDERS_BACK_CALLBACK).row();

  return keyboard;
}

function buildProvidersMenuText(
  providerCount: number,
  page: number,
  totalPages: number,
  scopeKey: string,
): string {
  const currentModel = fetchCurrentModel(scopeKey);
  const currentLabel = currentModel?.providerID
    ? `${currentModel.providerID}/${currentModel.modelID}`
    : t("common.unknown");

  return [
    t("model.menu.current", { name: currentLabel }),
    "",
    t("model.providers.title", { total: providerCount, page: page + 1, pages: totalPages }),
  ].join("\n");
}

function buildProviderModelsMenuText(
  providerID: string,
  modelCount: number,
  page: number,
  totalPages: number,
  scopeKey: string,
): string {
  const currentModel = fetchCurrentModel(scopeKey);
  const currentLabel = currentModel?.providerID
    ? `${currentModel.providerID}/${currentModel.modelID}`
    : t("common.unknown");

  return [
    t("model.menu.current", { name: currentLabel }),
    "",
    t("model.provider.models_title", {
      provider: truncateLabel(providerID),
      total: modelCount,
      page: page + 1,
      pages: totalPages,
    }),
  ].join("\n");
}

export async function modelCommand(ctx: CommandContext<Context>): Promise<void> {
  const scopeKey = getScopeKeyFromContext(ctx);

  try {
    const models = await getAllAvailableModels();

    if (models.length === 0) {
      await ctx.reply(t("model.menu.empty"));
      return;
    }

    const grouped = groupModelsByProvider(models);
    const pageSize = config.bot.commandsListLimit;
    const totalPages = Math.max(1, Math.ceil(grouped.size / pageSize));

    await replyWithInlineMenu(ctx, {
      menuKind: "model",
      text: buildProvidersMenuText(grouped.size, 0, totalPages, scopeKey),
      keyboard: buildProvidersKeyboard(grouped, 0, pageSize),
    });
  } catch (err) {
    logger.error("[Model] Error showing providers:", err);
    await ctx.reply(
      t("model.menu.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}

export async function handleModelProvidersCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("modelprov")) {
    return false;
  }

  const scopeKey = getScopeKeyFromContext(ctx);

  const isActive = await ensureActiveInlineMenu(ctx, "model");
  if (!isActive) {
    return true;
  }

  try {
    const models = await getAllAvailableModels();

    if (models.length === 0) {
      await ctx.answerCallbackQuery({ text: t("model.menu.empty"), show_alert: true });
      return true;
    }

    const grouped = groupModelsByProvider(models);
    const pageSize = config.bot.commandsListLimit;

    let text: string;
    let keyboard: InlineKeyboard;

    if (data.startsWith(MODEL_PROVIDER_SELECT_PREFIX)) {
      const providerToken = data.slice(MODEL_PROVIDER_SELECT_PREFIX.length);
      const providerID = resolveProviderCallback(providerToken);

      if (!providerID || !grouped.has(providerID)) {
        await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
        return true;
      }

      const providerModels = grouped.get(providerID)!;
      const totalPages = Math.max(1, Math.ceil(providerModels.length / pageSize));
      keyboard = buildProviderModelsKeyboard(models, providerID, 0, pageSize);
      text = buildProviderModelsMenuText(providerID, providerModels.length, 0, totalPages, scopeKey);
    } else if (data.startsWith(MODEL_PROVIDER_MODELS_PAGE_PREFIX)) {
      const rest = data.slice(MODEL_PROVIDER_MODELS_PAGE_PREFIX.length);
      const colonIndex = rest.lastIndexOf(":");
      const providerToken = colonIndex > 0 ? rest.slice(0, colonIndex) : "";
      const rawPage = colonIndex > 0 ? rest.slice(colonIndex + 1) : "";
      const page = Number(rawPage);

      if (
        !providerToken ||
        !Number.isInteger(page) ||
        page < 0
      ) {
        await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
        return true;
      }

      const providerID = resolveProviderCallback(providerToken);
      const providerModels = providerID ? grouped.get(providerID) : undefined;

      if (!providerID || !providerModels) {
        await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
        return true;
      }

      const totalPages = Math.max(1, Math.ceil(providerModels.length / pageSize));
      const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);
      keyboard = buildProviderModelsKeyboard(models, providerID, normalizedPage, pageSize);
      text = buildProviderModelsMenuText(
        providerID,
        providerModels.length,
        normalizedPage,
        totalPages,
        scopeKey,
      );
    } else if (data.startsWith(MODEL_PROVIDERS_PAGE_PREFIX)) {
      const rawPage = data.slice(MODEL_PROVIDERS_PAGE_PREFIX.length);
      const page = Number(rawPage);

      if (!Number.isInteger(page) || page < 0) {
        await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
        return true;
      }

      const totalPages = Math.max(1, Math.ceil(grouped.size / pageSize));
      const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);
      keyboard = buildProvidersKeyboard(grouped, normalizedPage, pageSize);
      text = buildProvidersMenuText(grouped.size, normalizedPage, totalPages, scopeKey);
    } else if (data === MODEL_PROVIDERS_BACK_CALLBACK) {
      const totalPages = Math.max(1, Math.ceil(grouped.size / pageSize));
      keyboard = buildProvidersKeyboard(grouped, 0, pageSize);
      text = buildProvidersMenuText(grouped.size, 0, totalPages, scopeKey);
    } else {
      return false;
    }

    await ctx.editMessageText(text, {
      reply_markup: appendInlineMenuCancelButton(keyboard, "model"),
    });
    await ctx.answerCallbackQuery();

    return true;
  } catch (err) {
    logger.error("[Model] Error handling providers callback:", err);
    await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
    return true;
  }
}