"use client";

import { useEffect, useState } from "react";
import type { CvProfile, StoredCv, TailorCvResponse } from "../types";

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
  const [storedCv, setStoredCv] = useState<StoredCv | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [tailorSections, setTailorSections] = useState<TailorSection[]>(["professionalSummary", "skillGroups"]);
  const [maxPages, setMaxPages] = useState(1);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [idealResumeMode, setIdealResumeMode] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorCvResponse | null>(null);

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

    const { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TabStopPosition, TabStopType, TextRun, UnderlineType } = await import("docx");
    const cv = result.tailoredCv;
    const contactDetails = [cv.email, cv.phone, cv.location].filter(Boolean).join(" | ");
    const contactLinks = cv.links.flatMap((link, index) => [
      new ExternalHyperlink({
        link,
        children: [new TextRun({ text: linkLabel(link, index), color: "0563C1", underline: { type: UnderlineType.SINGLE } })]
      }),
      ...(index < cv.links.length - 1 ? [new TextRun(" | ")] : [])
    ]);
    const sectionHeading = (text: string) => new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 90 }
    });
    const children = [
      new Paragraph({ text: cv.fullName ?? "Tailored CV", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
      ...(cv.headline ? [new Paragraph({ text: cv.headline, alignment: AlignmentType.CENTER, spacing: { after: 50 } })] : []),
      ...(contactDetails || contactLinks.length ? [new Paragraph({
        children: [
          ...(contactDetails ? [new TextRun({ text: `${contactDetails}${contactLinks.length ? " | " : ""}` })] : []),
          ...contactLinks
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 }
      })] : []),
      ...(cv.professionalSummary
        ? [sectionHeading("Professional Summary"), new Paragraph({ text: cv.professionalSummary, spacing: { after: 70 } })]
        : []),
      ...(cv.skillGroups.length
        ? [
            sectionHeading("Technical Skills"),
            ...cv.skillGroups.map((group) => new Paragraph({
              children: [new TextRun({ text: `${group.name}: `, bold: true }), new TextRun(group.skills.join(", "))],
              spacing: { after: 45 }
            }))
          ]
        : []),
      ...(cv.workExperience.length
        ? [
            sectionHeading("Experience"),
            ...cv.workExperience.flatMap((job) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `${job.title} — ${job.company}`, bold: true }),
                  new TextRun({ text: "\t" }),
                  new TextRun({ text: [job.startDate, job.endDate ?? "Present"].filter(Boolean).join(" – ") })
                ],
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                spacing: { before: 90, after: 35 }
              }),
              ...(job.location ? [new Paragraph({ text: job.location, spacing: { after: 30 } })] : []),
              ...job.highlights.map((highlight) => new Paragraph({ text: highlight, bullet: { level: 0 }, spacing: { after: 25 } }))
            ])
          ]
        : []),
      ...(cv.projects.length
        ? [
            sectionHeading("Projects"),
            ...cv.projects.flatMap((project) => [
              new Paragraph({ text: project.name, spacing: { before: 90, after: 35 } }),
              new Paragraph({ text: project.description, spacing: { after: 30 } }),
              ...project.highlights.map((highlight) => new Paragraph({ text: highlight, bullet: { level: 0 }, spacing: { after: 25 } }))
            ])
          ]
        : []),
      ...(cv.education.length
        ? [
            sectionHeading("Education"),
            ...cv.education.map((item) =>
              new Paragraph({ text: [item.degree, item.fieldOfStudy, item.institution, item.graduationDate].filter(Boolean).join(" — "), spacing: { after: 45 } })
            )
          ]
        : []),
      ...(cv.certifications.length
        ? [sectionHeading("Certifications"), ...cv.certifications.map((item) => new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 25 } }))]
        : []),
      ...(cv.languages.length
        ? [sectionHeading("Languages"), new Paragraph({ text: cv.languages.map((language) => [language.name, language.proficiency].filter(Boolean).join(" — ")).join(", ") })]
        : [])
    ];
    const document = new Document({
      styles: {
        default: { document: { run: { font: "Aptos", size: 21 } } },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { bold: true, size: 24, color: "1F4E79" }
          }
        ]
      },
      sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }]
    });
    const blob = await Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "tailored-cv.docx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadCoverLetter() {
    if (!result?.coverLetter) return;

    const { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun, UnderlineType } = await import("docx");
    const cv = result.tailoredCv;
    const contactDetails = [cv.email, cv.phone, cv.location].filter(Boolean).join(" | ");
    const contactLinks = cv.links.flatMap((link, index) => [
      new ExternalHyperlink({
        link,
        children: [new TextRun({ text: linkLabel(link, index), color: "0563C1", underline: { type: UnderlineType.SINGLE } })]
      }),
      ...(index < cv.links.length - 1 ? [new TextRun(" | ")] : [])
    ]);
    const document = new Document({
      styles: { default: { document: { run: { font: "Aptos", size: 22 } } } },
      sections: [{
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children: [
          new Paragraph({ text: cv.fullName ?? "", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          ...(contactDetails || contactLinks.length ? [new Paragraph({
            children: [
              ...(contactDetails ? [new TextRun({ text: `${contactDetails}${contactLinks.length ? " | " : ""}` })] : []),
              ...contactLinks
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          })] : []),
          ...result.coverLetter.split(/\n\s*\n/).filter(Boolean).map((paragraph) => new Paragraph({ text: paragraph, spacing: { after: 180 } }))
        ]
      }]
    });
    const blob = await Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "tailored-cover-letter.docx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>AI Job Agent</h1>
      <p>Save your CV once, then tailor it to each job description.</p>

      <section>
        <h2>Your CV</h2>
        <p>Your extracted CV profile is stored only in this browser. Uploading sends the CV text to the configured AI provider for extraction.</p>
        {storedCv ? (
          <>
            <p>
              <strong>{storedCv.cvProfile.fullName ?? "CV profile"}</strong> is saved in this browser.
            </p>
            <p>{storedCv.cvProfile.skillGroups.reduce((total, group) => total + group.skills.length, 0)} technical skills extracted.</p>
            <label>
              Replace CV
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
            Upload a PDF or DOCX CV
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

      <section>
        <h2>Job description</h2>
        <label htmlFor="job-description">Paste the full job description</label>
        <textarea
          id="job-description"
          onChange={(event) => setJobDescription(event.target.value)}
          required
          value={jobDescription}
        />
        {storedCv ? (
          <fieldset>
            <legend>Sections AI may tailor</legend>
            {sectionOptions.map((section) => (
              <label key={section.value}>
                <input
                  checked={tailorSections.includes(section.value)}
                  onChange={() => toggleSection(section.value)}
                  type="checkbox"
                />
                {section.label}
              </label>
            ))}
          </fieldset>
        ) : null}
        <label>
          Target CV length
          <select onChange={(event) => setMaxPages(Number(event.target.value))} value={maxPages}>
            {[1, 2, 3, 4, 5].map((pageCount) => <option key={pageCount} value={pageCount}>{pageCount} page{pageCount === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <label>
          <input checked={includeCoverLetter} onChange={(event) => setIncludeCoverLetter(event.target.checked)} type="checkbox" />
          Generate a tailored cover letter
        </label>
        <label>
          <input checked={idealResumeMode} onChange={(event) => setIdealResumeMode(event.target.checked)} type="checkbox" />
          Create an ideal-role CV draft (may add unverified content)
        </label>
        {idealResumeMode ? <p>This draft can include job-targeted skills or experience not found in your original CV. Every addition will be identified in Recommendations.</p> : null}
        <button disabled={!storedCv || !jobDescription.trim() || isTailoring} onClick={handleTailor} type="button">
          {isTailoring ? "Tailoring…" : "Tailor my CV"}
        </button>
      </section>

      {error ? <p role="alert">{error}</p> : null}

      {result ? (
        <section>
          <h2>Tailored CV</h2>
          <h3>{result.tailoredCv.fullName ?? "Tailored CV"}</h3>
          {result.tailoredCv.headline ? <p>{result.tailoredCv.headline}</p> : null}
          {[result.tailoredCv.email, result.tailoredCv.phone, result.tailoredCv.location].filter(Boolean).length ? (
            <p>{[result.tailoredCv.email, result.tailoredCv.phone, result.tailoredCv.location].filter(Boolean).join(" | ")}</p>
          ) : null}
          {result.tailoredCv.links.length ? (
            <p>
              {result.tailoredCv.links.map((link, index) => (
                <span key={link}>
                  <a href={link} rel="noreferrer" target="_blank">{link}</a>
                  {index < result.tailoredCv.links.length - 1 ? " | " : ""}
                </span>
              ))}
            </p>
          ) : null}
          <p>Match score: {result.match.matchScore}%</p>
          <p>{result.tailoredCv.professionalSummary}</p>
          <h3>Technical Skills</h3>
          {result.tailoredCv.skillGroups.map((group) => (
            <p key={group.name}><strong>{group.name}:</strong> {group.skills.join(", ")}</p>
          ))}
          <h3>Experience</h3>
          {result.tailoredCv.workExperience.map((job) => (
            <article key={`${job.company}-${job.title}`}>
              <h4>{job.title} — {job.company}</h4>
              <ul>{job.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
            </article>
          ))}
          {result.tailoredCv.projects.length ? (
            <>
              <h3>Projects</h3>
              {result.tailoredCv.projects.map((project) => <article key={project.name}><h4>{project.name}</h4><p>{project.description}</p></article>)}
            </>
          ) : null}
          {result.tailoredCv.education.length ? (
            <>
              <h3>Education</h3>
              {result.tailoredCv.education.map((item) => <p key={item.institution}>{[item.degree, item.fieldOfStudy, item.institution, item.graduationDate].filter(Boolean).join(" — ")}</p>)}
            </>
          ) : null}
          {result.tailoredCv.certifications.length ? (
            <>
              <h3>Certifications</h3>
              <p>{result.tailoredCv.certifications.join(", ")}</p>
            </>
          ) : null}
          {result.tailoredCv.languages.length ? (
            <>
              <h3>Languages</h3>
              <p>{result.tailoredCv.languages.map((language) => [language.name, language.proficiency].filter(Boolean).join(" — ")).join(", ")}</p>
            </>
          ) : null}
          <button onClick={copyTailoredCv} type="button">Copy tailored CV</button>
          <button onClick={downloadTailoredCv} type="button">Download DOCX</button>

          {result.coverLetter ? (
            <>
              <h2>Tailored Cover Letter</h2>
              {result.coverLetter.split("\n").map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}
              <button onClick={copyCoverLetter} type="button">Copy cover letter</button>
              <button onClick={downloadCoverLetter} type="button">Download cover letter DOCX</button>
            </>
          ) : null}


          <h2>Recommendations</h2>
          {result.recommendations.some((recommendation) => recommendation.kind === "unverified_addition") ? (
            <p><strong>Important:</strong> Each “unverified addition” below identifies content that was absent from your original CV and added for this target role.</p>
          ) : null}
          {result.recommendations.map((recommendation) => (
            <article key={`${recommendation.kind}-${recommendation.title}`}>
              <h3>{recommendation.kind.replaceAll("_", " ")}: {recommendation.title}</h3>
              <p>{recommendation.explanation}</p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
