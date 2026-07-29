import { describe, expect, it } from "vitest";
import { formatTimecode } from "./timecode";

/**
 * `docs/design-system.md` §13 gives timecodes one Mono typography treatment; this
 * gives them one format. A shot lasts seconds and an episode lasts minutes, so
 * both read as `m:ss` and stay comparable down a column.
 */

describe("timecode", () => {
  it("pads the seconds so a column stays aligned", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(4)).toBe("0:04");
    expect(formatTimecode(65)).toBe("1:05");
  });

  it("keeps counting minutes past the hour rather than adding a field", () => {
    // A 5 to 10 minute episode never needs an hour field, and adding one only
    // when it overflows would change the width of the column.
    expect(formatTimecode(600)).toBe("10:00");
    expect(formatTimecode(3661)).toBe("61:01");
  });

  it("rounds to whole seconds", () => {
    expect(formatTimecode(4.4)).toBe("0:04");
    expect(formatTimecode(4.6)).toBe("0:05");
  });

  it("refuses a negative duration rather than printing one", () => {
    // A negative timecode means the caller computed a duration wrong; showing
    // "-1:-5" would hide that.
    expect(() => formatTimecode(-1)).toThrow();
  });
});
