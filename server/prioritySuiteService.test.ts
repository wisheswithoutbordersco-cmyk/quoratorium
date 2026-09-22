import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addOrchestrationEvent: vi.fn(async () => 1),
  resolveChatAssetRecords: vi.fn(),
}));

vi.mock("./db", () => ({
  addOrchestrationEvent: mocks.addOrchestrationEvent,
}));
vi.mock("./chatAssets", () => ({
  resolveChatAssetRecords: mocks.resolveChatAssetRecords,
}));

import {
  analyzeWithExtractorium,
  detectWithTemplatorium,
  getPriorityServiceStatuses,
  loadOwnerImageAttachment,
  recordPrioritySuiteAudit,
  type OwnerImageAttachment,
} from "./prioritySuiteService";

const originalEnvironment = {
  token: process.env.TORIU_SERVICE_TOKEN,
  extractorium: process.env.EXTRACTORIUM_API_URL,
  templatorium: process.env.TEMPLATORIUM_API_URL,
};

const image: OwnerImageAttachment = {
  id: "12",
  name: "worksheet.png",
  mimeType: "image/png",
  size: 8,
  base64: "iVBORw0KGgo=",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
};

beforeEach(() => {
  process.env.TORIU_SERVICE_TOKEN = "test-suite-token";
  process.env.EXTRACTORIUM_API_URL = "https://extractorium.example";
  process.env.TEMPLATORIUM_API_URL = "https://templatorium.example";
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalEnvironment.token === undefined)
    delete process.env.TORIU_SERVICE_TOKEN;
  else process.env.TORIU_SERVICE_TOKEN = originalEnvironment.token;
  if (originalEnvironment.extractorium === undefined)
    delete process.env.EXTRACTORIUM_API_URL;
  else process.env.EXTRACTORIUM_API_URL = originalEnvironment.extractorium;
  if (originalEnvironment.templatorium === undefined)
    delete process.env.TEMPLATORIUM_API_URL;
  else process.env.TEMPLATORIUM_API_URL = originalEnvironment.templatorium;
});

describe("priority suite service client", () => {
  it("authenticates Extractorium with Bearer and sends only its typed image payload", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            rawText: "Math",
            cleanedText: "Math",
            model: "mock",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const result = await analyzeWithExtractorium("process", image, fetchMock);

    expect(result.cleanedText).toBe("Math");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://extractorium.example/api/toriu/document-analysis"
    );
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-suite-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      operation: "process",
      image: {
        base64: image.base64,
        mime: image.mimeType,
        name: image.name,
        size: image.size,
      },
    });
  });

  it("authenticates Templatorium with its dedicated service header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            regions: [{ text: "Name", x: 10, y: 10, width: 20, height: 5 }],
            model: "mock",
            provider: "openrouter",
            documentType: "worksheet",
            coverageConfidence: 0.95,
            recommendRecovery: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const result = await detectWithTemplatorium("global", image, fetchMock);

    expect(result.regions).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://templatorium.example/api/toriu/vision/detect");
    expect(init.headers).toMatchObject({
      "x-toriu-service-token": "test-suite-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      imageDataUrl: image.dataUrl,
      mode: "global",
    });
  });

  it("checks both services without invoking a billable analysis route", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify({
            service: String(url).includes("extractorium")
              ? "extractorium"
              : "toriu",
            authenticatedAs: "service",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const statuses = await getPriorityServiceStatuses(fetchMock);

    expect(statuses).toEqual([
      expect.objectContaining({ system: "Extractorium", connected: true }),
      expect.objectContaining({ system: "Templatorium", connected: true }),
    ]);
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      "https://extractorium.example/api/toriu/status",
      "https://templatorium.example/api/toriu/status",
    ]);
  });

  it("loads only an owner-scoped image and rejects mismatched file signatures", async () => {
    mocks.resolveChatAssetRecords.mockResolvedValue([
      {
        id: "12",
        name: "worksheet.png",
        type: "image/png",
        size: 8,
        url: "https://storage.example/worksheet.png",
      },
    ]);
    const fetchMock = vi.fn(
      async () => new Response(Buffer.from("not-png"), { status: 200 })
    );

    await expect(
      loadOwnerImageAttachment(7, ["12", "13"], fetchMock)
    ).rejects.toThrow("not a valid PNG");
    expect(mocks.resolveChatAssetRecords).toHaveBeenCalledWith(7, ["12"]);
  });

  it("records metadata-only capability audit events", async () => {
    await recordPrioritySuiteAudit({
      system: "Templatorium",
      capability: "templatorium.text_regions.read",
      eventType: "templatorium_text_detected",
      userId: 7,
      projectId: 4,
      operation: "global",
      assetName: "worksheet.png",
      outcome: "completed",
      resultCount: 3,
    });

    expect(mocks.addOrchestrationEvent).toHaveBeenCalledWith({
      user_id: 7,
      project_id: 4,
      event_type: "templatorium_text_detected",
      agent_name: "Toríu · Templatorium",
      summary: "Templatorium global completed for worksheet.png",
      payload: {
        capability: "templatorium.text_regions.read",
        permission: "read",
        risk: "medium",
        confirmation: "none",
        operation: "global",
        assetNames: ["worksheet.png"],
        resultCount: 3,
        outcome: "completed",
      },
    });
  });
});
