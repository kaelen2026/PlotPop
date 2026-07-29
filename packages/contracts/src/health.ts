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

export const dependencyStatusSchema = z.enum(["up", "down"]);

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

/**
 * One backing service, named the way operators talk about it rather than by
 * address: a readiness response is readable by anything that can reach the port,
 * so it carries no host, no credential and no failure text. The reason a
 * dependency is down goes to the logs.
 */
export const dependencyReportSchema = z.strictObject({
  name: z.string().min(1),
  status: dependencyStatusSchema,
});

export type DependencyReport = z.infer<typeof dependencyReportSchema>;

/**
 * Readiness answers "should traffic reach this instance", which liveness cannot:
 * a process can be perfectly alive while its database is unreachable. Reported
 * as `degraded` rather than an error, because the instance is the thing
 * answering and its own state is fine.
 */
export const readinessResponseSchema = z.strictObject({
  status: z.enum(["ready", "degraded"]),
  service: serviceNameSchema,
  dependencies: z.array(dependencyReportSchema),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
