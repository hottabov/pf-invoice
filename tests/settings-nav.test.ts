import { describe, it, expect } from "vitest";
import { visibleSettingsNavItems, SETTINGS_NAV_ITEMS } from "../src/lib/settings-nav";

describe("visibleSettingsNavItems", () => {
  it("includes every section for an ADMIN", () => {
    const items = visibleSettingsNavItems("ADMIN");
    expect(items.map((i) => i.label)).toEqual(SETTINGS_NAV_ITEMS.map((i) => i.label));
  });

  it("includes every section for a DEVELOPER, same as an ADMIN", () => {
    const items = visibleSettingsNavItems("DEVELOPER");
    expect(items.map((i) => i.label)).toEqual(SETTINGS_NAV_ITEMS.map((i) => i.label));
  });

  it("omits admin-only sections for a MANAGER, but keeps the open ones", () => {
    const items = visibleSettingsNavItems("MANAGER");
    expect(items.map((i) => i.label)).toEqual(["Account", "Preferences", "PathQuote Support"]);
  });

  it("treats a missing role the same as a non-admin", () => {
    const expected = ["Account", "Preferences", "PathQuote Support"];
    expect(visibleSettingsNavItems(null).map((i) => i.label)).toEqual(expected);
    expect(visibleSettingsNavItems(undefined).map((i) => i.label)).toEqual(expected);
  });

  it("never gates PathQuote Support behind admin rights — anyone can reach the developer", () => {
    for (const role of ["ADMIN", "DEVELOPER", "MANAGER", null, undefined]) {
      expect(visibleSettingsNavItems(role).map((i) => i.label)).toContain("PathQuote Support");
    }
  });
});
