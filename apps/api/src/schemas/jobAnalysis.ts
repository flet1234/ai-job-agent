import z from "zod";

export const jobAnalysisSchema = z.object({
  title: z.string().nullable(),
  seniority: z.string().nullable(),
  technologies: z.array(z.string()),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string())
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
