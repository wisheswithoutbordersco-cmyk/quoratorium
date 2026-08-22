import { Router } from "express";
import { generateImageWithFallback, type ImageAspectRatio } from "./imageGenerationService";

export const imageGenerationRouter = Router();

imageGenerationRouter.post("/api/generate-image", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ success: false, error: "Prompt is required" });
  }

  const result = await generateImageWithFallback(prompt, {
    aspectRatio: (req.body?.aspect_ratio || "1:1") as ImageAspectRatio,
    quality: req.body?.quality,
  });

  if (!result.success) {
    return res.status(503).json(result);
  }

  return res.json({
    ...result,
    prompt,
    metadata: {
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      providerErrors: result.providerErrors,
    },
  });
});
