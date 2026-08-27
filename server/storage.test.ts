import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bucket = {
    upload: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
  };
  return {
    bucket,
    storage: {
      getBucket: vi.fn(),
      createBucket: vi.fn(),
      from: vi.fn(() => bucket),
    },
  };
});

vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => ({ storage: mocks.storage }),
}));

import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";

describe("durable storage fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.getBucket.mockResolvedValue({
      data: { id: "quoratorium-assets" },
      error: null,
    });
    mocks.storage.createBucket.mockResolvedValue({ data: null, error: null });
    mocks.bucket.upload.mockResolvedValue({ data: { path: "stored" }, error: null });
    mocks.bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/private-image" },
      error: null,
    });
    mocks.bucket.remove.mockResolvedValue({ data: [], error: null });
  });

  it("stores, signs, and deletes a private Supabase object when Forge is unavailable", async () => {
    const stored = await storagePut(
      "conversation-assets/1/2/example.jpg",
      Buffer.from("image-bytes"),
      "image/jpeg",
    );

    expect(stored.key).toMatch(
      /^supabase:conversation-assets\/1\/2\/example_[a-f0-9]{8}\.jpg$/,
    );
    expect(stored.url).toBe("https://signed.example/private-image");
    expect(mocks.storage.from).toHaveBeenCalledWith("quoratorium-assets");
    expect(mocks.bucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^conversation-assets\/1\/2\/example_[a-f0-9]{8}\.jpg$/,
      ),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );

    await expect(storageGetSignedUrl(stored.key)).resolves.toBe(
      "https://signed.example/private-image",
    );
    await expect(storageDelete(stored.key)).resolves.toBe(true);
    expect(mocks.bucket.remove).toHaveBeenCalledWith([
      expect.stringMatching(
        /^conversation-assets\/1\/2\/example_[a-f0-9]{8}\.jpg$/,
      ),
    ]);
  });
});
