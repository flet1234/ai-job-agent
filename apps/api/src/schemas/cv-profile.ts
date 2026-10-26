import z from "zod";

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.nullable();

export const cvProfileSchema = z.object({
  fullName: optionalText,
  headline: optionalText,
  email: optionalText,
  phone: optionalText,
  location: optionalText,
  links: z.array(requiredText),
  professionalSummary: optionalText,
  skillGroups: z.array(
    z.object({
      name: requiredText,
      skills: z.array(requiredText).min(1)
    })
  ),
  languages: z.array(
    z.object({
      name: requiredText,
      proficiency: optionalText
    })
  ),
  workExperience: z.array(
    z.object({
      title: requiredText,
      company: requiredText,
      location: optionalText,
      startDate: optionalText,
      endDate: optionalText,
      highlights: z.array(requiredText)
    })
  ),
  education: z.array(
    z.object({
      institution: requiredText,
      degree: optionalText,
      fieldOfStudy: optionalText,
      graduationDate: optionalText
    })
  ),
  projects: z.array(
    z.object({
      name: requiredText,
      description: requiredText,
      technologies: z.array(requiredText),
      highlights: z.array(requiredText)
    })
  ),
  certifications: z.array(requiredText)
});

export type CvProfile = z.infer<typeof cvProfileSchema>;
