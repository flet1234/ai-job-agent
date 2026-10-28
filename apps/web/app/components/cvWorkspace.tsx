"use client";

import { useEffect, useState } from "react";
import type { CvProfile, StoredCv, TailorCvResponse } from "../types";
import { PRESETS, type PresetId } from "../presets";

const storageKey = "ai-job-agent.saved-cv.v1";
const apiUrl = "http://127.0.0.1:3001";
const sectionOptions = [
  { value: "headline", label: "Headline" },
  { value: "professionalSummary", label: "Professional summary" },
  { value: "skillGroups", label: "Technical skills" },
  { value: "languages", label: "Languages" },
  { value: "workExperience", label: "Work experience" },
  { value: "education", label: "Education" },
  { value: "projects", label: "Projects" },
  { value: "certifications", label: "Certifications" }
] as const;

type TailorSection = (typeof sectionOptions)[number]["value"];

const LOADING_STEPS = [
  "Analyzing job requirements & core keywords…",
  "Evaluating your skills & experience match…",
  "Refining achievements and highlights for ATS…",
  "Formatting CV in selected preset & generating insights…"
];

function linkLabel(link: string, index: number): string {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) return "LinkedIn";
    if (hostname === "github.com" || hostname.endsWith(".github.com")) return "GitHub";
    if (hostname === "gitlab.com" || hostname.endsWith(".gitlab.com")) return "GitLab";
    return hostname || `Link ${index + 1}`;
  } catch {
    return `Link ${index + 1}`;
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "docx") {
    const { default: JSZip } = await import("jszip");
    const archive = await JSZip.loadAsync(await file.arrayBuffer());
    const documentXml = await archive.file("word/document.xml")?.async("text");
    if (!documentXml) throw new Error("This DOCX file does not contain readable document text.");

    const document = new DOMParser().parseFromString(documentXml, "application/xml");
    const visibleText = Array.from(document.getElementsByTagNameNS("*", "p"))
      .map((paragraph) =>
        Array.from(paragraph.getElementsByTagNameNS("*", "t"))
          .map((text) => text.textContent ?? "")
          .join("")
      )
      .join("\n")
      .trim();
    const relationshipsXml = await archive.file("word/_rels/document.xml.rels")?.async("text");
    const documentLinks = relationshipsXml
      ? Array.from(new DOMParser().parseFromString(relationshipsXml, "application/xml").getElementsByTagName("Relationship"))
          .filter((relationship) => relationship.getAttribute("TargetMode") === "External")
          .map((relationship) => relationship.getAttribute("Target"))
          .filter((target): target is string => Boolean(target))
      : [];

    return [...new Set([visibleText, ...documentLinks])].join("\n").trim();
  }

  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        const pageLinks = (await page.getAnnotations())
          .map((annotation) => ("url" in annotation && typeof annotation.url === "string" ? annotation.url : ""))
          .filter(Boolean);
        return [pageText, ...pageLinks].join("\n");
      })
    );
    return [...new Set(pages)].join("\n").trim();
  }

  throw new Error("Please choose a PDF or DOCX CV file.");
}

function renderCvText(cv: CvProfile): string {
  const experience = cv.workExperience
    .map((job) => `${job.title} — ${job.company}\n${job.highlights.map((item) => `• ${item}`).join("\n")}`)
    .join("\n\n");
  const projects = cv.projects
    .map((project) => `${project.name}\n${project.description}\n${project.highlights.map((item) => `• ${item}`).join("\n")}`)
    .join("\n\n");

  const education = cv.education
    .map((item) => [item.degree, item.fieldOfStudy, item.institution, item.graduationDate].filter(Boolean).join(" — "))
    .join("\n");

  return [
    cv.fullName,
    cv.headline,
    cv.professionalSummary,
    ...cv.skillGroups.map((group) => `${group.name}: ${group.skills.join(", ")}`),
    experience ? `Experience\n${experience}` : "",
    projects ? `Projects\n${projects}` : "",
    education ? `Education\n${education}` : "",
    cv.certifications.length ? `Certifications\n${cv.certifications.join("\n")}` : "",
    cv.languages.length ? `Languages: ${cv.languages.map((language) => [language.name, language.proficiency].filter(Boolean).join(" — ")).join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function migrateStoredCv(value: unknown): StoredCv | null {
  if (!value || typeof value !== "object") return null;
  type LegacyCvProfile = Omit<CvProfile, "skillGroups" | "languages"> & { skills: string[] };
  type PossibleStoredCv = Omit<StoredCv, "cvProfile"> & { cvProfile?: CvProfile | LegacyCvProfile };
  const storedCv = value as PossibleStoredCv;
  if (!storedCv.cvProfile) return null;
  if ("skillGroups" in storedCv.cvProfile && "languages" in storedCv.cvProfile) return storedCv as StoredCv;
  if (!Array.isArray(storedCv.cvProfile.skills)) return null;

  return {
    ...storedCv,
    cvProfile: {
      ...storedCv.cvProfile,
      skillGroups: storedCv.cvProfile.skills.length
        ? [{ name: "Technical skills", skills: storedCv.cvProfile.skills }]
        : [],
      languages: []
    }
  };
}

export function CvWorkspace() {
  const [activeScreen, setActiveScreen] = useState<"starting" | "result">("starting");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [storedCv, setStoredCv] = useState<StoredCv | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [tailorSections, setTailorSections] = useState<TailorSection[]>(["professionalSummary", "skillGroups"]);
  const [maxPages, setMaxPages] = useState(1);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [idealResumeMode, setIdealResumeMode] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId>("classic_compact");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorCvResponse | null>(null);

  const activePreset = PRESETS[selectedPresetId];
  const isClassic = selectedPresetId === "classic_compact";

  useEffect(() => {
    if (!isTailoring) {
      setLoadingStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 2600);
    return () => clearInterval(interval);
  }, [isTailoring]);

  useEffect(() => {
    const savedValue = window.localStorage.getItem(storageKey);
    if (!savedValue) return;

    try {
      const migratedCv = migrateStoredCv(JSON.parse(savedValue));
      if (!migratedCv) throw new Error("Saved CV is invalid");
      window.localStorage.setItem(storageKey, JSON.stringify(migratedCv));
      setStoredCv(migratedCv);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;

    setError(null);
    setResult(null);
    setIsExtracting(true);

    try {
      const profileText = await extractTextFromFile(file);
      if (!profileText) throw new Error("No readable text was found in this file.");

      const response = await fetch(`${apiUrl}/extract-cv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileText })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not extract your CV.");

      const nextStoredCv: StoredCv = {
        sourceText: profileText,
        cvProfile: payload.cvProfile,
        savedAt: new Date().toISOString()
      };
      window.localStorage.setItem(storageKey, JSON.stringify(nextStoredCv));
      setStoredCv(nextStoredCv);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not read your CV.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleTailor() {
    if (!storedCv) return;

    setError(null);
    setResult(null);
    setIsTailoring(true);
    setActiveScreen("result");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    try {
      const response = await fetch(`${apiUrl}/tailor-cv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          cvProfile: storedCv.cvProfile,
          tailorSections,
          maxPages,
          includeCoverLetter,
          idealResumeMode
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not tailor your CV.");
      setResult(payload as TailorCvResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not tailor your CV.");
    } finally {
      setIsTailoring(false);
    }
  }

  function deleteSavedCv() {
    window.localStorage.removeItem(storageKey);
    setStoredCv(null);
    setResult(null);
    setError(null);
    setActiveScreen("starting");
  }

  async function copyTailoredCv() {
    if (!result) return;
    await navigator.clipboard.writeText(renderCvText(result.tailoredCv));
  }

  async function copyCoverLetter() {
    if (!result?.coverLetter) return;
    await navigator.clipboard.writeText(result.coverLetter);
  }

  function toggleSection(section: TailorSection) {
    setTailorSections((current) =>
      current.includes(section)
        ? current.filter((currentSection) => currentSection !== section)
        : [...current, section]
    );
  }

  async function downloadTailoredCv() {
    if (!result) return;

    const preset = PRESETS[selectedPresetId];
    const isClassic = selectedPresetId === "classic_compact";

    const {
      AlignmentType,
      BorderStyle,
      Document,
      ExternalHyperlink,
      HeadingLevel,
      Packer,
      Paragraph,
      TabStopPosition,
      TabStopType,
      TextRun,
      UnderlineType
    } = await import("docx");

    const cv = result.tailoredCv;
    const contactDetails = [cv.email, cv.phone, cv.location].filter(Boolean).join(" | ");
    const contactLinks = cv.links.flatMap((link, index) => [
      new ExternalHyperlink({
        link,
        children: [
          new TextRun({
            text: linkLabel(link, index),
            color: preset.docx.linkColor,
            underline: { type: UnderlineType.SINGLE }
          })
        ]
      }),
      ...(index < cv.links.length - 1 ? [new TextRun(" | ")] : [])
    ]);

    const sectionHeading = (text: string) =>
      new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        border: {
          bottom: {
            color: preset.docx.headingBorderColor,
            space: 2,
            style: BorderStyle.SINGLE,
            size: preset.docx.headingBorderSize
          }
        },
        spacing: { before: isClassic ? 150 : 200, after: isClassic ? 45 : 60 }
      });

    // 1. Header
    const headerParagraphs = [
      new Paragraph({
        text: cv.fullName ?? "Tailored CV",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER
      }),
      ...(cv.headline && !isClassic
        ? [
            new Paragraph({
              children: [new TextRun({ text: cv.headline, color: preset.docx.contactColor, italics: true })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 40 }
            })
          ]
        : []),
      ...(contactDetails || contactLinks.length
        ? [
            new Paragraph({
              children: [
                ...(contactDetails ? [new TextRun({ text: `${contactDetails}${contactLinks.length ? " | " : ""}` })] : []),
                ...contactLinks
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: isClassic ? 110 : 150 }
            })
          ]
        : [])
    ];

    // 2. Summary
    const summaryParagraphs = cv.professionalSummary
      ? [
          sectionHeading(preset.docx.sectionTitles.summary),
          new Paragraph({
            text: cv.professionalSummary,
            spacing: { after: isClassic ? 45 : 65 }
          })
        ]
      : [];

    // 3. Technical Skills
    const skillParagraphs = cv.skillGroups.length
      ? [
          sectionHeading(preset.docx.sectionTitles.skills),
          ...cv.skillGroups.map((group) => {
            const groupTitle = preset.docx.skillsUppercaseCategory
              ? `${group.name.toUpperCase()}: `
              : `${group.name}: `;
            return new Paragraph({
              children: [
                new TextRun({
                  text: groupTitle,
                  bold: true,
                  color: isClassic ? "000000" : preset.docx.headingColor
                }),
                new TextRun({ text: group.skills.join(", ") })
              ],
              spacing: { after: isClassic ? 25 : 35 }
            });
          })
        ]
      : [];

    // 4. Professional Experience
    const experienceParagraphs = cv.workExperience.length
      ? [
          sectionHeading(preset.docx.sectionTitles.experience),
          ...cv.workExperience.flatMap((job) => {
            const dateRange = [job.startDate, job.endDate ?? "Present"].filter(Boolean).join(" – ");

            const roleHeaderParagraph = isClassic
              ? new Paragraph({
                  children: [
                    ...(dateRange ? [new TextRun({ text: `${dateRange} – `, bold: true })] : []),
                    new TextRun({ text: `${job.title} at `, bold: true }),
                    new TextRun({ text: job.company, bold: true, italics: true })
                  ],
                  spacing: { before: 80, after: 20 }
                })
              : new Paragraph({
                  children: [
                    new TextRun({ text: job.title, bold: true, color: "0F172A" }),
                    new TextRun({ text: ` — ${job.company}`, italics: true, color: preset.docx.headingColor }),
                    ...(job.location ? [new TextRun({ text: ` (${job.location})`, color: "64748B" })] : []),
                    ...(dateRange
                      ? [
                          new TextRun({ text: "\t" }),
                          new TextRun({ text: dateRange, color: preset.docx.contactColor })
                        ]
                      : [])
                  ],
                  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                  spacing: { before: 90, after: 30 }
                });

            return [
              roleHeaderParagraph,
              ...job.highlights.map(
                (highlight) =>
                  new Paragraph({
                    text: highlight,
                    bullet: { level: 0 },
                    spacing: { after: isClassic ? 20 : 25 }
                  })
              )
            ];
          })
        ]
      : [];

    // 5. Projects
    const projectParagraphs = cv.projects.length
      ? [
          sectionHeading(preset.docx.sectionTitles.projects),
          ...cv.projects.flatMap((project) => [
            new Paragraph({
              children: [
                new TextRun({ text: project.name, bold: true }),
                ...(project.technologies.length
                  ? [new TextRun({ text: ` (${project.technologies.join(", ")})`, italics: true })]
                  : [])
              ],
              spacing: { before: 80, after: 25 }
            }),
            new Paragraph({ text: project.description, spacing: { after: 25 } }),
            ...project.highlights.map(
              (highlight) =>
                new Paragraph({
                  text: highlight,
                  bullet: { level: 0 },
                  spacing: { after: isClassic ? 20 : 25 }
                })
            )
          ])
        ]
      : [];

    // 6. Education
    const educationParagraphs = cv.education.length
      ? [
          sectionHeading(preset.docx.sectionTitles.education),
          ...cv.education.map((item) => {
            const degreeInfo = [item.degree, item.fieldOfStudy].filter(Boolean).join(" in ");
            const date = item.graduationDate ?? "";

            if (isClassic) {
              return new Paragraph({
                children: [
                  ...(date ? [new TextRun({ text: `${date} – `, bold: true })] : []),
                  ...(degreeInfo ? [new TextRun({ text: `${degreeInfo} at `, bold: true })] : []),
                  new TextRun({ text: item.institution, bold: true, italics: true })
                ],
                spacing: { after: 25 }
              });
            }

            return new Paragraph({
              children: [
                new TextRun({ text: degreeInfo || item.institution, bold: true }),
                ...(degreeInfo ? [new TextRun({ text: ` — ${item.institution}`, italics: true })] : []),
                ...(date
                  ? [
                      new TextRun({ text: "\t" }),
                      new TextRun({ text: date, color: preset.docx.contactColor })
                    ]
                  : [])
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              spacing: { after: 35 }
            });
          })
        ]
      : [];

    // 7. Certifications
    const certificationParagraphs = cv.certifications.length
      ? [
          sectionHeading(preset.docx.sectionTitles.certifications),
          ...cv.certifications.map(
            (item) =>
              new Paragraph({
                text: item,
                bullet: { level: 0 },
                spacing: { after: isClassic ? 20 : 25 }
              })
          )
        ]
      : [];

    // 8. Languages
    const languageParagraphs = cv.languages.length
      ? [
          sectionHeading(preset.docx.sectionTitles.languages),
          isClassic
            ? new Paragraph({
                text: cv.languages
                  .map((lang) => [lang.name, lang.proficiency].filter(Boolean).join(" – "))
                  .join(", "),
                spacing: { after: 25 }
              })
            : new Paragraph({
                children: cv.languages.flatMap((lang, index) => [
                  new TextRun({ text: lang.name, bold: true, color: "1E293B" }),
                  new TextRun({ text: lang.proficiency ? ` (${lang.proficiency})` : "", color: preset.docx.contactColor }),
                  ...(index < cv.languages.length - 1 ? [new TextRun("  •  ")] : [])
                ]),
                spacing: { after: 30 }
              })
        ]
      : [];

    const children = [
      ...headerParagraphs,
      ...summaryParagraphs,
      ...skillParagraphs,
      ...experienceParagraphs,
      ...projectParagraphs,
      ...educationParagraphs,
      ...certificationParagraphs,
      ...languageParagraphs
    ];

    const document = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: preset.docx.font,
              size: preset.docx.bodySize,
              color: preset.docx.bodyColor
            }
          }
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              bold: true,
              size: preset.docx.headingSize,
              color: preset.docx.headingColor
            }
          }
        ]
      },
      sections: [{ properties: { page: { margin: preset.docx.margins } }, children }]
    });

    const blob = await Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `tailored-cv-${selectedPresetId}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadCoverLetter() {
    if (!result?.coverLetter) return;

    const preset = PRESETS[selectedPresetId];
    const { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun, UnderlineType } = await import("docx");
    const cv = result.tailoredCv;
    const contactDetails = [cv.email, cv.phone, cv.location].filter(Boolean).join(" | ");
    const contactLinks = cv.links.flatMap((link, index) => [
      new ExternalHyperlink({
        link,
        children: [new TextRun({ text: linkLabel(link, index), color: preset.docx.linkColor, underline: { type: UnderlineType.SINGLE } })]
      }),
      ...(index < cv.links.length - 1 ? [new TextRun(" | ")] : [])
    ]);

    const document = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: preset.docx.font,
              size: preset.docx.bodySize + 1,
              color: preset.docx.bodyColor
            }
          }
        }
      },
      sections: [{
        properties: { page: { margin: preset.docx.margins } },
        children: [
          new Paragraph({ text: cv.fullName ?? "", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          ...(contactDetails || contactLinks.length ? [new Paragraph({
            children: [
              ...(contactDetails ? [new TextRun({ text: `${contactDetails}${contactLinks.length ? " | " : ""}` })] : []),
              ...contactLinks
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 }
          })] : []),
          ...result.coverLetter.split(/\n\s*\n/).filter(Boolean).map((paragraph) => new Paragraph({ text: paragraph, spacing: { after: 150 } }))
        ]
      }]
    });

    const blob = await Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `tailored-cover-letter-${selectedPresetId}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", fontFamily: activePreset.web.fontFamily }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.25); opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes progress-indeterminate {
          0% { left: -30%; width: 30%; }
          50% { left: 25%; width: 55%; }
          100% { left: 100%; width: 25%; }
        }
      `}</style>

      {/* Starting Screen (Screen 1) */}
      {activeScreen === "starting" ? (
        <div>
          {/* Top Navigation Bar on Starting Screen */}
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0 16px 0",
              marginBottom: "20px",
              borderBottom: "1px solid #E5E7EB"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: activePreset.web.primaryColor,
                  color: "#FFFFFF",
                  fontSize: "0.8rem",
                  fontWeight: 700
                }}
              >
                1
              </span>
              <strong style={{ fontSize: "1rem", color: "#111827" }}>Starting Screen: CV & Job Input</strong>
            </div>

            <div>
              {result ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveScreen("result");
                    if (typeof window !== "undefined") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: `1.5px solid ${activePreset.web.primaryColor}`,
                    background: activePreset.web.primaryColor,
                    color: "#FFFFFF",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                  }}
                >
                  <span>Forward to Result</span>
                  <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>→</span>
                </button>
              ) : null}
            </div>
          </nav>

          <h1>AI Job Agent</h1>
          <p>Save your CV once, select a design preset, and tailor it to any job description.</p>

          {/* Preset Selector Card */}
          <section style={{ margin: "20px 0", padding: "16px", border: "1px solid #E5E7EB", borderRadius: "10px", background: "#F9FAFB" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "1.15rem" }}>Visual Design & ATS Preset</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              {(Object.keys(PRESETS) as PresetId[]).map((id) => {
                const p = PRESETS[id];
                const isSelected = selectedPresetId === id;
                return (
                  <label
                    key={id}
                    style={{
                      display: "block",
                      padding: "14px",
                      borderRadius: "8px",
                      border: isSelected ? `2px solid ${p.web.primaryColor}` : "1px solid #D1D5DB",
                      background: isSelected ? p.web.badgeBg : "#FFFFFF",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="radio"
                          name="preset-selector"
                          value={id}
                          checked={isSelected}
                          onChange={() => setSelectedPresetId(id)}
                        />
                        <strong style={{ color: p.web.primaryColor }}>{p.name}</strong>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: p.web.accentGlow,
                          color: p.web.badgeText,
                          border: `1px solid ${p.web.cardBorder}`
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 24px", fontSize: "0.85rem", color: "#4B5563", lineHeight: 1.4 }}>
                      {p.description}
                    </p>
                  </label>
                );
              })}
            </div>
          </section>

          {/* CV Storage Section */}
          <section style={{ marginBottom: "24px" }}>
            <h2>Your CV</h2>
            <p>Your extracted CV profile is stored locally in this browser.</p>
            {storedCv ? (
              <>
                <p>
                  <strong>{storedCv.cvProfile.fullName ?? "CV profile"}</strong> is saved in this browser.
                </p>
                <p>{storedCv.cvProfile.skillGroups.reduce((total, group) => total + group.skills.length, 0)} technical skills extracted.</p>
                <label style={{ display: "inline-block", marginRight: "12px" }}>
                  Replace CV:{" "}
                  <input
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={isExtracting}
                    onChange={(event) => handleFileChange(event.target.files?.[0])}
                    type="file"
                  />
                </label>
                <button onClick={deleteSavedCv} type="button">Delete saved CV</button>
              </>
            ) : (
              <label>
                Upload a PDF or DOCX CV:{" "}
                <input
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={isExtracting}
                  onChange={(event) => handleFileChange(event.target.files?.[0])}
                  type="file"
                />
              </label>
            )}
            {isExtracting ? <p>Reading and extracting your CV…</p> : null}
          </section>

          {/* Job Description & Tailor Controls */}
          <section style={{ marginBottom: "28px" }}>
            <h2>Job description</h2>
            <label htmlFor="job-description" style={{ display: "block", marginBottom: "6px" }}>
              Paste the full job description:
            </label>
            <textarea
              id="job-description"
              onChange={(event) => setJobDescription(event.target.value)}
              required
              rows={7}
              style={{ width: "100%", padding: "8px", boxSizing: "border-box", borderRadius: "6px" }}
              value={jobDescription}
            />

            {storedCv ? (
              <fieldset style={{ margin: "16px 0", padding: "12px 16px", borderRadius: "8px" }}>
                <legend>Sections AI may tailor</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                  {sectionOptions.map((section) => (
                    <label key={section.value} style={{ cursor: "pointer" }}>
                      <input
                        checked={tailorSections.includes(section.value)}
                        onChange={() => toggleSection(section.value)}
                        type="checkbox"
                        style={{ marginRight: "6px" }}
                      />
                      {section.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", margin: "12px 0" }}>
              <label>
                Target length:{" "}
                <select onChange={(event) => setMaxPages(Number(event.target.value))} value={maxPages}>
                  {[1, 2, 3, 4, 5].map((pageCount) => (
                    <option key={pageCount} value={pageCount}>
                      {pageCount} page{pageCount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ cursor: "pointer" }}>
                <input
                  checked={includeCoverLetter}
                  onChange={(event) => setIncludeCoverLetter(event.target.checked)}
                  type="checkbox"
                  style={{ marginRight: "6px" }}
                />
                Generate a tailored cover letter
              </label>

              <label style={{ cursor: "pointer" }}>
                <input
                  checked={idealResumeMode}
                  onChange={(event) => setIdealResumeMode(event.target.checked)}
                  type="checkbox"
                  style={{ marginRight: "6px" }}
                />
                Create an ideal-role CV draft (may add unverified content)
              </label>
            </div>

            {idealResumeMode ? (
              <p style={{ color: "#B45309", fontSize: "0.9rem" }}>
                This draft can include job-targeted skills or experience not found in your original CV. Every addition will be identified in Recommendations.
              </p>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
              <button
                disabled={!storedCv || !jobDescription.trim() || isTailoring}
                onClick={handleTailor}
                type="button"
                style={{
                  padding: "10px 24px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: !storedCv || !jobDescription.trim() || isTailoring ? "not-allowed" : "pointer",
                  background: activePreset.web.primaryColor,
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  opacity: !storedCv || !jobDescription.trim() || isTailoring ? 0.6 : 1
                }}
              >
                {isTailoring ? "Tailoring…" : result ? "Re-tailor my CV" : "Tailor my CV"}
              </button>

              {result ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveScreen("result");
                    if (typeof window !== "undefined") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "#FFFFFF",
                    color: activePreset.web.primaryColor,
                    border: `1.5px solid ${activePreset.web.primaryColor}`,
                    borderRadius: "6px"
                  }}
                >
                  <span>View current result</span>
                  <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>→</span>
                </button>
              ) : null}
            </div>
          </section>

          {error ? <p role="alert" style={{ color: "#DC2626", fontWeight: "bold" }}>{error}</p> : null}
        </div>
      ) : null}

      {/* Result Screen (Screen 2) */}
      {activeScreen === "result" ? (
        <div>
          {/* Top Navigation Bar on Result Screen with Back Arrow */}
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0 16px 0",
              marginBottom: "20px",
              borderBottom: "1px solid #E5E7EB"
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveScreen("starting");
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: "#FFFFFF",
                color: "#1F2937",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>←</span>
              <span>Back to Starting Screen</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", color: "#6B7280" }}>
              <span>Screen:</span>
              <strong style={{ color: "#111827" }}>
                {isTailoring ? "Tailoring in Progress" : "Tailored Result"}
              </strong>
            </div>
          </nav>

          {/* Loading Animation & Spinner */}
          {isTailoring ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 24px",
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                maxWidth: 620,
                margin: "40px auto",
                textAlign: "center"
              }}
            >
              {/* Spinner with pulsing center */}
              <div style={{ position: "relative", width: 72, height: 72, marginBottom: "24px" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    border: "4px solid #E5E7EB",
                    borderTopColor: activePreset.web.primaryColor,
                    animation: "spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite"
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: activePreset.web.accentGlow,
                    animation: "pulse-scale 1.5s ease-in-out infinite"
                  }}
                />
              </div>

              <h2 style={{ margin: "0 0 8px 0", fontSize: "1.35rem", color: "#111827", fontWeight: 700 }}>
                Tailoring your CV with AI…
              </h2>

              <p
                key={loadingStepIndex}
                style={{
                  margin: "0 0 20px 0",
                  fontSize: "0.95rem",
                  color: activePreset.web.primaryColor,
                  fontWeight: 600,
                  minHeight: "24px",
                  animation: "fade-in 0.3s ease"
                }}
              >
                {LOADING_STEPS[loadingStepIndex]}
              </p>

              {/* Progress bar */}
              <div
                style={{
                  width: "100%",
                  maxWidth: 380,
                  height: 6,
                  background: "#F3F4F6",
                  borderRadius: 999,
                  overflow: "hidden",
                  position: "relative",
                  marginBottom: "28px"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    height: "100%",
                    background: `linear-gradient(90deg, ${activePreset.web.primaryColor}, #3B82F6)`,
                    borderRadius: 999,
                    animation: "progress-indeterminate 1.8s ease-in-out infinite"
                  }}
                />
              </div>

              {/* Steps checklist */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  width: "100%",
                  maxWidth: 420,
                  textAlign: "left",
                  background: "#F9FAFB",
                  padding: "16px 20px",
                  borderRadius: "8px",
                  border: "1px solid #F3F4F6"
                }}
              >
                {LOADING_STEPS.map((step, idx) => {
                  const isDone = idx < loadingStepIndex;
                  const isCurrent = idx === loadingStepIndex;
                  return (
                    <div
                      key={step}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.85rem",
                        color: isCurrent ? "#111827" : isDone ? "#059669" : "#9CA3AF",
                        fontWeight: isCurrent ? 600 : isDone ? 500 : 400
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          background: isDone ? "#D1FAE5" : isCurrent ? activePreset.web.badgeBg : "#E5E7EB",
                          color: isDone ? "#059669" : isCurrent ? activePreset.web.primaryColor : "#9CA3AF"
                        }}
                      >
                        {isDone ? "✓" : idx + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>

              <p style={{ margin: "20px 0 0 0", fontSize: "0.85rem", color: "#6B7280" }}>
                AI is tailoring your bullet points and aligning them with the job requirements.
              </p>
            </div>
          ) : null}

          {/* If Error during tailoring */}
          {error && !isTailoring ? (
            <div
              style={{
                margin: "40px auto",
                maxWidth: 600,
                padding: "24px",
                background: "#FEF2F2",
                border: "1px solid #F87171",
                borderRadius: "10px",
                textAlign: "center"
              }}
            >
              <h3 style={{ margin: "0 0 8px 0", color: "#991B1B" }}>Tailoring Failed</h3>
              <p style={{ margin: "0 0 16px 0", color: "#B91C1C" }}>{error}</p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveScreen("starting");
                    if (typeof window !== "undefined") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #D1D5DB",
                    background: "#FFFFFF",
                    cursor: "pointer",
                    fontWeight: 500
                  }}
                >
                  ← Back to Starting Screen
                </button>
                <button
                  type="button"
                  onClick={handleTailor}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    background: activePreset.web.primaryColor,
                    color: "#FFFFFF",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : null}

          {/* Results View */}
          {result && !isTailoring ? (
            <section style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <h2>Tailored CV Result (Match Score: {result.match.matchScore}%)</h2>

            {/* Live Preset Switcher */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.9rem", color: "#4B5563" }}>Style:</span>
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setSelectedPresetId(id)}
                  type="button"
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: selectedPresetId === id ? `2px solid ${PRESETS[id].web.primaryColor}` : "1px solid #D1D5DB",
                    background: selectedPresetId === id ? PRESETS[id].web.badgeBg : "#FFFFFF",
                    color: selectedPresetId === id ? PRESETS[id].web.primaryColor : "#374151",
                    fontWeight: selectedPresetId === id ? 600 : 400,
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  {PRESETS[id].name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button
              onClick={downloadTailoredCv}
              type="button"
              style={{
                padding: "8px 18px",
                background: activePreset.web.primaryColor,
                color: "#FFFFFF",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer"
              }}
            >
              Download DOCX ({activePreset.name})
            </button>
            <button onClick={copyTailoredCv} type="button" style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>
              Copy text
            </button>
          </div>

          {/* Styled Document Sheet Preview */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #D1D5DB",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              padding: isClassic ? "32px 36px" : "36px 42px",
              borderRadius: "4px",
              lineHeight: 1.45,
              fontSize: isClassic ? "0.93rem" : "0.97rem",
              color: isClassic ? "#000000" : "#1E293B"
            }}
          >
            {/* Document Header */}
            <header style={{ textAlign: "center", marginBottom: isClassic ? "16px" : "20px" }}>
              <h1
                style={{
                  margin: "0 0 4px 0",
                  fontSize: isClassic ? "1.65rem" : "1.85rem",
                  fontWeight: 700,
                  color: activePreset.web.nameColor,
                  letterSpacing: isClassic ? "0.2px" : "0.5px"
                }}
              >
                {result.tailoredCv.fullName ?? "Tailored CV"}
              </h1>

              {result.tailoredCv.headline && !isClassic ? (
                <p style={{ margin: "2px 0 6px 0", color: activePreset.web.subtextColor, fontStyle: "italic", fontSize: "0.95rem" }}>
                  {result.tailoredCv.headline}
                </p>
              ) : null}

              <div style={{ color: activePreset.web.subtextColor, fontSize: "0.9rem" }}>
                {[
                  result.tailoredCv.location,
                  result.tailoredCv.phone,
                  result.tailoredCv.email
                ]
                  .filter(Boolean)
                  .join(" | ")}
                {result.tailoredCv.links.length ? " | " : ""}
                {result.tailoredCv.links.map((link, index) => (
                  <span key={link}>
                    <a
                      href={link}
                      rel="noreferrer"
                      target="_blank"
                      style={{ color: activePreset.web.linkColor, textDecoration: "underline" }}
                    >
                      {linkLabel(link, index)}
                    </a>
                    {index < result.tailoredCv.links.length - 1 ? " | " : ""}
                  </span>
                ))}
              </div>
            </header>

            {/* Summary */}
            {result.tailoredCv.professionalSummary ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.summary}
                </h3>
                <p style={{ margin: "6px 0 0 0", textAlign: "justify" }}>{result.tailoredCv.professionalSummary}</p>
              </section>
            ) : null}

            {/* Technical Skills */}
            {result.tailoredCv.skillGroups.length ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.skills}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: isClassic ? "3px" : "5px" }}>
                  {result.tailoredCv.skillGroups.map((group) => (
                    <div key={group.name} style={{ lineHeight: 1.4 }}>
                      <strong
                        style={{
                          color: isClassic ? "#000000" : activePreset.web.headingColor,
                          textTransform: activePreset.docx.skillsUppercaseCategory ? "uppercase" : "none"
                        }}
                      >
                        {activePreset.docx.skillsUppercaseCategory ? group.name.toUpperCase() : group.name}:{" "}
                      </strong>
                      <span>{group.skills.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Professional Experience */}
            {result.tailoredCv.workExperience.length ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.experience}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: isClassic ? "12px" : "16px" }}>
                  {result.tailoredCv.workExperience.map((job) => {
                    const dateRange = [job.startDate, job.endDate ?? "Present"].filter(Boolean).join(" – ");

                    return (
                      <article key={`${job.company}-${job.title}`}>
                        {isClassic ? (
                          // Maksim's CV: Inline single line "02/2026 – 09/2026 – Software Engineer at SkySoft Solutions by Commit"
                          <div style={{ marginBottom: "3px" }}>
                            {dateRange ? <strong>{dateRange} – </strong> : null}
                            <strong>{job.title} at </strong>
                            <em style={{ fontWeight: 700 }}>{job.company}</em>
                          </div>
                        ) : (
                          // Modern ATS: Left Title + Company, Right Date
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                            <div>
                              <strong style={{ color: "#0F172A", fontSize: "1rem" }}>{job.title}</strong>
                              <span style={{ color: activePreset.web.headingColor, fontStyle: "italic", marginLeft: "6px" }}>
                                — {job.company}
                              </span>
                              {job.location ? <span style={{ color: "#64748B", fontSize: "0.85rem", marginLeft: "6px" }}>({job.location})</span> : null}
                            </div>
                            {dateRange ? <span style={{ color: activePreset.web.subtextColor, fontWeight: 500, fontSize: "0.9rem" }}>{dateRange}</span> : null}
                          </div>
                        )}
                        <ul style={{ margin: "2px 0 0 0", paddingLeft: "18px" }}>
                          {job.highlights.map((highlight) => (
                            <li key={highlight} style={{ marginBottom: isClassic ? "2px" : "4px" }}>
                              {highlight}
                            </li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Projects */}
            {result.tailoredCv.projects.length ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.projects}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result.tailoredCv.projects.map((project) => (
                    <article key={project.name}>
                      <div>
                        <strong>{project.name}</strong>
                        {project.technologies.length ? <em> ({project.technologies.join(", ")})</em> : null}
                      </div>
                      <p style={{ margin: "2px 0 4px 0" }}>{project.description}</p>
                      {project.highlights.length ? (
                        <ul style={{ margin: "0", paddingLeft: "18px" }}>
                          {project.highlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Education */}
            {result.tailoredCv.education.length ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.education}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: isClassic ? "3px" : "6px" }}>
                  {result.tailoredCv.education.map((item) => {
                    const degreeInfo = [item.degree, item.fieldOfStudy].filter(Boolean).join(" in ");
                    const date = item.graduationDate ?? "";

                    if (isClassic) {
                      return (
                        <div key={item.institution} style={{ lineHeight: 1.4 }}>
                          {date ? <strong>{date} – </strong> : null}
                          {degreeInfo ? <strong>{degreeInfo} at </strong> : null}
                          <em style={{ fontWeight: 700 }}>{item.institution}</em>
                        </div>
                      );
                    }

                    return (
                      <div key={item.institution} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div>
                          <strong>{degreeInfo || item.institution}</strong>
                          {degreeInfo ? <span style={{ fontStyle: "italic", marginLeft: "6px" }}>— {item.institution}</span> : null}
                        </div>
                        {date ? <span style={{ color: activePreset.web.subtextColor, fontSize: "0.9rem" }}>{date}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Certifications */}
            {result.tailoredCv.certifications.length ? (
              <section style={{ marginBottom: isClassic ? "14px" : "18px" }}>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.certifications}
                </h3>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "18px" }}>
                  {result.tailoredCv.certifications.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Languages */}
            {result.tailoredCv.languages.length ? (
              <section>
                <h3
                  style={{
                    fontSize: isClassic ? "1.02rem" : "1.08rem",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                    paddingBottom: "2px",
                    borderBottom: `1.5px solid ${activePreset.web.headingBorderColor}`,
                    color: activePreset.web.headingColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  {activePreset.docx.sectionTitles.languages}
                </h3>
                {isClassic ? (
                  // Maksim's single line "Russian – Native, English – Fluent, Hebrew – Intermediate"
                  <p style={{ margin: "4px 0 0 0" }}>
                    {result.tailoredCv.languages.map((lang) => [lang.name, lang.proficiency].filter(Boolean).join(" – ")).join(", ")}
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "4px" }}>
                    {result.tailoredCv.languages.map((lang) => (
                      <span key={lang.name}>
                        <strong>{lang.name}</strong>
                        {lang.proficiency ? ` (${lang.proficiency})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>

          {/* Cover Letter Section */}
          {result.coverLetter ? (
            <div style={{ marginTop: "28px" }}>
              <h2>Tailored Cover Letter</h2>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <button
                  onClick={downloadCoverLetter}
                  type="button"
                  style={{
                    padding: "8px 18px",
                    background: activePreset.web.primaryColor,
                    color: "#FFFFFF",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Download cover letter DOCX ({activePreset.name})
                </button>
                <button onClick={copyCoverLetter} type="button" style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>
                  Copy cover letter
                </button>
              </div>
              <div style={{ background: "#FFFFFF", padding: "24px 30px", border: "1px solid #D1D5DB", borderRadius: "4px" }}>
                {result.coverLetter.split("\n\n").map((paragraph, index) => (
                  <p key={`${paragraph.slice(0, 20)}-${index}`} style={{ margin: "0 0 12px 0", lineHeight: 1.5 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recommendations & Unverified Additions */}
          <div style={{ marginTop: "28px" }}>
            <h2>Recommendations & Insights</h2>
            {result.recommendations.some((recommendation) => recommendation.kind === "unverified_addition") ? (
              <p style={{ color: "#B45309", fontWeight: 600 }}>
                Important: Each “unverified addition” below identifies content that was absent from your original CV and added for this target role.
              </p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {result.recommendations.map((recommendation) => (
                <article
                  key={`${recommendation.kind}-${recommendation.title}`}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "6px",
                    background: recommendation.kind === "unverified_addition" ? "#FEF3C7" : "#F3F4F6",
                    border: recommendation.kind === "unverified_addition" ? "1px solid #F59E0B" : "1px solid #E5E7EB"
                  }}
                >
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "0.95rem" }}>
                    {recommendation.kind.replaceAll("_", " ")}: {recommendation.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "#374151" }}>{recommendation.explanation}</p>
                </article>
              ))}
            </div>
          </div>

          {/* Bottom Back Button */}
          <div style={{ marginTop: "32px", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                setActiveScreen("starting");
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 24px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: "#FFFFFF",
                color: "#374151",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>←</span>
              <span>Back to Starting Screen</span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  ) : null}
</main>
);
}
