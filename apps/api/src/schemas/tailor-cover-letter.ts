import z from "zod";
import { cvProfileSchema } from "./cv-profile.js";
import { tailorSectionSchema } from "./tailor-cv-request.js";

const recommendationSchema = z.object({
  kind: z.enum(["add_to_cv", "learn", "clarify", "unverified_addition"]),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1)
});

export const tailorCoverLetterRequestSchema = z.object({
  jobDescription: z.string().trim().min(1).max(20_000),
  cvProfile: cvProfileSchema,
  tailoredCv: cvProfileSchema.optional(),
  tailorSections: z.array(tailorSectionSchema).optional(),
  idealResumeMode: z.boolean().default(false)
});

export type TailorCoverLetterRequest = z.infer<typeof tailorCoverLetterRequestSchema>;

export const tailorCoverLetterResultSchema = z.object({
  coverLetter: z.string().trim().min(1),
  recommendations: z.array(recommendationSchema).default([])
});

export type TailorCoverLetterResult = z.infer<typeof tailorCoverLetterResultSchema>;

