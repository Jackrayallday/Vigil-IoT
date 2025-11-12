import { describe, expect, it } from "vitest";
import { defaultScanName, tokenize, isValidIPv4OrCidr } from "../NewScanWizard.jsx";

describe("tokenize", () => {
  it("splits comma, newline, and whitespace delimiters", () => {
    const input = "10.0.0.1,10.0.0.2\n10.0.0.3  10.0.0.4";
    expect(tokenize(input)).toEqual(["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]);
  });

  it("omits empty tokens created by stray separators", () => {
    const input = "192.168.1.10,\n,192.168.1.11";
    expect(tokenize(input)).toEqual(["192.168.1.10", "192.168.1.11"]);
  });

  it("preserves order and trims each token", () => {
    const input = "   10.1.1.0/24   10.1.2.0/24 ";
    expect(tokenize(input)).toEqual(["10.1.1.0/24", "10.1.2.0/24"]);
  });
});

describe("isValidIPv4OrCidr", () => {
  it("accepts IPv4 addresses without a CIDR suffix", () => {
    expect(isValidIPv4OrCidr("172.16.0.5")).toBe(true);
  });

  it("accepts IPv4 addresses with CIDR masks between 0 and 32", () => {
    expect(isValidIPv4OrCidr("10.0.0.0/24")).toBe(true);
    expect(isValidIPv4OrCidr("192.168.0.0/0")).toBe(true);
    expect(isValidIPv4OrCidr("192.168.0.0/32")).toBe(true);
  });

  it("rejects octet values outside the valid range", () => {
    expect(isValidIPv4OrCidr("256.0.0.1")).toBe(false);
    expect(isValidIPv4OrCidr("10.0.0.999")).toBe(false);
  });

  it("rejects CIDR masks outside the 0-32 range", () => {
    expect(isValidIPv4OrCidr("10.0.0.0/33")).toBe(false);
    expect(isValidIPv4OrCidr("10.0.0.0/-1")).toBe(false);
  });

  it("rejects malformed IPv4 strings", () => {
    expect(isValidIPv4OrCidr("10.0..0.1")).toBe(false);
    expect(isValidIPv4OrCidr("")).toBe(false);
  });
});

describe("defaultScanName", () => {
  it("returns a timestamped string prefixed with 'Scan'", () => {
    const name = defaultScanName();
    expect(name.startsWith("Scan ")).toBe(true);
    expect(name).toMatch(/^Scan \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
