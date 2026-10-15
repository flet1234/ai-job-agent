import { getUserProfile } from "./get-user-profile.js";

export function executeJobAnalysisTool(name: string): unknown {
  if (name === "get_user_profile") {
    return getUserProfile();
  } else {
    throw new Error(`Unsupported job-analysis tool: ${name}`);
  }
}
