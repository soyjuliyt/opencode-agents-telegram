import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetModelCallbackRegistryForTests,
  isModelCallbackToken,
  registerModelCallback,
  resolveModelCallback,
} from "../../src/model/callback-registry.js";

describe("model callback registry", () => {
  beforeEach(() => {
    __resetModelCallbackRegistryForTests();
  });

  it("registers and resolves a model through a short token", () => {
    const token = registerModelCallback("openrouter", "cognitivecomputations/dolphin-mistral-24b-venice-edition");

    expect(isModelCallbackToken(`model:${token}`)).toBe(true);
    expect(`model:${token}`.length).toBeLessThanOrEqual(64);
    expect(resolveModelCallback(`model:${token}`)).toEqual({
      providerID: "openrouter",
      modelID: "cognitivecomputations/dolphin-mistral-24b-venice-edition",
      variant: "default",
    });
  });

  it("generates shorter callback data than the raw model IDs", () => {
    const raw = "model:openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
    const token = registerModelCallback(
      "openrouter",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    );

    expect(`model:${token}`.length).toBeLessThan(raw.length);
    expect(`model:${token}`.length).toBeLessThanOrEqual(64);
  });

  it("returns null for unknown tokens", () => {
    expect(resolveModelCallback("model:mp:zzzz")).toBeNull();
  });

  it("generates unique tokens for different models", () => {
    const tokenA = registerModelCallback("openrouter", "free");
    const tokenB = registerModelCallback("auto", "best-free");

    expect(tokenA).not.toBe(tokenB);
  });
});