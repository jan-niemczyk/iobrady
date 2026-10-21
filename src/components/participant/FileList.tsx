"use client";

import { IconDownload, IconExternal, IconFile } from "@/components/ui/Icon";

export type FileItem = { id: string; fileName: string; sizeBytes: number; mimeType: string };

export function fileFormat(name: string, mime: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toUpperCase();
  return mime === "application/pdf" ? "PDF" : "plik";
}
export function fileSize(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
/** Czytelna etykieta pliku: nazwa bez rozszerzenia, podkreślenia zamienione na spacje. */
export function fileLabel(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim() || name;
}
const canOpenInline = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/** Lista plików z akcjami „Otwórz” (PDF/obraz w nowej karcie) i „Pobierz”. Adres pliku z `href`. */
export function FileList({ files, label, href }: { files: FileItem[]; label: string; href: (id: string) => string }) {
  if (files.length === 0) return null;
  return (
    <ul className="pt-files pt-mtg-files" aria-label={label}>
      {files.map((a) => (
        <li key={a.id} className="pt-mtg-file">
          <span className="pt-file-icon" aria-hidden><IconFile size={20} /></span>
          <span className="pt-file-name">{fileLabel(a.fileName)}<span className="pt-file-meta"> {fileFormat(a.fileName, a.mimeType)}, {fileSize(a.sizeBytes)}</span></span>
          <span className="pt-btn-group">
            {canOpenInline(a.mimeType) && (
              <a className="pt-btn pt-btn-sm" href={`${href(a.id)}?inline=1`} target="_blank" rel="noopener noreferrer">
                <IconExternal size={15} /> Otwórz<span className="sr-only"> {a.fileName} w nowej karcie</span>
              </a>
            )}
            <a className="pt-btn pt-btn-sm" href={href(a.id)} download>
              <IconDownload size={15} /> Pobierz<span className="sr-only"> {a.fileName}</span>
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
