import express from "express";
import { analyzeJobSchema } from "./schemas/analyze-job.js";
import { analyzeJob } from "./services/analyze-job.js";
import OpenAI from "openai";
import { matchJob } from "./services/match-job.js";
import { matchJobRequestSchema } from "./schemas/job-match-request.js";

export const app = express();

app.use(express.json({ limit: 100000 }));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/analyze-job", async (req, res) => {
  const result = analyzeJobSchema.safeParse(req.body);
  if (result.success) {
    try {
      const analysis = await analyzeJob(result.data.jobDescription);
      res.status(200).json({ analysis });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error("OpenAI request failed", {
          status: error.status,
          code: error.code,
          type: error.type
        });
      } else {
        console.error("Unexpected analysis failure", {
          name: error instanceof Error ? error.name : "Unknown"
        });
      }
      res.status(502).json({ error: "Job analysis provider request failed" });
    }
  } else {
    res.status(400).json({ error: "Invalid Job Description" });
    return;
  }
});

app.post("/match-job", async (req, res) => {
  const result = matchJobRequestSchema.safeParse(req.body);
  if (result.success) {
    try {
      const jobAnalysis = await analyzeJob(result.data.jobDescription);
      const match = await matchJob(jobAnalysis, result.data.userProfile);
      res.status(200).json({ jobAnalysis, match });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error("OpenAI request failed", {
          status: error.status,
          code: error.code,
          type: error.type
        });
      } else {
        console.error("Unexpected job match failure", {
          name: error instanceof Error ? error.name : "Unknown"
        });
      }
      res.status(502).json({ error: "Job match provider request failed" });
    }
  } else {
    res.status(400).json({ error: "Invalid match job request" });
    return;
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});
