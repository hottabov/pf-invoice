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

  it("omits admin-only sections for a MANAGER", () => {
    const items = visibleSettingsNavItems("MANAGER");
    expect(items.map((i) => i.label)).toEqual(["Account", "Preferences"]);
  });

  it("treats a missing role the same as a non-admin", () => {
    expect(visibleSettingsNavItems(null).map((i) => i.label)).toEqual(["Account", "Preferences"]);
    expect(visibleSettingsNavItems(undefined).map((i) => i.label)).toEqual(["Account", "Preferences"]);
  });
});
