import { describe, expect, it, vi } from "vitest";
import { generateImageWithFallback } from "./imageGenerationService";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function imageResponse(bytes = "fallback-image"): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

describe("generateImageWithFallback", () => {
  it("uses the built-in provider once and never calls fal.ai when it succeeds", async () => {
    const generateBuiltIn = vi.fn().mockResolvedValue({
      url: "/manus-storage/generated-images/built-in.png",
    });
    const fetchImpl = vi.fn();
    const reference = {
      b64Json: Buffer.from("source-image").toString("base64"),
      mimeType: "image/png",
    };

    const result = await generateImageWithFallback(
      "A polished classroom product mockup",
      { originalImages: [reference], quality: "high" },
      {
        generateBuiltIn,
        fetchImpl,
        falApiKey: "fal-test-key",
      },
    );

    expect(generateBuiltIn).toHaveBeenCalledTimes(1);
    expect(generateBuiltIn).toHaveBeenCalledWith({
      prompt: "A polished classroom product mockup",
      originalImages: [reference],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      provider: "built-in",
      model: "gpt-image-2",
      fallbackUsed: false,
      imageUrl: "/manus-storage/generated-images/built-in.png",
    });
  });

  it("calls fal.ai once after a real built-in failure and stores the fallback durably", async () => {
    const generateBuiltIn = vi.fn().mockRejectedValue(new Error("temporary built-in outage"));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/fallback.png" }] }))
      .mockResolvedValueOnce(imageResponse());
    const storeImage = vi.fn().mockResolvedValue({
      key: "generated-images/fallback.png",
      url: "/manus-storage/generated-images/fallback.png",
    });

    const result = await generateImageWithFallback(
      "A multicultural classroom poster",
      { aspectRatio: "2:3" },
      {
        generateBuiltIn,
        fetchImpl,
        storeImage,
        falApiKey: "fal-test-key",
      },
    );

    expect(generateBuiltIn).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://fal.run/openai/gpt-image-2");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://fal.media/fallback.png");
    const falRequest = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(falRequest.body))).toMatchObject({
      image_size: "portrait_4_3",
      quality: "high",
      num_images: 1,
      output_format: "png",
    });
    expect(storeImage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      provider: "fal.ai",
      model: "openai/gpt-image-2",
      fallbackUsed: true,
      storageKey: "generated-images/fallback.png",
      imageUrl: "/manus-storage/generated-images/fallback.png",
    });
    expect(result.providerErrors?.[0]).toMatchObject({
      provider: "built-in",
      code: "request_failed",
    });
  });

  it("falls back when the built-in provider returns no image URL", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/no-url-fallback.png" }] }))
      .mockResolvedValueOnce(imageResponse());

    const result = await generateImageWithFallback(
      "A fallback image",
      {},
      {
        generateBuiltIn: vi.fn().mockResolvedValue({}),
        fetchImpl,
        storeImage: vi.fn().mockResolvedValue({ key: "fallback.png", url: "/stored/fallback.png" }),
        falApiKey: "fal-test-key",
      },
    );

    expect(result).toMatchObject({ success: true, provider: "fal.ai", fallbackUsed: true });
    expect(result.providerErrors?.[0]).toMatchObject({
      provider: "built-in",
      code: "invalid_response",
    });
  });

  it("uses fal.ai GPT Image 2 edit when a reference image is present", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/reference-result.png" }] }))
      .mockResolvedValueOnce(imageResponse());
    const reference = {
      b64Json: Buffer.from("source-image").toString("base64"),
      mimeType: "image/png",
    };

    const result = await generateImageWithFallback(
      "Place this printable in a realistic laptop mockup",
      { originalImages: [reference] },
      {
        generateBuiltIn: vi.fn().mockRejectedValue(new Error("primary unavailable")),
        fetchImpl,
        storeImage: vi.fn().mockResolvedValue({ key: "edited.png", url: "/stored/edited.png" }),
        falApiKey: "fal-test-key",
      },
    );

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://fal.run/openai/gpt-image-2/edit");
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      image_urls: [`data:image/png;base64,${reference.b64Json}`],
      image_size: "auto",
      quality: "high",
      num_images: 1,
    });
    expect(result).toMatchObject({
      success: true,
      provider: "fal.ai",
      model: "openai/gpt-image-2/edit",
      fallbackUsed: true,
      imageUrl: "/stored/edited.png",
    });
  });

  it("fails instead of returning a temporary fal.ai URL when durable storage fails", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://fal.media/temporary.png" }] }))
      .mockResolvedValueOnce(imageResponse());

    const result = await generateImageWithFallback(
      "A durable result",
      {},
      {
        generateBuiltIn: vi.fn().mockRejectedValue(new Error("primary unavailable")),
        fetchImpl,
        storeImage: vi.fn().mockRejectedValue(new Error("storage unavailable")),
        falApiKey: "fal-test-key",
      },
    );

    expect(result.success).toBe(false);
    expect(result.imageUrl).toBeUndefined();
    expect(result.providerErrors?.map((error) => error.code)).toEqual(["request_failed", "storage_failed"]);
  });

  it("reports a missing fallback key only after one built-in attempt", async () => {
    const generateBuiltIn = vi.fn().mockRejectedValue(new Error("BUILT_IN_FORGE_API_KEY is not configured"));
    const fetchImpl = vi.fn();

    const result = await generateImageWithFallback(
      "A test image",
      {},
      { generateBuiltIn, fetchImpl, falApiKey: "" },
    );

    expect(generateBuiltIn).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.providerErrors).toEqual([
      {
        provider: "built-in",
        code: "unavailable",
        message: "BUILT_IN_FORGE_API_KEY is not configured",
      },
      {
        provider: "fal.ai",
        code: "unavailable",
        message: "FAL_API_KEY is not configured",
      },
    ]);
  });

  it("reports provider-specific failures without leaking credentials", async () => {
    const result = await generateImageWithFallback(
      "A test image",
      {},
      {
        generateBuiltIn: vi.fn().mockRejectedValue(new Error("Bearer leaked-built-in-key")),
        fetchImpl: vi.fn().mockResolvedValue(new Response("Key leaked-fal-key", { status: 503 })),
        storeImage: vi.fn(),
        falApiKey: "fal-test-key",
      },
    );

    expect(result.success).toBe(false);
    expect(result.providerErrors).toHaveLength(2);
    expect(result.providerErrors?.map((error) => error.provider)).toEqual(["built-in", "fal.ai"]);
    expect(JSON.stringify(result.providerErrors)).not.toContain("leaked-built-in-key");
    expect(JSON.stringify(result.providerErrors)).not.toContain("leaked-fal-key");
    expect(JSON.stringify(result.providerErrors)).toContain("[redacted]");
  });

  it("rejects an empty prompt without calling either provider", async () => {
    const generateBuiltIn = vi.fn();
    const fetchImpl = vi.fn();

    const result = await generateImageWithFallback(
      "   ",
      {},
      { generateBuiltIn, fetchImpl, falApiKey: "fal-test-key" },
    );

    expect(result).toEqual({ success: false, error: "Prompt is required", providerErrors: [] });
    expect(generateBuiltIn).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
