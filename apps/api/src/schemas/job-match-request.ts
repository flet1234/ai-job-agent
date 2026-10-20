import { analyzeJobSchema } from "./analyze-job.js";
import { userProfileSchema } from "./user-profile.js";

export const matchJobRequestSchema = analyzeJobSchema.extend({
  userProfile: userProfileSchema
});
