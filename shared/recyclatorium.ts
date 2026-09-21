import { z } from "zod";

export const recyclatoriumModeSchema = z.enum(["recombine", "transform", "invent"]);
export type RecyclatoriumMode = z.infer<typeof recyclatoriumModeSchema>;

export const recyclatoriumActivitySchema = z.object({
  title: z.string().min(3).max(90),
  instructions: z.string().min(8).max(260),
  objective: z.string().min(3).max(120),
  sourceAsset: z.string().min(1).max(255),
  vocabulary: z.array(z.string().min(1).max(32)).min(2).max(6),
  prompt: z.string().min(3).max(220),
  extension: z.string().min(3).max(180),
});

export const recyclatoriumPlanSchema = z.object({
  title: z.string().min(3).max(100),
  subtitle: z.string().min(3).max(140),
  theme: z.string().min(2).max(80),
  ageGrade: z.string().min(2).max(40),
  productType: z.string().min(3).max(80),
  customer: z.string().min(3).max(120),
  visualSummary: z.string().min(10).max(500),
  whyTogether: z.string().min(10).max(420),
  teachingGoals: z.array(z.string().min(3).max(120)).min(3).max(6),
  palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(3).max(6),
  activities: z.array(recyclatoriumActivitySchema).min(4).max(6),
  listing: z.object({
    shortDescription: z.string().min(10).max(300),
    longDescription: z.string().min(20).max(1000),
    tags: z.array(z.string().min(1).max(40)).min(5).max(13),
    suggestedPrice: z.string().min(1).max(24),
  }),
});

export type RecyclatoriumPlan = z.infer<typeof recyclatoriumPlanSchema>;
export type RecyclatoriumActivity = z.infer<typeof recyclatoriumActivitySchema>;

export const recyclatoriumAnalysisInputSchema = z.object({
  mode: recyclatoriumModeSchema,
  assets: z.array(z.object({
    name: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    dataUrl: z.string().min(20).max(12_000_000),
  })).min(1).max(6),
});

export type RecyclatoriumAnalysisInput = z.infer<typeof recyclatoriumAnalysisInputSchema>;
