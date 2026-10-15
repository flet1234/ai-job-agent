import type { Tool } from "openai/resources/responses/responses.js";

export const jobAnalysisTools: Tool[] = [
  {
    type: "function",
    name: "get_user_profile",
    description:
      "Get the authenticated user's skills and experience summary. Use this when comparing a job description with the user's background.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    strict: true
  }
];
