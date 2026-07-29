import { z } from "zod";

export const serviceNameSchema = z.enum(["web", "api", "worker"]);

export type ServiceName = z.infer<typeof serviceNameSchema>;

/**
 * Liveness payload shared by every service. A service that is not alive cannot
 * answer at all, so `status` carries exactly one member: absence is the failure
 * signal. Readiness, which reports on dependencies, is a separate contract.
 */
export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: serviceNameSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
