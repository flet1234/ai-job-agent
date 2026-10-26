import z from "zod";

export const extractCvSchema = z.object({
  profileText: z.string().trim().min(1).max(50_000)
});
