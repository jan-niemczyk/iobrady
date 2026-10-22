"use client";

import { useEffect, useRef } from "react";
import { parseBlocks, type Align, type Run } from "@/lib/noticeText";

/**
 * Edytor WYSIWYG dla dłuższych treści (zawiadomienia, informacje, interpelacje, odpowiedzi).
 * Zapisuje tekst w tym samym ograniczonym zapisie co dotąd (akapity, **pogrubienie**, _kursywa_,
 * listy „- ” i „1. ”, wyrównanie [do-srodka]/[do-prawej]/[wyjustuj]) - podgląd, DOCX i PDF
 * korzystają z jednego modelu, więc formatowanie po zapisie wygląda tak samo.
 * Wklejanie zawsze jako czysty tekst (bez obcych stylów).
 */

const ALIGN_PREFIX: Record<Align, string> = { left: "", center: "[do-srodka] ", right: "[do-prawej] ", justify: "[wyjustuj] " };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function runsHtml(runs: Run[]): string {
  const html = runs.map((r) => {
    let t = esc(r.text);
    if (r.italic) t = `<i>${t}</i>`;
    if (r.bold) t = `<b>${t}</b>`;
    return t;
  }).join("");
  return html || "<br>";
}

/** Zapis tekstowy -> HTML edytora. */
export function markupToHtml(src: string): string {
  const blocks = parseBlocks(src || "");
  const out: string[] = [];
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    const style = b.align !== "left" ? ` style="text-align:${b.align}"` : "";
    if (b.type === "p") { out.push(`<div${style}>${runsHtml(b.runs)}</div>`); i++; continue; }
    const tag = b.type === "ul" ? "ul" : "ol";
    const items: string[] = [];
    let j = i;
    while (j < blocks.length && blocks[j].type === b.type) {
      const it = blocks[j];
      items.push(`<li${it.align !== "left" ? ` style="text-align:${it.align}"` : ""}>${runsHtml(it.runs)}</li>`);
      j++;
    }
    out.push(`<${tag}>${items.join("")}</${tag}>`);
    i = j;
  }
  return out.join("") || "<div><br></div>";
}

function alignOf(el: HTMLElement): Align {
  const a = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
  return a === "center" ? "center" : a === "right" ? "right" : a === "justify" ? "justify" : "left";
}

/** Treść inline elementu -> tekst z **...** i _..._ (wiersze rozdzielone <br>). */
function inlineToLines(node: Node, bold = false, italic = false): string[] {
  const lines: string[] = [""];
  const push = (t: string) => { lines[lines.length - 1] += t; };
  const walk = (n: Node, b: boolean, it: boolean) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? "").replace(/ /g, " ");
      if (!t) return;
      let s = t;
      if (it && s.trim()) s = `_${s}_`;
      if (b && s.trim()) s = `**${s}**`;
      push(s);
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    const tag = n.tagName;
    if (tag === "BR") { lines.push(""); return; }
    const nb = b || tag === "B" || tag === "STRONG" || /bold|[6-9]00/.test(n.style.fontWeight);
    const ni = it || tag === "I" || tag === "EM" || n.style.fontStyle === "italic";
    n.childNodes.forEach((c) => walk(c, nb, ni));
  };
  node.childNodes.forEach((c) => walk(c, bold, italic));
  // Sklejenie sąsiednich znaczników: „**a****b**” -> „**ab**”.
  return lines.map((l) => l.replace(/\*\*\*\*/g, "").replace(/__/g, ""));
}

const BLOCK = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "LI", "UL", "OL", "BLOCKQUOTE"]);

/** HTML edytora -> zapis tekstowy. */
export function htmlToMarkup(root: HTMLElement): string {
  const out: string[] = [];
  const emit = (el: HTMLElement, prefix = "") => {
    const al = ALIGN_PREFIX[alignOf(el)];
    for (const l of inlineToLines(el)) out.push(`${al}${prefix}${l}`.replace(/\s+$/, ""));
  };
  const walkBlock = (el: HTMLElement) => {
    if (el.tagName === "UL" || el.tagName === "OL") {
      let n = 1;
      el.childNodes.forEach((c) => {
        if (c instanceof HTMLElement && c.tagName === "LI") emit(c, el.tagName === "UL" ? "- " : `${n++}. `);
      });
      return;
    }
    // Blok z zagnieżdżonymi blokami (np. div z div) - schodzimy niżej.
    if ([...el.children].some((c) => BLOCK.has(c.tagName))) {
      let inline = document.createElement("div");
      const flush = () => { if (inline.childNodes.length) { inline.style.textAlign = el.style.textAlign; emit(inline); inline = document.createElement("div"); } };
      el.childNodes.forEach((c) => {
        if (c instanceof HTMLElement && BLOCK.has(c.tagName)) { flush(); walkBlock(c); } else inline.appendChild(c.cloneNode(true));
      });
      flush();
      return;
    }
    emit(el);
  };
  let loose = document.createElement("div");
  const flushLoose = () => { if (loose.childNodes.length) { emit(loose); loose = document.createElement("div"); } };
  root.childNodes.forEach((c) => {
    if (c instanceof HTMLElement && BLOCK.has(c.tagName)) { flushLoose(); walkBlock(c); } else loose.appendChild(c.cloneNode(true));
  });
  flushLoose();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

type Variant = "bootstrap" | "app";

export function RichEditor({ id, label, value, onChange, minHeight = 160, variant = "bootstrap", extra, describedBy }: {
  id: string; label: string; value: string; onChange: (v: string) => void; minHeight?: number; variant?: Variant;
  /** Dodatkowe elementy paska (np. wybór znacznika danych). */
  extra?: (insert: (text: string) => void) => React.ReactNode;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("");

  // Wartość z zewnątrz (wczytanie, reset) - tylko gdy różni się od tego, co wpisano w edytorze.
  useEffect(() => {
    if (!ref.current || value === last.current) return;
    ref.current.innerHTML = markupToHtml(value);
    last.current = value;
  }, [value]);

  const sync = () => {
    if (!ref.current) return;
    const v = htmlToMarkup(ref.current);
    last.current = v;
    onChange(v);
  };
  const cmd = (c: string) => {
    ref.current?.focus();
    document.execCommand(c, false);
    sync();
  };
  const insert = (text: string) => {
    ref.current?.focus();
    document.execCommand("insertText", false, text);
    sync();
  };

  const b = variant === "bootstrap";
  const btn = b ? "btn btn-sm btn-outline-secondary" : "pt-btn pt-btn-sm";
  const tools: [string, string, string, React.CSSProperties?][] = [
    ["bold", "B", "Pogrubienie", { fontWeight: 700 }], ["italic", "I", "Kursywa", { fontStyle: "italic" }],
    ["insertUnorderedList", "Lista", "Lista punktowana"], ["insertOrderedList", "1.", "Lista numerowana"],
    ["justifyLeft", "Do lewej", "Wyrównaj do lewej"], ["justifyCenter", "Środek", "Wyśrodkuj"], ["justifyRight", "Do prawej", "Wyrównaj do prawej"], ["justifyFull", "Wyjustuj", "Wyjustuj"],
  ];
  return (
    <div className={b ? "mb-1" : "pt-field"}>
      <label className={b ? "form-label" : "pt-label"} htmlFor={id} onClick={() => ref.current?.focus()}>{label}</label>
      <div className={b ? "d-flex flex-wrap gap-1 mb-1" : "pt-btn-group"} role="toolbar" aria-label={`Formatowanie: ${label}`} style={b ? undefined : { marginBottom: 4 }}>
        {tools.map(([c, text, title, style]) => (
          <button key={c} type="button" className={btn} title={title} aria-label={title} style={style} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)}>{text}</button>
        ))}
        {extra?.(insert)}
      </div>
      <div
        id={id} ref={ref} role="textbox" aria-multiline="true" aria-label={label} aria-describedby={describedBy} contentEditable suppressContentEditableWarning
        className={b ? "form-control rich-editor" : "pt-field-input rich-editor"}
        style={{ minHeight, overflowY: "auto", maxHeight: "70vh", lineHeight: 1.5 }}
        onInput={sync} onBlur={sync}
        onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); sync(); }}
      />
    </div>
  );
}
