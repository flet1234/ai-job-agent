import z from "zod";

export const jobMatchSchema = z.object({
  matchScore: z.int().min(0).max(100),
  matchingSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  relevantExperience: z.array(z.string()),
  recommendation: z.string()
});

export type JobMatch = z.infer<typeof jobMatchSchema>;
