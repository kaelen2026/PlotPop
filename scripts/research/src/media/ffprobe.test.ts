import { describe, expect, it } from "vitest";
import { parseFfprobeJson, parseFrameRate } from "./ffprobe.js";

/**
 * Fixed output captured from `ffprobe -show_format -show_streams -print_format
 * json`, trimmed to the fields we read plus a few we do not, so an extra key
 * cannot break parsing.
 */
const probeOutput = {
  streams: [
    {
      index: 0,
      codec_name: "h264",
      codec_long_name: "H.264 / AVC / MPEG-4 AVC",
      profile: "High",
      codec_type: "video",
      width: 1280,
      height: 720,
      coded_width: 1280,
      pix_fmt: "yuv420p",
      r_frame_rate: "24/1",
      avg_frame_rate: "24/1",
      duration: "5.000000",
      bit_rate: "1500000",
      nb_frames: "120",
    },
    {
      index: 1,
      codec_name: "aac",
      codec_type: "audio",
      channels: 2,
      sample_rate: "48000",
      duration: "5.000000",
    },
  ],
  format: {
    filename: "shot-01.mp4",
    nb_streams: 2,
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    duration: "5.021000",
    size: "940000",
    bit_rate: "1497000",
  },
};

type ProbeParts = {
  readonly video: Record<string, unknown>;
  readonly audio: Record<string, unknown>;
  readonly format: Record<string, unknown>;
};

type ProbeOutput = {
  streams: Record<string, unknown>[];
  format: Record<string, unknown>;
};

/** A deep copy of the fixture with the two streams handed over by name. */
function cloneProbe(mutate: (parts: ProbeParts) => void = () => {}): ProbeOutput {
  const output = structuredClone(probeOutput) as unknown as ProbeOutput;
  const [video, audio] = output.streams;

  if (!video || !audio) throw new Error("fixture must hold a video and an audio stream");
  mutate({ video, audio, format: output.format });

  return output;
}

describe("frame rate parsing", () => {
  it("reads an integer rational", () => {
    expect(parseFrameRate("24/1")).toBe(24);
  });

  it("reads NTSC rationals without losing the drop-frame offset", () => {
    expect(parseFrameRate("30000/1001")).toBe(29.97);
    expect(parseFrameRate("24000/1001")).toBe(23.976);
  });

  it("treats ffprobe's unknown rate as unknown rather than zero", () => {
    expect(parseFrameRate("0/0")).toBeNull();
  });

  it("rejects anything that is not a rational", () => {
    expect(parseFrameRate("24")).toBeNull();
    expect(parseFrameRate("")).toBeNull();
    expect(parseFrameRate("a/b")).toBeNull();
  });
});

describe("ffprobe output parsing", () => {
  it("reads the facts §5.2 asks for off a generated clip", () => {
    const facts = parseFfprobeJson(probeOutput);

    expect(facts).toEqual({
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      videoCodec: "h264",
      width: 1280,
      height: 720,
      frameRate: 24,
      durationSeconds: 5.021,
      bitrateBps: 1_497_000,
      pixelFormat: "yuv420p",
      frameCount: 120,
      audio: { codec: "aac", channels: 2, sampleRateHz: 48_000 },
    });
  });

  it("reports a silent clip as having no audio, not as a parse failure", () => {
    // A video model that returns no audio track is a fact about the provider
    // worth recording, not a broken file.
    const output = cloneProbe();
    output.streams = output.streams.slice(0, 1);

    expect(parseFfprobeJson(output).audio).toBeNull();
  });

  it("prefers the container duration over the stream's, because that is what plays", () => {
    const output = cloneProbe(({ video }) => {
      video.duration = "4.000000";
    });

    expect(parseFfprobeJson(output).durationSeconds).toBe(5.021);
  });

  it("falls back to the video stream duration when the container has none", () => {
    const output = cloneProbe(({ format }) => {
      delete format.duration;
    });

    expect(parseFfprobeJson(output).durationSeconds).toBe(5);
  });

  it("falls back to r_frame_rate when the average is unknown", () => {
    const output = cloneProbe(({ video }) => {
      video.avg_frame_rate = "0/0";
    });

    expect(parseFfprobeJson(output).frameRate).toBe(24);
  });

  it("refuses a file with no video stream", () => {
    const output = cloneProbe();
    output.streams = output.streams.slice(1);

    expect(() => parseFfprobeJson(output)).toThrow(/no video stream/i);
  });

  it("refuses a file whose frame rate is unknown from both fields", () => {
    const output = cloneProbe(({ video }) => {
      video.avg_frame_rate = "0/0";
      video.r_frame_rate = "0/0";
    });

    expect(() => parseFfprobeJson(output)).toThrow(/frame rate/i);
  });

  it("refuses a file with no duration anywhere, so a zero cannot reach the per-minute maths", () => {
    const output = cloneProbe(({ video, format }) => {
      delete format.duration;
      delete video.duration;
    });

    expect(() => parseFfprobeJson(output)).toThrow(/duration/i);
  });

  it("refuses output that is not ffprobe json at all", () => {
    expect(() => parseFfprobeJson({ hello: "world" })).toThrow();
  });

  it("keeps an audio track whose sample rate ffprobe did not report", () => {
    const output = cloneProbe(({ audio }) => {
      delete audio.sample_rate;
    });

    expect(parseFfprobeJson(output).audio).toEqual({
      codec: "aac",
      channels: 2,
      sampleRateHz: null,
    });
  });

  it("records an absent bitrate as unknown rather than zero", () => {
    const output = cloneProbe(({ video, format }) => {
      delete format.bit_rate;
      delete video.bit_rate;
    });

    expect(parseFfprobeJson(output).bitrateBps).toBeNull();
  });
});
