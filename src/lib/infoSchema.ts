import { z } from "zod";

const date = z.string().max(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), "Nieprawidłowa data.").optional().nullable();

/** Pola komunikatu modułu „Informacje” przyjmowane od operatora. */
export const infoSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(100_000).optional(),
  category: z.string().trim().max(100).optional(),
  kind: z.enum(["NEWS", "DOCUMENT"]).optional(),
  pinned: z.boolean().optional(),
  important: z.boolean().optional(),
  eventAt: date,
  expiresAt: date,
  links: z.array(z.object({ label: z.string().max(200).optional(), url: z.string().max(1000) })).max(30).optional(),
  audienceAll: z.boolean().optional(),
  audienceOrgUnitIds: z.array(z.string().max(64)).max(200).optional(),
  audienceUserIds: z.array(z.string().max(64)).max(5000).optional(),
});
