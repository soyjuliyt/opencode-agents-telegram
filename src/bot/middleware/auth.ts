import { Context, NextFunction } from "grammy";
import { config } from "../../config.js";
import { t } from "../../i18n/index.js";
import { persistOwnerUserId } from "../../runtime/bootstrap.js";
import { logger } from "../../utils/logger.js";
import { CHAT_TYPE } from "../constants.js";

const ONBOARDING_SENTINEL = 0;

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;

  logger.debug(
    `[Auth] Checking access: userId=${userId}, allowedUserId=${config.telegram.allowedUserId}, hasCallbackQuery=${!!ctx.callbackQuery}, hasMessage=${!!ctx.message}`,
  );

  if (config.telegram.allowedUserId === ONBOARDING_SENTINEL) {
    await handleOnboarding(ctx, userId, next);
    return;
  }

  if (userId && userId === config.telegram.allowedUserId) {
    logger.debug(`[Auth] Access granted for userId=${userId}`);
    await next();
  } else {
    // Silently ignore unauthorized users
    logger.warn(`Unauthorized access attempt from user ID: ${userId}`);

    // Actively hide commands for unauthorized users by setting empty command list
    // Only do this if the chat is NOT the authorized user's chat
    // (to avoid resetting commands when forwarded messages are received)
    if (ctx.chat?.id && ctx.chat.id !== config.telegram.allowedUserId) {
      try {
        // Set empty commands for this specific chat (more reliable than deleteMyCommands)
        await ctx.api.setMyCommands([], {
          scope: { type: "chat", chat_id: ctx.chat.id },
        });
        logger.debug(`[Auth] Set empty commands for unauthorized chat_id=${ctx.chat.id}`);
      } catch (err) {
        // Ignore errors
        logger.debug(`[Auth] Could not set empty commands: ${err}`);
      }
    }
  }
}

async function handleOnboarding(ctx: Context, userId: number | undefined, next: NextFunction): Promise<void> {
  if (userId && ctx.chat?.type === CHAT_TYPE.PRIVATE) {
    await persistOwnerUserId(userId);
    config.telegram.allowedUserId = userId;
    logger.info(`[Auth] Onboarding complete: adopted user ${userId} as owner`);
    await ctx.reply(t("onboarding.adopted"));
    await next();
    return;
  }

  logger.warn(
    `[Auth] Ignoring update while awaiting owner adoption (chatType=${ctx.chat?.type}, userId=${userId})`,
  );
}
