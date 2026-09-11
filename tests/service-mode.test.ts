import { describe, expect, it } from "vitest";
import { resolveServiceCommandMode } from "../src/cli/service-mode.js";

describe("resolveServiceCommandMode", () => {
  it("keeps installed mode when OPENCODE_TELEGRAM_HOME is set", () => {
    expect(
      resolveServiceCommandMode({
        homeOverride: "C:\\bot-home",
        installedStateExists: false,
        cwdLooksLikeSource: true,
      }),
    ).toBe("installed");
  });

  it("keeps installed mode when the installed state already exists", () => {
    expect(
      resolveServiceCommandMode({
        homeOverride: undefined,
        installedStateExists: true,
        cwdLooksLikeSource: true,
      }),
    ).toBe("installed");
  });

  it("falls back to sources mode when run from the source repo and no installed state exists", () => {
    expect(
      resolveServiceCommandMode({
        homeOverride: undefined,
        installedStateExists: false,
        cwdLooksLikeSource: true,
      }),
    ).toBe("sources");
  });

  it("stays installed when neither the repo nor an installed state is present", () => {
    expect(
      resolveServiceCommandMode({
        homeOverride: undefined,
        installedStateExists: false,
        cwdLooksLikeSource: false,
      }),
    ).toBe("installed");
  });
});
