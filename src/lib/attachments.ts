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

/**
 * H-04: rozpoznanie typu materiału po TREŚCI (sygnatura pliku), nie po typie zgłoszonym przez
 * przeglądarkę. DOCX/XLSX to archiwa ZIP - dodatkowo sprawdzamy charakterystyczne wpisy pakietu.
 * Zwraca typ MIME albo null (plik odrzucany).
 */
export function sniffAttachment(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // Nazwy plików w archiwum są jawnym tekstem (nagłówki lokalne i katalog centralny).
    const names = buf.toString("latin1");
    if (!names.includes("[Content_Types].xml")) return null;
    if (names.includes("word/document.xml")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (names.includes("xl/workbook.xml")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return null;
}

export async function saveAttachmentFile(buffer: Buffer, mime: string): Promise<{ storedName: string; ext: string }> {
  await mkdir(ATTACHMENTS_DIR, { recursive: true });
  const ext = ALLOWED_ATTACHMENT_MIME[mime] ?? "bin";
  const storedName = `${crypto.randomUUID()}.${ext}`;
  await writeFile(path.join(ATTACHMENTS_DIR, storedName), buffer);
  return { storedName, ext };
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  await unlink(path.join(ATTACHMENTS_DIR, storedName)).catch(() => {});
}
