import { describe, expect, it } from "vitest";
import {
  modelForAccount,
  parseSettings,
  thresholdForAccount,
  tokenEnvForAccount,
} from "../src/config.js";

describe("auto-name config", () => {
  it("is disabled by default", () => {
    const settings = parseSettings(undefined);
    expect(thresholdForAccount(settings, "default")).toBe(0);
  });

  it("accepts true, false, zero, and a positive threshold", () => {
    expect(thresholdForAccount(parseSettings({ autoName: true }), "default")).toBe(5);
    expect(thresholdForAccount(parseSettings({ autoName: false }), "default")).toBe(0);
    expect(thresholdForAccount(parseSettings({ autoName: 0 }), "default")).toBe(0);
    expect(thresholdForAccount(parseSettings({ autoName: 7 }), "default")).toBe(7);
  });

  it("uses a per-account override before the common setting", () => {
    const settings = parseSettings({
      autoName: 4,
      accounts: {
        work: { autoName: 8, tokenEnv: "WORK_DISCORD_TOKEN" },
        quiet: { autoName: false },
      },
    });
    expect(thresholdForAccount(settings, "default")).toBe(4);
    expect(thresholdForAccount(settings, "work")).toBe(8);
    expect(thresholdForAccount(settings, "quiet")).toBe(0);
    expect(tokenEnvForAccount(settings, "work")).toBe("WORK_DISCORD_TOKEN");
    expect(tokenEnvForAccount(settings, "default")).toBe("DISCORD_BOT_TOKEN");
    expect(tokenEnvForAccount(settings, "other")).toBeUndefined();
  });

  it("rejects invalid thresholds and environment variable names", () => {
    expect(() => parseSettings({ autoName: -1 })).toThrow();
    expect(() => parseSettings({ autoName: 1.5 })).toThrow();
    expect(() => parseSettings({ tokenEnv: "bad-token" })).toThrow();
  });

  it("inherits the agent model when no naming model is configured", () => {
    const settings = parseSettings({ autoName: true });
    expect(modelForAccount(settings, "default")).toBeUndefined();
    expect(modelForAccount(settings, "work")).toBeUndefined();
  });

  it("supports a shared naming model and account overrides", () => {
    const settings = parseSettings({
      model: "summary-fast",
      accounts: {
        work: { model: "provider/work-model" },
        personal: { autoName: 3 },
      },
    });
    expect(modelForAccount(settings, "default")).toBe("summary-fast");
    expect(modelForAccount(settings, "work")).toBe("provider/work-model");
    expect(modelForAccount(settings, "personal")).toBe("summary-fast");
  });

  it.each([null, false, 3, "", " ", "provider/model name", "provider/model\n", "x".repeat(257)])(
    "rejects invalid naming model references: %s",
    (model) => {
      expect(() => parseSettings({ model })).toThrow(/model/);
      expect(() => parseSettings({ accounts: { work: { model } } })).toThrow(/model/);
    },
  );
});
