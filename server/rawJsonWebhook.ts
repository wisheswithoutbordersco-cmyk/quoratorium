import express, { type NextFunction, type Request, type Response } from "express";

export interface RawJsonRequest extends Request {
  rawBody?: Buffer;
}

export const rawJsonBody = express.raw({ type: "application/json", limit: "2mb" });

export function parsePreservedJson(
  req: RawJsonRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Raw webhook body is unavailable" });
    return;
  }

  req.rawBody = req.body;
  try {
    req.body = JSON.parse(req.rawBody.toString("utf8"));
    next();
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
  }
}
