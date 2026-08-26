import { describe, expect, it, vi } from "vitest";
import { generateImageWithFallback } from "./imageGenerationService";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateImageWithFallback", () => {
  it("uses OpenAI first and never calls fal.ai when OpenAI succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{
          b64_json: Buffer.from("openai-image").toString("base64"),
          revised_prompt: "An OpenAI-rendered scene",
        }],
      }),
    );
    const storeImage = vi.fn().mockResolvedValue({
      key: "generated-images/openai.png",
      url: "/manus-storage/generated-images/openai.png",
    });

    const result = await generateImageWithFallback(
      "A cinematic lighthouse",
      { aspectRatio: "16:9", quality: "high" },
      {
        fetchImpl,
        storeImage,
        openAiApiKey: "openai-test-key",
        falApiKey: "fal-test-key",
        openAiModel: "gpt-image-2",
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations");

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: "Bearer openai-test-key" });
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "gpt-image-2",
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    });
    expect(storeImage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      provider: "openai",
      model: "gpt-image-2",
      fallbackUsed: false,
      imageUrl: "/manus-storage/generated-images/openai.png",
    });
  });

  it("calls fal.ai only after the OpenAI request fails", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "temporary OpenAI outage" }, 503))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/fallback.png" }] }));

    const result = await generateImageWithFallback(
      "A multicultural classroom poster",
      { aspectRatio: "2:3" },
      {
        fetchImpl,
        storeImage: vi.fn(),
        openAiApiKey: "openai-test-key",
        falApiKey: "fal-test-key",
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
    expect(result).toMatchObject({
      success: true,
      provider: "fal.ai",
      fallbackUsed: true,
      imageUrl: "https://fal.media/fallback.png",
    });
    expect(result.providerErrors?.[0]).toMatchObject({
      provider: "openai",
      code: "request_failed",
    });
  });

  it("uses the hosted fal.ai fallback when OpenAI storage is unavailable", async () => {
    const encodedImage = Buffer.from("openai-image-without-storage").toString("base64");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: encodedImage }] }))
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/storage-fallback.png" }] }));
    const storeImage = vi.fn().mockRejectedValue(new Error("Storage credentials unavailable"));

    const result = await generateImageWithFallback(
      "A hosted fallback result",
      {},
      {
        fetchImpl,
        storeImage,
        openAiApiKey: "openai-test-key",
        falApiKey: "fal-test-key",
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
    expect(result).toMatchObject({
      success: true,
      provider: "fal.ai",
      fallbackUsed: true,
      imageUrl: "https://fal.media/storage-fallback.png",
    });
    expect(result.providerErrors?.[0]).toMatchObject({
      provider: "openai",
      code: "storage_failed",
    });
  });

  it("keeps the OpenAI image as a last resort when storage and fal.ai both fail", async () => {
    const encodedImage = Buffer.from("openai-final-fallback").toString("base64");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: encodedImage }] }))
      .mockResolvedValueOnce(jsonResponse({ error: "fal unavailable" }, 503));

    const result = await generateImageWithFallback(
      "A final fallback result",
      {},
      {
        fetchImpl,
        storeImage: vi.fn().mockRejectedValue(new Error("Storage credentials unavailable")),
        openAiApiKey: "openai-test-key",
        falApiKey: "fal-test-key",
      },
    );

    expect(result).toMatchObject({
      success: true,
      provider: "openai",
      fallbackUsed: false,
      imageUrl: `data:image/png;base64,${encodedImage}`,
    });
    expect(result.providerErrors?.map((error) => error.code)).toEqual(["storage_failed", "request_failed"]);
  });

  it("treats a missing OpenAI key as unavailable before using fal.ai", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ images: [{ url: "https://fal.media/key-fallback.png" }] }),
    );

    const result = await generateImageWithFallback(
      "A print-ready geometric pattern",
      {},
      {
        fetchImpl,
        storeImage: vi.fn(),
        openAiApiKey: "",
        falApiKey: "fal-test-key",
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
    expect(result).toMatchObject({ success: true, provider: "fal.ai", fallbackUsed: true });
    expect(result.providerErrors?.[0]).toEqual({
      provider: "openai",
      code: "unavailable",
      message: "OPENAI_API_KEY is not configured",
    });
  });

  it("reports provider-specific failures without leaking credentials", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("Bearer leaked-openai-key", { status: 401 }))
      .mockResolvedValueOnce(new Response("Key leaked-fal-key", { status: 503 }));

    const result = await generateImageWithFallback(
      "A test image",
      {},
      {
        fetchImpl,
        storeImage: vi.fn(),
        openAiApiKey: "openai-test-key",
        falApiKey: "fal-test-key",
      },
    );

    expect(result.success).toBe(false);
    expect(result.providerErrors).toHaveLength(2);
    expect(result.providerErrors?.map(error => error.provider)).toEqual(["openai", "fal.ai"]);
    expect(JSON.stringify(result.providerErrors)).not.toContain("leaked-openai-key");
    expect(JSON.stringify(result.providerErrors)).not.toContain("leaked-fal-key");
  });
});
