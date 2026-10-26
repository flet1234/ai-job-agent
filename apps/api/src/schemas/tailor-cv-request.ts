import z from "zod";
import { cvProfileSchema } from "./cv-profile.js";

export const tailorCvRequestSchema = z.object({
  jobDescription: z.string().trim().min(1).max(20_000),
  cvProfile: cvProfileSchema
});
