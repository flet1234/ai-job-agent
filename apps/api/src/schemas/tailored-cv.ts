import z from "zod";
import { cvProfileSchema } from "./cv-profile.js";
import { jobMatchSchema } from "./job-match.js";

const recommendationSchema = z.object({
  kind: z.enum(["add_to_cv", "learn", "clarify"]),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1)
});

export const tailoredCvResultSchema = z.object({
  tailoredCv: cvProfileSchema,
  match: jobMatchSchema,
  recommendations: z.array(recommendationSchema)
});

export type TailoredCvResult = z.infer<typeof tailoredCvResultSchema>;
