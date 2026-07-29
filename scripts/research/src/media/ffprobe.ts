import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

/**
 * Reads the measurable facts about a generated clip.
 *
 * `.claude/rules/tdd.md` §4 draws the line this file sits on: how a shot *looks*
 * is a human judgement, but resolution, frame rate, codec and duration are
 * measurable, so those are what automation asserts. They also answer questions the
 * eye cannot: whether the provider silently returned 24fps for a 30fps request,
 * or 4.6 seconds for a 5 second one — which changes both the tier definition and
 * every per-minute cost figure.
 *
 * The parsing is separated from the subprocess on purpose. The parse is where the
 * bugs live and it is driven by fixed captured output; spawning ffprobe is a real
 * boundary and gets no unit test.
 */

export const mediaFactsSchema = z.strictObject({
  container: z.string().min(1),
  videoCodec: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: z.number().positive(),
  durationSeconds: z.number().positive(),
  bitrateBps: z.number().int().positive().nullable(),
  pixelFormat: z.string().nullable(),
  frameCount: z.number().int().positive().nullable(),
  audio: z
    .strictObject({
      codec: z.string().min(1),
      channels: z.number().int().positive(),
      sampleRateHz: z.number().int().positive().nullable(),
    })
    .nullable(),
});

export type MediaFacts = z.infer<typeof mediaFactsSchema>;

/** ffprobe emits far more fields than we read; loose objects keep the extras. */
const streamSchema = z.looseObject({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  pix_fmt: z.string().optional(),
  r_frame_rate: z.string().optional(),
  avg_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  bit_rate: z.string().optional(),
  nb_frames: z.string().optional(),
  channels: z.number().int().positive().optional(),
  sample_rate: z.string().optional(),
});

const ffprobeOutputSchema = z.looseObject({
  streams: z.array(streamSchema).min(1),
  format: z.looseObject({
    format_name: z.string().min(1),
    duration: z.string().optional(),
    bit_rate: z.string().optional(),
  }),
});

/**
 * ffprobe reports frame rates as rationals, and `0/0` for "unknown".
 *
 * Broadcast rates are genuinely non-integer — 30000/1001 is 29.97, not 30 — so
 * rounding to a whole number would erase exactly the mismatch worth catching. The
 * result is rounded to three decimals so 23.976 stays 23.976 and float noise does
 * not reach the report.
 */
export function parseFrameRate(value: string): number | null {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) return null;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (denominator === 0 || numerator === 0) return null;

  return Math.round((numerator / denominator) * 1000) / 1000;
}

function toPositiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toPositiveInteger(value: string | undefined): number | null {
  const parsed = toPositiveNumber(value);

  return parsed === null ? null : Math.round(parsed);
}

export function parseFfprobeJson(raw: unknown): MediaFacts {
  const output = ffprobeOutputSchema.parse(raw);
  const video = output.streams.find((stream) => stream.codec_type === "video");

  if (!video) throw new Error("ffprobe found no video stream in the generated file");
  if (video.width === undefined || video.height === undefined) {
    throw new Error("ffprobe reported a video stream with no frame size");
  }

  const frameRate =
    parseFrameRate(video.avg_frame_rate ?? "") ?? parseFrameRate(video.r_frame_rate ?? "");
  if (frameRate === null) {
    throw new Error("ffprobe could not report a frame rate for the generated file");
  }

  // Container duration first: that is the length the clip plays for, and the
  // number every per-minute figure divides by. A stream duration can be shorter
  // than the file it sits in.
  const durationSeconds =
    toPositiveNumber(output.format.duration) ?? toPositiveNumber(video.duration);
  if (durationSeconds === null) {
    throw new Error("ffprobe could not report a duration for the generated file");
  }

  const audio = output.streams.find((stream) => stream.codec_type === "audio");

  return mediaFactsSchema.parse({
    container: output.format.format_name,
    videoCodec: video.codec_name ?? "unknown",
    width: video.width,
    height: video.height,
    frameRate,
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    bitrateBps: toPositiveInteger(output.format.bit_rate) ?? toPositiveInteger(video.bit_rate),
    pixelFormat: video.pix_fmt ?? null,
    frameCount: toPositiveInteger(video.nb_frames),
    audio:
      audio && audio.codec_name !== undefined && audio.channels !== undefined
        ? {
            codec: audio.codec_name,
            channels: audio.channels,
            sampleRateHz: toPositiveInteger(audio.sample_rate),
          }
        : null,
  });
}

const run = promisify(execFile);

export const ffprobeArguments = [
  "-v",
  "error",
  "-print_format",
  "json",
  "-show_format",
  "-show_streams",
] as const;

/**
 * Runs ffprobe over a downloaded clip.
 *
 * A missing ffprobe is reported as a setup problem rather than as a failed
 * generation: the clip is fine, the machine is not, and confusing the two would
 * put a fake failure in the run log after a paid generation succeeded.
 */
export async function probeMediaFile(
  filePath: string,
  binary = process.env.PLOTPOP_RESEARCH_FFPROBE ?? "ffprobe",
): Promise<MediaFacts> {
  try {
    const { stdout } = await run(binary, [...ffprobeArguments, filePath]);

    return parseFfprobeJson(JSON.parse(stdout));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Cannot run ${binary}. Install ffmpeg (which ships ffprobe), or point ` +
          "PLOTPOP_RESEARCH_FFPROBE at the binary.",
      );
    }

    throw error;
  }
}
