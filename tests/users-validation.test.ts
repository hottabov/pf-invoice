import { describe, it, expect } from "vitest";
import {
  userEmailSchema,
  userNameSchema,
  userPhoneSchema,
  userRoleSchema,
  userRegionCodeSchema,
  userPasswordSchema,
  requiredPasswordSchema,
  createUserSchema,
  updateUserSchema,
  setUserPasswordSchema,
  canModifyUser,
  type ModifiableUser,
} from "../src/lib/validation/users";

describe("userEmailSchema", () => {
  it("trims and lowercases a valid email", () => {
    const result = userEmailSchema.safeParse("  Foo@Bar.COM  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("foo@bar.com");
  });

  it("rejects an invalid email", () => {
    expect(userEmailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects an email over 200 characters", () => {
    const long = `${"a".repeat(195)}@x.com`; // > 200 chars total
    expect(userEmailSchema.safeParse(long).success).toBe(false);
  });
});

describe("userNameSchema", () => {
  it("collapses a missing/blank name to undefined", () => {
    for (const name of [undefined, null, "", "   "]) {
      const result = userNameSchema.safeParse(name);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeUndefined();
    }
  });

  it("accepts a normal name", () => {
    const result = userNameSchema.safeParse("Jane Smith");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Jane Smith");
  });

  it("rejects a name over 120 characters", () => {
    expect(userNameSchema.safeParse("A".repeat(121)).success).toBe(false);
  });

  it("accepts a name at exactly the 120 character bound", () => {
    expect(userNameSchema.safeParse("A".repeat(120)).success).toBe(true);
  });
});

describe("userPhoneSchema", () => {
  it("collapses a missing/blank phone to undefined", () => {
    for (const phone of [undefined, null, "", "   "]) {
      const result = userPhoneSchema.safeParse(phone);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeUndefined();
    }
  });

  it("accepts and trims a normal phone number", () => {
    const result = userPhoneSchema.safeParse("  0400 000 000  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("0400 000 000");
  });

  it("rejects a phone over 40 characters", () => {
    expect(userPhoneSchema.safeParse("1".repeat(41)).success).toBe(false);
  });

  it("accepts a phone at exactly the 40 character bound", () => {
    expect(userPhoneSchema.safeParse("1".repeat(40)).success).toBe(true);
  });
});

describe("userRoleSchema", () => {
  it("accepts ADMIN and MANAGER", () => {
    expect(userRoleSchema.safeParse("ADMIN").success).toBe(true);
    expect(userRoleSchema.safeParse("MANAGER").success).toBe(true);
  });

  it("rejects any other value", () => {
    expect(userRoleSchema.safeParse("SUPERADMIN").success).toBe(false);
    expect(userRoleSchema.safeParse("").success).toBe(false);
  });
});

describe("userRegionCodeSchema", () => {
  it("collapses a missing/blank code to null", () => {
    for (const code of [undefined, null, "", "   "]) {
      const result = userRegionCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    }
  });

  it("normalizes a lowercase code to uppercase", () => {
    const result = userRegionCodeSchema.safeParse("au");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("AU");
  });

  it("accepts 2- and 3-letter codes", () => {
    expect(userRegionCodeSchema.safeParse("AU").success).toBe(true);
    expect(userRegionCodeSchema.safeParse("USA").success).toBe(true);
  });

  it("rejects a code with digits", () => {
    expect(userRegionCodeSchema.safeParse("A1").success).toBe(false);
  });
});

describe("userPasswordSchema (optional)", () => {
  it("collapses a missing/blank password to undefined", () => {
    for (const password of [undefined, null, "", "   "]) {
      const result = userPasswordSchema.safeParse(password);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeUndefined();
    }
  });

  it("rejects a password shorter than 10 characters", () => {
    expect(userPasswordSchema.safeParse("short1234").success).toBe(false);
  });

  it("accepts a password at exactly 10 characters", () => {
    expect(userPasswordSchema.safeParse("1234567890").success).toBe(true);
  });

  it("rejects a password over 200 characters", () => {
    expect(userPasswordSchema.safeParse("a".repeat(201)).success).toBe(false);
  });

  it("accepts a password at exactly 200 characters", () => {
    expect(userPasswordSchema.safeParse("a".repeat(200)).success).toBe(true);
  });
});

describe("requiredPasswordSchema", () => {
  it("rejects a missing password", () => {
    expect(requiredPasswordSchema.safeParse(undefined).success).toBe(false);
  });

  it("rejects a blank password", () => {
    expect(requiredPasswordSchema.safeParse("").success).toBe(false);
  });

  it("rejects a password shorter than 10 characters", () => {
    expect(requiredPasswordSchema.safeParse("short1234").success).toBe(false);
  });

  it("accepts a valid password", () => {
    expect(requiredPasswordSchema.safeParse("a-long-enough-password").success).toBe(true);
  });
});

describe("createUserSchema", () => {
  const base = {
    email: "new.user@example.com",
    name: "New User",
    phone: "0400 000 000",
    role: "MANAGER",
    regionCode: "AU",
    password: "a-valid-password",
  };

  it("accepts a fully populated valid submission", () => {
    const result = createUserSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("0400 000 000");
  });

  it("accepts an omitted phone", () => {
    const result = createUserSchema.safeParse({ ...base, phone: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("rejects a too-long phone", () => {
    expect(createUserSchema.safeParse({ ...base, phone: "1".repeat(41) }).success).toBe(false);
  });

  it("accepts an omitted password and region (magic-link-only, no region)", () => {
    const result = createUserSchema.safeParse({
      email: base.email,
      name: base.name,
      role: base.role,
      regionCode: "",
      password: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBeUndefined();
      expect(result.data.regionCode).toBeNull();
    }
  });

  it("rejects an invalid email", () => {
    expect(createUserSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });

  it("rejects an invalid role", () => {
    expect(createUserSchema.safeParse({ ...base, role: "OWNER" }).success).toBe(false);
  });

  it("rejects a too-short password when one is provided", () => {
    expect(createUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  const base = { name: "Jane", phone: "0400 000 000", role: "ADMIN", regionCode: "US", active: "on" };

  it("accepts a fully populated valid submission and coerces active", () => {
    const result = updateUserSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
      expect(result.data.phone).toBe("0400 000 000");
    }
  });

  it("treats a missing active checkbox as false", () => {
    const rest = { name: base.name, role: base.role, regionCode: base.regionCode };
    const result = updateUserSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.active).toBe(false);
  });

  it("rejects an invalid role", () => {
    expect(updateUserSchema.safeParse({ ...base, role: "OWNER" }).success).toBe(false);
  });
});

describe("setUserPasswordSchema", () => {
  it("accepts a valid password", () => {
    expect(setUserPasswordSchema.safeParse({ password: "a-valid-password" }).success).toBe(true);
  });

  it("rejects a missing password", () => {
    expect(setUserPasswordSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a too-short password", () => {
    expect(setUserPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });
});

describe("canModifyUser", () => {
  function admin(overrides: Partial<ModifiableUser> = {}): ModifiableUser {
    return { id: "user-admin", role: "ADMIN", active: true, ...overrides };
  }
  function manager(overrides: Partial<ModifiableUser> = {}): ModifiableUser {
    return { id: "user-manager", role: "MANAGER", active: true, ...overrides };
  }

  it("blocks an admin from deactivating their own account", () => {
    const target = admin();
    const result = canModifyUser(target.id, target, { active: false }, 3);
    expect(result).toBe("You can't deactivate your own account");
  });

  it("blocks an admin from demoting themselves", () => {
    const target = admin();
    const result = canModifyUser(target.id, target, { role: "MANAGER" }, 3);
    expect(result).toBe("You can't remove your own admin role");
  });

  it("allows an admin to edit their own name/region without touching role/active", () => {
    const target = admin();
    // No `role`/`active` key at all — e.g. a name-only change.
    const result = canModifyUser(target.id, target, {}, 3);
    expect(result).toBeNull();
  });

  it("allows an admin to keep their own role/active unchanged explicitly", () => {
    const target = admin();
    const result = canModifyUser(target.id, target, { role: "ADMIN", active: true }, 3);
    expect(result).toBeNull();
  });

  it("blocks deactivating the last active admin, even by a different actor", () => {
    const target = admin();
    const result = canModifyUser("some-other-admin", target, { active: false }, 1);
    expect(result).toBe("Can't deactivate the last active admin");
  });

  it("blocks demoting the last active admin, even by a different actor", () => {
    const target = admin();
    const result = canModifyUser("some-other-admin", target, { role: "MANAGER" }, 1);
    expect(result).toBe("Can't demote the last active admin");
  });

  it("allows deactivating an admin when other active admins exist", () => {
    const target = admin();
    const result = canModifyUser("some-other-admin", target, { active: false }, 2);
    expect(result).toBeNull();
  });

  it("allows demoting an admin when other active admins exist", () => {
    const target = admin();
    const result = canModifyUser("some-other-admin", target, { role: "MANAGER" }, 2);
    expect(result).toBeNull();
  });

  it("does not apply the last-admin guard to an already-inactive admin", () => {
    const target = admin({ active: false });
    // activeAdminCount counts *active* admins, so an inactive target isn't
    // counted here — nothing blocks re-activating or role-changing it.
    const result = canModifyUser("some-other-admin", target, { role: "MANAGER" }, 0);
    expect(result).toBeNull();
  });

  it("does not apply the last-admin guard to a manager", () => {
    const target = manager();
    const result = canModifyUser("some-other-admin", target, { active: false }, 1);
    expect(result).toBeNull();
  });

  it("allows a normal deactivation of a manager by an admin", () => {
    const target = manager();
    const result = canModifyUser("some-other-admin", target, { active: false }, 3);
    expect(result).toBeNull();
  });

  it("allows promoting a manager to admin", () => {
    const target = manager();
    const result = canModifyUser("some-other-admin", target, { role: "ADMIN" }, 3);
    expect(result).toBeNull();
  });

  it("prioritizes the self-deactivation message over the last-admin message when both apply", () => {
    const target = admin();
    const result = canModifyUser(target.id, target, { active: false }, 1);
    expect(result).toBe("You can't deactivate your own account");
  });
});
