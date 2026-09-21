import type { NextFunction, Request, Response } from "express";
import { resolveAuthenticatedUser } from "./_core/context";

export async function requireWorkspaceAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({
        success: false,
        error: "A verified workspace session is required.",
      });
      return;
    }

    (req as any).workspaceUser = user;
    next();
  } catch (error: any) {
    console.error("[Auth] Workspace access verification failed", error);
    res.status(503).json({
      success: false,
      error: "Workspace authentication is temporarily unavailable.",
    });
  }
}
