import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getKnowledgeService } from "@/server/runtime";
import { scopeSchema, memoryKind, memorySource } from "@/domain/knowledge";
import { importFile } from "@/server/knowledge/service";
const id = z.uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const command = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("project"), name: z.string().min(1).max(160) })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      projectId: id.nullable(),
      title: z.string().min(1).max(160),
      body: z.string().max(24000),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id,
      hash: digest,
      title: z.string().min(1).max(160).optional(),
      body: z.string().max(24000).optional(),
      archived: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("retry"), id }).strict(),
  z.object({ action: z.literal("rebuild") }).strict(),
  z
    .object({
      action: z.literal("preview"),
      projectId: id.nullable(),
      files: z.array(importFile).min(1).max(20),
    })
    .strict(),
  z.object({ action: z.literal("import"), id, digest }).strict(),
  z
    .object({
      action: z.literal("propose"),
      projectId: id.nullable(),
      kind: memoryKind,
      statement: z.string().min(1).max(1800),
      source: memorySource,
      replaces: id.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("accept"),
      id,
      reviewHash: digest,
      acknowledgeConflicts: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("reject"), id }).strict(),
]);
export async function GET(request: Request) {
  return api(async (owner) => {
    const s = getKnowledgeService(),
      q = new URL(request.url).searchParams;
    switch (q.get("op")) {
      case "projects":
        return { projects: await s.projects(owner) };
      case "document":
        return s.read(owner, id.parse(q.get("id")));
      case "history":
        return s.history(owner, id.parse(q.get("id")));
      case "conflicts":
        return s.conflicts(owner, id.parse(q.get("id")));
      case "revision":
        return s.revision(
          owner,
          id.parse(q.get("id")),
          z.coerce.number().int().positive().parse(q.get("revision")),
        );
      case "citation":
        return s.citation(
          owner,
          id.parse(q.get("message")),
          z
            .string()
            .regex(/^S[1-6]$/)
            .parse(q.get("label")),
        );
      case "review":
        return s.review(owner, id.parse(q.get("id")));
      default: {
        const scope = scopeSchema.parse({
          projectId: q.get("projectId") || null,
          includeGlobal: q.get("global") === "true",
        });
        return {
          projects: await s.projects(owner),
          documents: await s.list(owner, scope, q.get("archived") === "true"),
          proposals: await s.proposals(owner),
          results: q.get("q") ? await s.search(owner, scope, q.get("q")!) : [],
        };
      }
    }
  });
}
export async function POST(request: Request) {
  return api(async (owner) => {
    // Larger bounded allowance is only for explicit UTF-8 import previews.
    const b = command.parse(await readJson(request, 600000)),
      s = getKnowledgeService();
    switch (b.action) {
      case "project":
        return s.createProject(owner, b.name);
      case "create":
        return s.create(owner, b);
      case "update":
        return s.update(owner, b.id, b);
      case "retry":
        await s.retry(owner, b.id);
        return { queued: true };
      case "rebuild":
        await s.rebuild(owner);
        return { queued: true };
      case "preview":
        return s.previewImport(owner, b.projectId, b.files);
      case "import":
        return s.confirmImport(owner, b.id, b.digest);
      case "propose":
        return s.propose(owner, b);
      case "accept":
        return s.confirmMemory(
          owner,
          b.id,
          b.reviewHash,
          b.acknowledgeConflicts,
        );
      case "reject":
        await s.rejectMemory(owner, b.id);
        return { rejected: true };
    }
  });
}
