import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import {
  __getSettingsMigrationLogForTests,
  __readStoredSettingsForTests,
  __resetSettingsForTests,
  __waitForSettingsWritesForTests,
  getCurrentProject,
  loadSettings,
  setCurrentProject,
} from "../../src/settings/manager.js";

describe("settings sqlite storage", () => {
  let tempHome: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "opencode-telegram-sqlite-"));
    settingsPath = path.join(tempHome, "settings.json");
    process.env.OPENCODE_TELEGRAM_HOME = tempHome;
    setRuntimeMode("installed");
    __resetSettingsForTests();
  });

  afterEach(async () => {
    __resetSettingsForTests();
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("persists mutations to sqlite and reloads them", async () => {
    await loadSettings();

    setCurrentProject({ id: "p-global", worktree: "/global" });
    await __waitForSettingsWritesForTests();

    const stored = __readStoredSettingsForTests() as {
      global?: { project?: { id: string } };
    };
    expect(stored?.global?.project?.id).toBe("p-global");

    __resetSettingsForTests();
    await loadSettings();

    expect(getCurrentProject("global")?.id).toBe("p-global");
  });

  it("seeds empty settings when neither store document nor settings.json exists", async () => {
    await loadSettings();

    expect(__readStoredSettingsForTests()).toEqual({ settingsVersion: 2 });

    const log = __getSettingsMigrationLogForTests();
    expect(log.some((entry) => entry.source === "seeded" && entry.operation === "seed")).toBe(true);
  });

  it("does not re-import settings.json when the sqlite store already has data", async () => {
    const original = {
      scopedProjects: {
        "chat:-9001": { id: "proj-a", worktree: "/a" },
      },
    };
    await writeFile(settingsPath, JSON.stringify(original, null, 2));

    await loadSettings();
    expect(getCurrentProject("chat:-9001")?.id).toBe("proj-a");

    const replacement = {
      settingsVersion: 2,
      groups: {
        "-9999": {
          general: { agent: "build" },
        },
      },
    };
    await writeFile(settingsPath, JSON.stringify(replacement, null, 2));

    await loadSettings();

    expect(getCurrentProject("chat:-9001")?.id).toBe("proj-a");
    expect(getCurrentProject("chat:-9999")).toBeUndefined();

    await expect(readFile(settingsPath, "utf-8")).resolves.toBe(
      JSON.stringify(replacement, null, 2),
    );

    const log = __getSettingsMigrationLogForTests();
    expect(
      log.filter((entry) => entry.source === "settings.json" && entry.operation === "import"),
    ).toHaveLength(1);
  });
});