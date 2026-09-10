import { CommandContext, Context, InlineKeyboard } from "grammy";
import { getPermissionMode } from "../../settings/manager.js";
import type { PermissionMode } from "../../permission/types.js";
import { logger } from "../../utils/logger.js";
import { replyWithInlineMenu } from "../handlers/inline-menu.js";
import {
  getScopeFromContext,
  getScopeKeyFromContext,
  getThreadSendOptions,
} from "../scope.js";
import { t } from "../../i18n/index.js";

export const PERMISSION_SET_PREFIX = "permset:";

export function formatPermissionMode(mode: PermissionMode): string {
  switch (mode) {
    case "allow_all":
      return t("permission.set.mode.allow_all");
    case "deny_all":
      return t("permission.set.mode.deny_all");
    default:
      return t("permission.set.mode.ask");
  }
}

export function buildPermissionMenu(currentMode: PermissionMode): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const modes: PermissionMode[] = ["allow_all", "ask", "deny_all"];

  modes.forEach((mode) => {
    const isActive = mode === currentMode;
    const label = formatPermissionMode(mode);
    keyboard.text(isActive ? `✅ ${label}` : label, `${PERMISSION_SET_PREFIX}${mode}`).row();
  });

  return keyboard;
}

export async function permissionCommand(ctx: CommandContext<Context>): Promise<void> {
  const scopeKey = getScopeKeyFromContext(ctx);

  try {
    const currentMode = getPermissionMode(scopeKey);
    const keyboard = buildPermissionMenu(currentMode);
    const text = t("permission.set.title", { mode: formatPermissionMode(currentMode) });

    await replyWithInlineMenu(ctx, {
      menuKind: "permission_set",
      text,
      keyboard,
    });
  } catch (err) {
    logger.error("[PermissionCommand] Error showing permissions mode menu:", err);
    await ctx.reply(
      t("permission.set.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}