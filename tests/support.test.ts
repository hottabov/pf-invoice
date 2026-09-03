import { describe, it, expect } from "vitest";
import { resolveSupportRecipients, NO_DEVELOPER_ERROR } from "@/lib/support";

describe("resolveSupportRecipients", () => {
  it("refuses plainly when no one holds the Developer role, rather than silently succeeding", () => {
    const result = resolveSupportRecipients([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(NO_DEVELOPER_ERROR);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns every developer's email when at least one exists", () => {
    const result = resolveSupportRecipients([
      { email: "dev1@pathfindercut.com", name: "Dev One" },
      { email: "dev2@pathfindercut.com" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toEqual(["dev1@pathfindercut.com", "dev2@pathfindercut.com"]);
    }
  });

  it("treats a developer with a blank email as absent", () => {
    const result = resolveSupportRecipients([{ email: "   " }]);
    expect(result.ok).toBe(false);
  });

  it("never returns ok:true with an empty recipient list", () => {
    // Guards the exact failure mode the brief called out: a caller must
    // never be able to mistake "sent to nobody" for a real success.
    const result = resolveSupportRecipients([{ email: "" }, { email: "   " }]);
    expect(result.ok).toBe(false);
  });
});
