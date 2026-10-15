export type UserProfile = {
  skills: string[];
  experienceSummary: string;
};

export function getUserProfile(): UserProfile {
  return {
    skills: ["TypeScript", "React", "Node.js"],
    experienceSummary: "I build web applications with React, Next.js, Node.js, and REST APIs."
  };
}
