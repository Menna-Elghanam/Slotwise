import type { Request, Response } from "express";
import { getUserId } from "../auth/auth.middleware.js";
import * as meService from "./me.service.js";

export async function workspaceHandler(req: Request, res: Response) {
  res.json(await meService.getWorkspace(getUserId(req)));
}
