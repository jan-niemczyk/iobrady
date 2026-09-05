import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import crypto from "crypto";

// Katalog CELOWO poza "public/" - Next.js serwuje public/ statycznie, więc trzymanie tu plików
// gwarantowałoby, że są osiągalne bez żadnej kontroli dostępu. Jedyny dostęp do treści to
// autoryzowany endpoint src/app/api/attachments/[id]/download/route.ts.
export const ATTACHMENTS_DIR = path.join(process.cwd(), "storage", "attachments");

export const ALLOWED_ATTACHMENT_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB

export async function saveAttachmentFile(file: File): Promise<{ storedName: string; ext: string }> {
  await mkdir(ATTACHMENTS_DIR, { recursive: true });
  const ext = ALLOWED_ATTACHMENT_MIME[file.type] ?? "bin";
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(ATTACHMENTS_DIR, storedName), buffer);
  return { storedName, ext };
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  await unlink(path.join(ATTACHMENTS_DIR, storedName)).catch(() => {});
}
