import { readFileSync } from "node:fs";
import { expect, test } from "@jest/globals";
import { analyzeJob } from "../dist/services/analyze-job.js";

const cases = JSON.parse(readFileSync(new URL("./job-analysis.json", import.meta.url), "utf8"));

const requiredInRequired = (result, example) => {
  return result.requirements.some((item) => item.toLowerCase().includes(example.expectedRequiredTechnologies[0].toLowerCase()));
};
const requiredInTech = (result, example) => {
  return result.technologies.some((item) => item.toLowerCase() === example.expectedRequiredTechnologies[0].toLowerCase());
};

const excludedInRequired = (result, example) => {
  return result.requirements.some((item) => item.toLowerCase().includes(example.excludedTechnologies[0].toLowerCase()));
};
const excludedInTech = (result, example) => {
  return result.technologies.some((item) => item.toLowerCase() === example.excludedTechnologies[0].toLowerCase());
};

const optionalInRequired = (result, example) => {
  if (example.optionalTechnologies.length) {
    return result.requirements.some((item) => item.toLowerCase().includes(example.optionalTechnologies[0].toLowerCase()));
  }
  return false;
};

const optionalInTech = (result, example) => {
  if (example.optionalTechnologies.length) {
    return result.technologies.some((item) => item.toLowerCase() === example.optionalTechnologies[0].toLowerCase());
  }
  return true;
};

test.each(cases)("$id", async (example) => {
  const result = await analyzeJob(example.input);

  expect(result.seniority).toBe(example.expectedSeniority);
  expect(requiredInRequired(result, example)).toBe(true);
  expect(requiredInTech(result, example)).toBe(true);
  expect(excludedInRequired(result, example)).toBe(false);
  expect(excludedInTech(result, example)).toBe(false);
  expect(optionalInRequired(result, example)).toBe(false);
  expect(optionalInTech(result, example)).toBe(true);
});
