import type { RuntimeMode } from "../runtime/mode.js";

export interface ServiceCommandModeHints {
  homeOverride?: string;
  installedStateExists: boolean;
  cwdLooksLikeSource: boolean;
}

export function resolveServiceCommandMode(hints: ServiceCommandModeHints): RuntimeMode {
  const explicitHome = hints.homeOverride?.trim();
  if (explicitHome) {
    return "installed";
  }

  if (!hints.installedStateExists && hints.cwdLooksLikeSource) {
    return "sources";
  }

  return "installed";
}
