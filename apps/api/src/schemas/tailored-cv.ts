import z from "zod";
import { cvProfileSchema } from "./cv-profile.js";
import { jobMatchSchema } from "./job-match.js";

const recommendationSchema = z.object({
  kind: z.enum(["add_to_cv", "learn", "clarify", "unverified_addition"]),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1)
});

export const tailoredCvResultSchema = z.object({
  tailoredCv: cvProfileSchema,
  match: jobMatchSchema,
  recommendations: z.array(recommendationSchema),
  coverLetter: z.string().trim().min(1).nullable()
});

export type TailoredCvResult = z.infer<typeof tailoredCvResultSchema>;
