import { describe, it, expect } from "vitest";
import { companyWhereForUser, documentWhereForUser } from "../src/lib/scope";

describe("companyWhereForUser", () => {
  it("returns no restriction for an ADMIN", () => {
    expect(companyWhereForUser({ id: "u1", role: "ADMIN" })).toEqual({});
  });

  it("restricts to ownerId for a MANAGER", () => {
    expect(companyWhereForUser({ id: "u1", role: "MANAGER" })).toEqual({ ownerId: "u1" });
  });

  it("restricts to ownerId for any non-ADMIN role", () => {
    expect(companyWhereForUser({ id: "u2", role: "SOMETHING_ELSE" })).toEqual({ ownerId: "u2" });
  });
});

describe("documentWhereForUser", () => {
  it("returns no restriction for an ADMIN", () => {
    expect(documentWhereForUser({ id: "u1", role: "ADMIN" })).toEqual({});
  });

  it("restricts to authorId for a MANAGER", () => {
    expect(documentWhereForUser({ id: "u1", role: "MANAGER" })).toEqual({ authorId: "u1" });
  });
});
