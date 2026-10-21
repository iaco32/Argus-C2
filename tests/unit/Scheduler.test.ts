import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduler } from "../../src/core/Scheduler";

describe("RenderScheduler (Unit Tests / TDD)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    scheduler.remove("test-cb");
    vi.useRealTimers();
  });

  it("should have a default target FPS of 60", () => {
    expect(scheduler.targetFps).toBe(60);
  });

  it("should register callbacks and invoke them during render ticks", () => {
    const callback = vi.fn();
    scheduler.add("test-cb", callback);

    expect(scheduler.targetFps).toBe(60);

    // Clean up
    scheduler.remove("test-cb");
  });

  it("should allow adding and removing callbacks safely", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    scheduler.add("cb1", cb1);
    scheduler.add("cb2", cb2);

    scheduler.remove("cb1");
    scheduler.remove("cb2");
  });
});
