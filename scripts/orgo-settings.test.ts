import { describe, expect, it } from "bun:test";
import { withSetting } from "./orgo-settings.ts";

describe("a plugin settings file with one setting set", () => {
  it("adds the setting after the others, on a line of its own", () => {
    expect(withSetting("A=1\nB=2\n", "OVIS_AUTO_UPDATE", "1")).toBe("A=1\nB=2\nOVIS_AUTO_UPDATE=1\n");
    expect(withSetting("A=1\nB=2", "OVIS_AUTO_UPDATE", "1")).toBe("A=1\nB=2\nOVIS_AUTO_UPDATE=1\n");
    expect(withSetting("", "OVIS_AUTO_UPDATE", "1")).toBe("OVIS_AUTO_UPDATE=1\n");
  });

  it("changes a setting that is there, and only that line", () => {
    expect(withSetting("A=1\nOVIS_AUTO_UPDATE=0\n# kept\nB=2\n", "OVIS_AUTO_UPDATE", "1")).toBe("A=1\nOVIS_AUTO_UPDATE=1\n# kept\nB=2\n");
    expect(withSetting("  OVIS_AUTO_UPDATE = \"0\"\n", "OVIS_AUTO_UPDATE", "1")).toBe("OVIS_AUTO_UPDATE=1\n");
  });

  it("leaves a setting that is already right, and a commented one, alone", () => {
    const set = "A=1\nOVIS_AUTO_UPDATE=1\n";
    expect(withSetting(set, "OVIS_AUTO_UPDATE", "1")).toBe(set);
    expect(withSetting("# OVIS_AUTO_UPDATE=0\n", "OVIS_AUTO_UPDATE", "1")).toBe("# OVIS_AUTO_UPDATE=0\nOVIS_AUTO_UPDATE=1\n");
  });

  it("does not take another setting that starts with the same letters for it", () => {
    expect(withSetting("OVIS_AUTO_UPDATE_X=0\n", "OVIS_AUTO_UPDATE", "1")).toBe("OVIS_AUTO_UPDATE_X=0\nOVIS_AUTO_UPDATE=1\n");
  });
});
