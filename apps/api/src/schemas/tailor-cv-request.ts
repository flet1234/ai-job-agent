import z from "zod";
import { cvProfileSchema } from "./cv-profile.js";

export const tailorSectionSchema = z.enum([
  "headline",
  "professionalSummary",
  "skillGroups",
  "languages",
  "workExperience",
  "education",
  "projects",
  "certifications"
]);

export type TailorSection = z.infer<typeof tailorSectionSchema>;

export const tailorCvRequestSchema = z.object({
  jobDescription: z.string().trim().min(1).max(20_000),
  cvProfile: cvProfileSchema,
  tailorSections: z.array(tailorSectionSchema),
  maxPages: z.int().min(1).max(5),
  includeCoverLetter: z.boolean(),
  idealResumeMode: z.boolean()
});
