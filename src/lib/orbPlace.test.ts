import { describe, expect, it } from "bun:test";

import { DEFAULT_ORB_PLACE, parseOrbPlace, snapOrbPlace } from "./orbPlace.ts";

describe("parseOrbPlace", () => {
  it("falls back to the default for nothing, bad JSON or a wrong shape", () => {
    expect(parseOrbPlace(null)).toEqual(DEFAULT_ORB_PLACE);
    expect(parseOrbPlace("{")).toEqual(DEFAULT_ORB_PLACE);
    expect(parseOrbPlace('{"side":"top","y":0.5}')).toEqual(DEFAULT_ORB_PLACE);
    expect(parseOrbPlace('{"side":"left","y":"half"}')).toEqual(DEFAULT_ORB_PLACE);
  });

  it("keeps a stored place, its height within the band", () => {
    expect(parseOrbPlace('{"side":"left","y":0.6}')).toEqual({ side: "left", y: 0.6 });
    expect(parseOrbPlace('{"side":"right","y":4}')).toEqual({ side: "right", y: 1 });
  });
});

describe("snapOrbPlace", () => {
  const area = { top: 60, bottom: 860, width: 400 };
  const orb = { width: 60, height: 200 };

  it("snaps to the side the orb's centre is on", () => {
    expect(snapOrbPlace({ ...orb, left: 100, top: 60 }, area).side).toBe("left");
    expect(snapOrbPlace({ ...orb, left: 200, top: 60 }, area).side).toBe("right");
  });

  it("keeps its height within the band, clamped at both ends", () => {
    expect(snapOrbPlace({ ...orb, left: 0, top: 360 }, area).y).toBe(0.5);
    expect(snapOrbPlace({ ...orb, left: 0, top: -40 }, area).y).toBe(0);
    expect(snapOrbPlace({ ...orb, left: 0, top: 900 }, area).y).toBe(1);
  });
});
