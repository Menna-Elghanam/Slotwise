import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { workspaceHandler } from "./me.controller.js";

export const meRouter = Router();

meRouter.get("/me/workspace", requireAuth, workspaceHandler);
