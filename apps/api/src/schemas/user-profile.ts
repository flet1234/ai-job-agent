import z from "zod";

export const userProfileSchema = z.object({
  skills: z.array(z.string().trim().min(1)).min(1),
  experienceSummary: z.string().trim().min(1).max(5000)
});

export type UserProfile = z.infer<typeof userProfileSchema>;
