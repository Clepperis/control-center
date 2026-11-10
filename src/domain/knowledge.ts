import { z } from "zod";

export const scopeSchema = z
  .object({
    projectId: z.uuid().nullable(),
    includeGlobal: z.boolean().default(false),
  })
  .strict();
export type KnowledgeScope = z.infer<typeof scopeSchema>;
export const memoryKind = z.enum(["preference", "decision", "constraint"]);
export const memorySource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), id: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("document"),
      id: z.uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export const memorySuggestion = z
  .object({
    statement: z.string().trim().min(1).max(1800),
    kind: memoryKind,
  })
  .strict();
export interface Project {
  id: string;
  name: string;
  description: string;
}
export interface KnowledgeDocument {
  id: string;
  projectId: string | null;
  title: string;
  path: string;
  contentType: "text/markdown" | "text/plain";
  kind: "document" | "preference" | "decision" | "constraint";
  provenance: Record<string, unknown>;
  revision: number;
  hash: string;
  archived: boolean;
  supersededBy: string | null;
  indexStatus: "pending" | "indexed" | "stale" | "failed";
  indexError: string | null;
  indexedAt: string | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Passage {
  documentId: string;
  revision: number;
  hash: string;
  passage: number;
  title: string;
  heading: string;
  content: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  projectId: string | null;
  kind: string;
  citation: string;
}
export interface Grounding {
  status: "used" | "empty" | "unavailable" | "off" | "uncited";
  scope: KnowledgeScope | null;
  passages: Passage[];
  cited: string[];
}
export interface MemoryProposal {
  id: string;
  projectId: string | null;
  kind: string;
  statement: string;
  source: z.infer<typeof memorySource>;
  replaces: string | null;
  reviewHash: string;
  state: string;
  documentId: string | null;
  approvedAt: string | null;
  createdAt: string;
}
export const knowledgeErrors: Record<string, string> = {
  knowledge_configuration:
    "Žinių saugykla nesukonfigūruota. Nurodykite atskirą privatų KNOWLEDGE_ROOT katalogą už viešo repo ribų.",
  path_boundary:
    "Failo kelias neleidžiamas. Nuorodos, paslėpti katalogai ir keliai už saugyklos ribų nepalaikomi.",
  file_unavailable:
    "Failas dingęs, neperskaitomas arba netinkamo formato. Atkurkite failą ir kartokite indeksavimą.",
  revision_conflict:
    "Versijų konfliktas. Jūsų tekstas išsaugotas konfliktų kopijoje; naujesnis failas neperrašytas. Atsisiųskite savo tekstą ir iš naujo atverkite dokumentą palyginimui.",
  metadata_conflict:
    "Pakeista dokumento tapatybė, aprėptis arba patvirtintos atminties tekstas. Reikia savininko peržiūros; failas nebus naudojamas paieškoje.",
  review_required:
    "Atminties pataisą pateikite kaip naują pasiūlymą, aiškiai pakeičiant ankstesnį įrašą.",
  review_changed:
    "Peržiūros turinys pasikeitė arba paseno. Paruoškite naują pasiūlymą.",
  duplicate_memory: "Toks atminties įrašas arba pasiūlymas jau yra.",
  secret_content:
    "Atmintyje negalima saugoti paslapčių. Pašalinkite raktus, slaptažodžius ir prisijungimo duomenis.",
  import_limit:
    "Importo riba: 20 failų, 24 000 baitų vienam ir 240 000 baitų iš viso. Tik UTF-8 Markdown ir tekstas.",
  source_scope:
    "Šaltinis nepriklauso pasirinktai aprėpčiai arba jo versija nepasiekiama.",
  revision_unavailable:
    "Originali cituota versija nebepasiekiama. Dabartinis tekstas nerodomas kaip tas pats įrodymas.",
};
