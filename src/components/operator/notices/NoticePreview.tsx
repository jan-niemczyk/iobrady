"use client";

import { fillPlaceholders, parseBlocks, type NoticeAgendaItem, type NoticeContent, type NoticeRecipient } from "@/lib/noticeText";

const ALIGN: Record<string, React.CSSProperties["textAlign"]> = { left: "left", center: "center", right: "right", justify: "justify" };

/**
 * Podgląd układu zawiadomienia z tego samego modelu co generator DOCX (te same akapity,
 * wyrównanie, porządek z wcięciami, podpis w treści). Nagłówek i stopka strony są pokazane
 * w ramkach - w dokumencie Word powtarzają się na każdej stronie; podział na strony wykonuje Word.
 */
export function NoticePreview({ content: c, agenda, values, recipient, logoUrl }: {
  content: NoticeContent; agenda: NoticeAgendaItem[]; values: Record<string, string>; recipient: NoticeRecipient | null; logoUrl?: string | null;
}) {
  const v: Record<string, string> = { ...values, adresat: recipient ? [recipient.name, recipient.functionTitle].filter(Boolean).join(", ") : "", zwrot: recipient?.salutation ?? "" };
  const f = (t: string) => fillPlaceholders(t, v).text;
  const rich = (t: string) => {
    if (!f(t).trim()) return null;
    const blocks = parseBlocks(f(t));
    return blocks.map((b, i) => (
      <p key={i} style={{ textAlign: ALIGN[b.align], margin: "0 0 .4em", paddingLeft: b.type !== "p" ? "1.6em" : undefined, textIndent: b.type !== "p" ? "-1em" : undefined }}>
        {b.type === "ul" && "- "}{b.type === "ol" && `${b.number}. `}
        {b.runs.map((r, j) => <span key={j} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? "italic" : undefined }}>{r.text}</span>)}
      </p>
    ));
  };
  const lines = (t: string) => f(t).split(/\r?\n/).map((l, i) => <div key={i}>{l || " "}</div>);
  const placeDate = [f(c.place), c.letterDate ? v.data_pisma : ""].filter(Boolean).join(", ");

  return (
    <div className="notice-page" style={{ fontFamily: "Arial, sans-serif", fontSize: 14.7, lineHeight: 1.45, color: "#000", background: "#fff", maxWidth: 794, margin: "0 auto", padding: "40px 48px 24px 64px", boxShadow: "0 1px 6px rgba(0,0,0,.18)" }}>
      {c.letterhead.trim() && <div style={{ border: "1px dashed #999", padding: 6, fontSize: 12, textAlign: "center", marginBottom: 16 }} title="Nagłówek strony (każda strona)">{lines(c.letterhead)}</div>}
      {c.useLogo && logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" style={{ height: 64, marginBottom: 8 }} />}
      {c.unitName.trim() && <div style={{ fontWeight: 700 }}>{lines(c.unitName)}</div>}
      {c.unitDetails.trim() && <div style={{ fontSize: 13 }}>{lines(c.unitDetails)}</div>}
      {placeDate && <div style={{ textAlign: "right", margin: "10px 0" }}>{placeDate}</div>}
      {c.caseRef.trim() && <div style={{ fontSize: 13, marginBottom: 10 }}>Znak sprawy: {f(c.caseRef)}</div>}
      {recipient && (
        <div style={{ marginLeft: "50%", marginTop: 18 }}>
          {[recipient.name, recipient.functionTitle, recipient.institution, ...recipient.address.split(/\r?\n/)].filter((x) => x.trim()).map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : undefined }}>{l}</div>)}
        </div>
      )}
      {c.title.trim() && <div style={{ textAlign: "center", fontWeight: 700, fontSize: 17, margin: "26px 0 16px" }}>{f(c.title)}</div>}
      {recipient?.salutation.trim() && <p style={{ margin: "0 0 .5em" }}>{recipient.salutation}</p>}
      {rich(c.intro)}
      {c.agendaPosition !== "none" && agenda.length > 0 && (
        <>
          {c.agendaLabel.trim() && <p style={{ fontWeight: 700, margin: "12px 0 6px" }}>{f(c.agendaLabel)}</p>}
          {agenda.map((a) => {
            const num = a.unnumbered || !a.number.trim() ? "" : `${a.number.replace(/\.$/, "")}.`;
            return (
              <div key={a.key} style={{ display: "flex", marginLeft: a.level === 1 ? 38 : 0, marginBottom: 4 }}>
                <span style={{ minWidth: 38, flexShrink: 0 }}>{num}</span>
                <span style={{ marginLeft: num ? 0 : 0 }}>{f(a.title)}</span>
              </div>
            );
          })}
        </>
      )}
      {rich(c.outro)}
      {c.signature.trim() && <div style={{ marginLeft: "50%", textAlign: "center", marginTop: 32 }}>{lines(c.signature)}</div>}
      {(c.footer.trim() || c.footerPageNumbers) && (
        <div style={{ borderTop: "1px dashed #999", marginTop: 40, paddingTop: 6, fontSize: 11 }} title="Stopka strony (każda strona)">
          <div style={{ textAlign: "center" }}>{c.footer.trim() ? lines(c.footer) : null}</div>
          {c.footerPageNumbers && <div style={{ textAlign: "right" }}>Strona 1 z N</div>}
        </div>
      )}
    </div>
  );
}
