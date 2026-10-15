import z from "zod";

export const analyzeJobSchema = z.object({
  jobDescription: z.string().trim().min(1).max(20000)
});
