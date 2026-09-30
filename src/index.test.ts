import { describe, expect, it } from "vitest";
import "./index.ts";

describe("bundle entry", () => {
  it("registers the nectar-survey element", () => {
    expect(customElements.get("nectar-survey")).toBeDefined();
  });
});
