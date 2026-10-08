import { test, expect } from "vitest";
import { SharedHandMesh } from "../../src/hands/SharedHandMesh.ts";

test("occlusion requests share one implicit mesh and explicit tracking takes ownership", () => {
    let created = 0, removed = 0;
    const registry = new SharedHandMesh(() => { created++; return () => removed++; });
    const a = registry.request(), b = registry.request();
    expect(created).toBe(1);
    a(); a(); expect(removed).toBe(0);
    const explicit = registry.provide({}); expect(removed).toBe(1);
    const c = registry.request(); expect(created).toBe(1);
    b(); c(); expect(removed).toBe(1); // Explicit components are caller-owned.
    const d = registry.request(); explicit(); expect(created).toBe(2);
    d(); d(); expect(removed).toBe(2);
});

test("removing one of several explicit providers does not create another model", () => {
    let created = 0;
    const registry = new SharedHandMesh(() => { created++; return () => {}; });
    const a = registry.provide({}), b = registry.provide({}), request = registry.request();
    a(); expect(created).toBe(0); b(); expect(created).toBe(1); request();
});
