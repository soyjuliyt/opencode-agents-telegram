import type { ModelInfo } from "./types.js";

const TOKEN_PREFIX = "mp:";
const MAX_ENTRIES = 2000;

let nextTokenId = 0;
const entries = new Map<string, { providerID: string; modelID: string }>();

export function registerModelCallback(providerID: string, modelID: string): string {
  const token = `${TOKEN_PREFIX}${(nextTokenId += 1).toString(36)}`;
  entries.set(token, { providerID, modelID });

  if (entries.size > MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) {
      entries.delete(oldestKey);
    }
  }

  return token;
}

export function isModelCallbackToken(callbackData: string): boolean {
  return callbackData.startsWith("model:mp:");
}

export function resolveModelCallback(callbackData: string): ModelInfo | null {
  const token = callbackData.slice("model:".length);
  const entry = entries.get(token);

  if (!entry) {
    return null;
  }

  return { providerID: entry.providerID, modelID: entry.modelID, variant: "default" };
}

export function __resetModelCallbackRegistryForTests(): void {
  nextTokenId = 0;
  entries.clear();
}