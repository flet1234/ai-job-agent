import { readFileSync } from "node:fs";
import { expect, test } from "@jest/globals";
import { matchJob } from "../dist/services/match-job.js";

const cases = JSON.parse(readFileSync(new URL("./job-match.json", import.meta.url), "utf8"));

test.each(cases)("$id", async (example) => {
  const match = await matchJob(example.jobAnalysis, example.userProfile);

  const matchingSkills = match.matchingSkills.map((skill) => skill.toLowerCase());
  const missingSkillsText = match.missingSkills.join(" ").toLowerCase();

  for (const skill of example.expectedMatchingSkills) {
    expect(matchingSkills).toContain(skill.toLowerCase());
  }

  for (const skill of example.expectedMissingSkills) {
    expect(missingSkillsText).toContain(skill.toLowerCase());
  }

  for (const forbiddenText of example.forbiddenMissingSkills) {
    expect(missingSkillsText).not.toContain(forbiddenText.toLowerCase());
  }
});
