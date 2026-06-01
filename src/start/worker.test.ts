import { describe, expect, test } from "bun:test";
import {
  getDashboardAppealStatus,
  getPendingAppealWaitMs,
  getSameEmailSubmissionWaitMs,
} from "./worker";

describe("worker pending appeal timeout", () => {
  test("waits while the latest appeal is pending and under 48 hours old", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 47 * 60 * 60 * 1000;

    expect(getPendingAppealWaitMs({ submittedAt }, now)).toBe(60 * 60 * 1000);
  });

  test("allows a new appeal once the pending appeal is at least 48 hours old", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 48 * 60 * 60 * 1000;

    expect(getPendingAppealWaitMs({ submittedAt }, now)).toBe(0);
  });

  test("does not wait when the latest appeal has a final response", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 30 * 60 * 60 * 1000;

    expect(getPendingAppealWaitMs({ submittedAt, responseStatus: "rejected" }, now)).toBe(0);
  });

  test("marks unanswered appeals stale after 48 hours for the dashboard", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 48 * 60 * 60 * 1000;

    expect(getDashboardAppealStatus({ submittedAt }, now)).toBe("stale");
  });

  test("keeps unanswered appeals submitted before the stale timeout", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 47 * 60 * 60 * 1000;

    expect(getDashboardAppealStatus({ submittedAt }, now)).toBe("submitted");
  });

  test("waits between same-email submissions until the configured delay elapses", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 4 * 60 * 1000;

    expect(getSameEmailSubmissionWaitMs({ submittedAt }, now, 5)).toBe(60_000);
  });

  test("does not wait between same-email submissions after the delay elapses", () => {
    const now = 1_700_000_000_000;
    const submittedAt = now - 5 * 60 * 1000;

    expect(getSameEmailSubmissionWaitMs({ submittedAt }, now, 5)).toBe(0);
  });
});
