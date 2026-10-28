import express from "express";
import { analyzeJobSchema } from "./schemas/analyze-job.js";
import { analyzeJob } from "./services/analyze-job.js";
import OpenAI from "openai";
import { matchJob } from "./services/match-job.js";
import { matchJobRequestSchema } from "./schemas/job-match-request.js";
import cors from "cors";
import { extractCvSchema } from "./schemas/extract-cv.js";
import { extractCvProfile } from "./services/extract-cv-profile.js";
import { tailorCvRequestSchema } from "./schemas/tailor-cv-request.js";
import { tailorCv } from "./services/tailor-cv.js";
import { tailorCoverLetterRequestSchema } from "./schemas/tailor-cover-letter.js";
import { tailorCoverLetter } from "./services/tailor-cover-letter.js";

export const app = express();

app.use(
  cors({
    origin: "http://localhost:3000"
  })
);

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

app.post("/extract-cv", async (req, res) => {
  const result = extractCvSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid CV extraction request" });
    return;
  }

  try {
    const cvProfile = await extractCvProfile(result.data.profileText);
    res.status(200).json({ cvProfile });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI request failed", {
        status: error.status,
        code: error.code,
        type: error.type
      });
    } else {
      console.error("Unexpected CV extraction failure", {
        name: error instanceof Error ? error.name : "Unknown"
      });
    }
    res.status(502).json({ error: "CV extraction provider request failed" });
  }
});

app.post("/tailor-cv", async (req, res) => {
  const result = tailorCvRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid CV tailoring request" });
    return;
  }

  try {
    const jobAnalysis = await analyzeJob(result.data.jobDescription);
    const tailoredResult = await tailorCv(jobAnalysis, result.data.cvProfile, {
      tailorSections: result.data.tailorSections,
      maxPages: result.data.maxPages,
      includeCoverLetter: result.data.includeCoverLetter,
      idealResumeMode: result.data.idealResumeMode
    });
    res.status(200).json({ jobAnalysis, ...tailoredResult });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI request failed", {
        status: error.status,
        code: error.code,
        type: error.type
      });
    } else {
      console.error("Unexpected CV tailoring failure", {
        name: error instanceof Error ? error.name : "Unknown"
      });
    }
    res.status(502).json({ error: "CV tailoring provider request failed" });
  }
});

app.post("/tailor-cover-letter", async (req, res) => {
  const result = tailorCoverLetterRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid cover letter tailoring request" });
    return;
  }

  try {
    const jobAnalysis = await analyzeJob(result.data.jobDescription);
    const coverLetterResult = await tailorCoverLetter(jobAnalysis, result.data.cvProfile, {
      tailoredCv: result.data.tailoredCv,
      idealResumeMode: result.data.idealResumeMode
    });
    res.status(200).json({ jobAnalysis, ...coverLetterResult });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI request failed", {
        status: error.status,
        code: error.code,
        type: error.type
      });
    } else {
      console.error("Unexpected cover letter tailoring failure", {
        name: error instanceof Error ? error.name : "Unknown"
      });
    }
    res.status(502).json({ error: "Cover letter tailoring provider request failed" });
  }
});

app.post("/generate-cover-letter", async (req, res) => {
  const result = tailorCoverLetterRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid cover letter tailoring request" });
    return;
  }

  try {
    const jobAnalysis = await analyzeJob(result.data.jobDescription);
    const coverLetterResult = await tailorCoverLetter(jobAnalysis, result.data.cvProfile, {
      tailoredCv: result.data.tailoredCv,
      idealResumeMode: result.data.idealResumeMode
    });
    res.status(200).json({ jobAnalysis, ...coverLetterResult });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI request failed", {
        status: error.status,
        code: error.code,
        type: error.type
      });
    } else {
      console.error("Unexpected cover letter tailoring failure", {
        name: error instanceof Error ? error.name : "Unknown"
      });
    }
    res.status(502).json({ error: "Cover letter tailoring provider request failed" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});
