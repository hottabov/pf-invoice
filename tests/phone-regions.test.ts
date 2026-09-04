import { describe, it, expect } from "vitest";
import { PhoneNumberUtil } from "google-libphonenumber";
import { DIAL_CODES, MAIN_REGION_BY_DIAL, dialCodeFor, regionForDialCode } from "../src/lib/phone-regions";
import { COUNTRIES } from "../src/lib/countries";
import { splitNumber } from "../src/components/ui-kit/phone-field";

const util = PhoneNumberUtil.getInstance();

// The phone field cannot afford to load google-libphonenumber before it can
// render (it is ~570KB), so it carries its own copy of the dialling codes.
// These two tests re-derive that copy from the library and fail if it has
// drifted -- the whole reason a checked-in table is safe here.
describe("DIAL_CODES matches the library", () => {
  it("gives every listed country the library's own dialling code", () => {
    for (const [country, dial] of Object.entries(DIAL_CODES)) {
      expect(util.getCountryCodeForRegion(country), country).toBe(dial);
    }
  });

  it("omits only the countries the library has no dialling code for", () => {
    const missing = COUNTRIES.filter((c) => DIAL_CODES[c.code] === undefined);
    for (const country of missing) {
      expect(util.getCountryCodeForRegion(country.code), country.code).toBeFalsy();
    }
  });
});

describe("MAIN_REGION_BY_DIAL matches the library", () => {
  it("names the library's main region for each dialling code", () => {
    for (const [dial, region] of Object.entries(MAIN_REGION_BY_DIAL)) {
      expect(util.getRegionCodeForCountryCode(Number(dial)), dial).toBe(region);
    }
  });

  it("covers +1, which twenty-odd countries share", () => {
    expect(MAIN_REGION_BY_DIAL[1]).toBe("US");
  });
});

describe("dialCodeFor", () => {
  it("is case-insensitive", () => {
    expect(dialCodeFor("au")).toBe(61);
    expect(dialCodeFor("AU")).toBe(61);
  });

  it("returns undefined for a territory with no telephone numbering", () => {
    expect(dialCodeFor("AQ")).toBeUndefined();
  });
});

describe("regionForDialCode", () => {
  it("prefers the company's own country when it shares the code", () => {
    expect(regionForDialCode(1, "CA")).toBe("CA");
  });

  it("falls back to the code's main region when the preference doesn't share it", () => {
    expect(regionForDialCode(1, "AU")).toBe("US");
  });
});

describe("splitNumber", () => {
  it("splits a stored E.164 number into country and national digits", () => {
    expect(splitNumber("+61393383471", "US")).toEqual({ country: "AU", national: "393383471" });
  });

  it("does not fly the wrong flag for a shared dialling code", () => {
    // Every +1 country matches the same one-digit prefix; without a main
    // region a US number would take whichever of them sorted first.
    expect(splitNumber("+12125551234", "AU").country).toBe("US");
  });

  it("keeps a Canadian number Canadian on a Canadian company", () => {
    expect(splitNumber("+14165551234", "CA").country).toBe("CA");
  });

  it("treats a number with no + as national digits in the fallback country", () => {
    expect(splitNumber("03 9338 3471", "AU")).toEqual({ country: "AU", national: "0393383471" });
  });

  it("returns no digits for an empty value", () => {
    expect(splitNumber("", "AU")).toEqual({ country: "AU", national: "" });
  });
});
