import { describe, expect, it } from "vitest";
import { credsFor, MissingEnvError, optionalEnv, requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(requireEnv({ FOO: "bar" }, "FOO")).toBe("bar");
  });

  it("throws a MissingEnvError naming the missing var when unset", () => {
    expect(() => requireEnv({}, "FOO")).toThrow(MissingEnvError);
    expect(() => requireEnv({}, "FOO")).toThrow(/FOO is not set/);
  });

  it("throws when the value is an empty string", () => {
    expect(() => requireEnv({ FOO: "" }, "FOO")).toThrow(MissingEnvError);
  });
});

describe("optionalEnv", () => {
  it("returns the value when set", () => {
    expect(optionalEnv({ FOO: "bar" }, "FOO", "fallback")).toBe("bar");
  });

  it("returns the fallback when unset", () => {
    expect(optionalEnv({}, "FOO", "fallback")).toBe("fallback");
  });

  it("returns the fallback when the value is an empty string", () => {
    expect(optionalEnv({ FOO: "" }, "FOO", "fallback")).toBe("fallback");
  });
});

describe("credsFor", () => {
  it("defaults the email to the fixed demo cast address for the persona", () => {
    const creds = credsFor({ DEMO_STAFF_PASSWORD: "secret" }, "staff");
    expect(creds).toEqual({ email: "demo-staff@bluebird.demo", password: "secret" });
  });

  it("uses a per-persona email override when set", () => {
    const creds = credsFor(
      { DEMO_COACH_EMAIL: "coach@example.com", DEMO_COACH_PASSWORD: "secret" },
      "coach"
    );
    expect(creds.email).toBe("coach@example.com");
  });

  it("throws when the persona's password is missing", () => {
    expect(() => credsFor({}, "admin")).toThrow(/DEMO_ADMIN_PASSWORD is not set/);
  });

  it("never falls back to a default password", () => {
    // Regression guard: a missing password must never resolve to an empty
    // string or a guessable default — that would silently attempt to sign
    // in with bad credentials instead of failing loudly.
    expect(() => credsFor({ DEMO_STAFF_PASSWORD: "" }, "staff")).toThrow(MissingEnvError);
  });
});
