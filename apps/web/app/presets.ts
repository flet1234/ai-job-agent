export type PresetId = "classic_compact" | "modern_ats";

export interface StylePreset {
  id: PresetId;
  name: string;
  tagline: string;
  badge: string;
  description: string;
  docx: {
    font: string;
    bodySize: number; // in half-points (20 = 10pt)
    bodyColor: string;
    headingColor: string;
    headingSize: number;
    headingBorderColor: string;
    headingBorderSize: number;
    nameSize: number;
    nameColor: string;
    contactColor: string;
    linkColor: string;
    margins: { top: number; right: number; bottom: number; left: number };
    experienceLayout: "inline-dates" | "split-tab";
    educationLayout: "inline-dates" | "split-tab";
    skillsUppercaseCategory: boolean;
    sectionTitles: {
      summary: string;
      skills: string;
      experience: string;
      projects: string;
      education: string;
      certifications: string;
      languages: string;
    };
  };
  web: {
    fontFamily: string;
    primaryColor: string;
    headingColor: string;
    headingBorderColor: string;
    nameColor: string;
    subtextColor: string;
    linkColor: string;
    cardBorder: string;
    badgeBg: string;
    badgeText: string;
    accentGlow: string;
  };
}

export const PRESETS: Record<PresetId, StylePreset> = {
  classic_compact: {
    id: "classic_compact",
    name: "Classic Compact (Maksim's CV)",
    tagline: "High-density 1-page layout matching Maksim's CV",
    badge: "1-Page Match",
    description:
      "Exact match to the provided CV: centered header, uppercase underlined headings, inline dates ('02/2026 – 09/2026 – Title at Company'), single-line education and languages, and compact margins.",
    docx: {
      font: "Arial",
      bodySize: 19, // 9.5pt
      bodyColor: "000000",
      headingColor: "000000",
      headingSize: 21, // 10.5pt
      headingBorderColor: "000000",
      headingBorderSize: 6, // 0.75pt border
      nameSize: 40, // 20pt
      nameColor: "000000",
      contactColor: "111827",
      linkColor: "0563C1",
      margins: { top: 600, right: 650, bottom: 600, left: 650 },
      experienceLayout: "inline-dates",
      educationLayout: "inline-dates",
      skillsUppercaseCategory: true,
      sectionTitles: {
        summary: "SUMMARY",
        skills: "TECHNICAL SKILLS",
        experience: "PROFESSIONAL EXPERIENCE",
        projects: "PROJECTS",
        education: "EDUCATION",
        certifications: "CERTIFICATIONS",
        languages: "SPOKEN LANGUAGES"
      }
    },
    web: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      primaryColor: "#000000",
      headingColor: "#000000",
      headingBorderColor: "#000000",
      nameColor: "#000000",
      subtextColor: "#374151",
      linkColor: "#0563C1",
      cardBorder: "#D1D5DB",
      badgeBg: "#F3F4F6",
      badgeText: "#111827",
      accentGlow: "rgba(0, 0, 0, 0.05)"
    }
  },
  modern_ats: {
    id: "modern_ats",
    name: "Modern Tech (ATS High-Scorer)",
    tagline: "Engineered for ATS Parsers & Tech Recruiters",
    badge: "ATS Optimized",
    description:
      "Optimized for applicant tracking systems (Greenhouse, Lever, Workday): Aptos typography, deep-navy accents (#1E3A8A), two-column right-aligned dates via tab stops, headline support, and scannable visual hierarchy.",
    docx: {
      font: "Aptos",
      bodySize: 20, // 10pt
      bodyColor: "1E293B",
      headingColor: "1E3A8A",
      headingSize: 23, // 11.5pt
      headingBorderColor: "1E3A8A",
      headingBorderSize: 8, // 1pt border
      nameSize: 44, // 22pt
      nameColor: "1E3A8A",
      contactColor: "334155",
      linkColor: "0969DA",
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
      experienceLayout: "split-tab",
      educationLayout: "split-tab",
      skillsUppercaseCategory: false,
      sectionTitles: {
        summary: "PROFESSIONAL SUMMARY",
        skills: "TECHNICAL SKILLS",
        experience: "WORK EXPERIENCE",
        projects: "KEY PROJECTS",
        education: "EDUCATION",
        certifications: "CERTIFICATIONS",
        languages: "LANGUAGES"
      }
    },
    web: {
      fontFamily: 'system-ui, -apple-system, "Aptos", "Calibri", sans-serif',
      primaryColor: "#1E3A8A",
      headingColor: "#1E3A8A",
      headingBorderColor: "#1E3A8A",
      nameColor: "#1E3A8A",
      subtextColor: "#475569",
      linkColor: "#0969DA",
      cardBorder: "#93C5FD",
      badgeBg: "#EFF6FF",
      badgeText: "#1E40AF",
      accentGlow: "rgba(30, 58, 138, 0.08)"
    }
  }
};

