export type CvProfile = {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
  professionalSummary: string | null;
  skillGroups: Array<{
    name: string;
    skills: string[];
  }>;
  languages: Array<{
    name: string;
    proficiency: string | null;
  }>;
  workExperience: Array<{
    title: string;
    company: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    highlights: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    graduationDate: string | null;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    highlights: string[];
  }>;
  certifications: string[];
};

export type Recommendation = {
  kind: "add_to_cv" | "learn" | "clarify";
  title: string;
  explanation: string;
};

export type TailorCvResponse = {
  tailoredCv: CvProfile;
  match: {
    matchScore: number;
    matchingSkills: string[];
    missingSkills: string[];
    relevantExperience: string[];
    recommendation: string;
  };
  recommendations: Recommendation[];
};

export type StoredCv = {
  sourceText: string;
  cvProfile: CvProfile;
  savedAt: string;
};
