import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicCase } from "@/lib/inquiryPublic";
import { PublicInquiryHeader } from "@/components/public/inquiries/PublicInquiryHeader";
import { RichTextView } from "@/components/RichTextView";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";
import { IconArrowLeft, IconDownload } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : null);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await loadPublicCase((await params).id);
  return { title: c ? `${INQUIRY_KIND_LABEL[c.kind]}${c.number ? ` nr ${c.number}` : ""} - ${c.title}` : "Rejestr interpelacji i zapytań" };
}

/** Karta opublikowanej sprawy: wersja publiczna pism, chronologicznie; trwały adres. */
export default async function PublicInquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await loadPublicCase((await params).id);
  if (!c) notFound();
  const facts: [string, string | null][] = [
    ["Autorzy", c.authors.map((a) => a.name).join(", ")],
    ["Adresaci", c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")).join("; ")],
    ["Data wpływu", fmt(c.receivedAt ?? c.submittedAt)],
    ["Przekazano", c.addressees.filter((a) => a.forwardedAt).map((a) => `${a.name}: ${fmt(a.forwardedAt)}`).join("; ") || null],
    ["Publikacja", fmt(c.publishedAt)],
    ["Status", INQUIRY_STATUS_LABEL[c.status]],
  ];
  return (
    <>
      <PublicInquiryHeader />
      <main className="container-lg py-4" style={{ maxWidth: 860 }}>
        <Link href="/public/interpelacje" className="d-inline-flex align-items-center gap-1 small mb-2"><IconArrowLeft size={14} /> Rejestr</Link>
        <div className="pub-vote-kicker">{INQUIRY_KIND_LABEL[c.kind]}{c.number ? ` nr ${c.number}` : ""}</div>
        <h1 className="pub-vote-title">{c.title}</h1>
        <dl className="pub-facts my-3">
          {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="small text-body-secondary fw-normal">{k}</dt><dd className="mb-0">{v}</dd></div>)}
        </dl>
        <a className="btn btn-sm btn-outline-secondary mb-3" href={`/api/public/inquiries/${c.id}/pdf`}><IconDownload size={14} /> Pobierz PDF sprawy</a>
        <h2 className="h5 mt-2">Korespondencja</h2>
        {c.letters.length === 0 ? <p className="text-body-secondary">Brak opublikowanych pism.</p> : (
          <ol className="list-unstyled d-flex flex-column gap-3">
            {c.letters.map((l, i) => {
              const ad = c.addressees.find((a) => a.id === l.addresseeId);
              const ref = l.refLetterId ? c.letters.findIndex((x) => x.id === l.refLetterId) : -1;
              return (
                <li key={l.id} className="card" id={`pismo-${i + 1}`}>
                  <div className="card-body">
                    <div className="small text-body-secondary">Pismo {i + 1} - {fmt(l.receivedAt ?? l.letterDate) ?? "bez daty"}</div>
                    <h3 className="h6 mb-1">{LETTER_KIND_LABEL[l.kind]}{ad ? ` - ${l.kind === "ANSWER" ? "od" : "do"}: ${ad.name}` : ""}</h3>
                    {l.authorName && l.kind !== "ANSWER" && <div className="small">Autor: {l.authorName}</div>}
                    {ref >= 0 && <div className="small">W odniesieniu do: <a href={`#pismo-${ref + 1}`}>pismo {ref + 1}</a></div>}
                    {l.letterDate && <div className="small">Data pisma: {fmt(l.letterDate)}</div>}
                    <div className="mt-2" style={{ maxWidth: "72ch" }}><RichTextView text={l.body} /></div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      {l.attachments.map((a) => <a key={a.id} className="btn btn-sm btn-outline-secondary" href={`/api/public/inquiries/attachments/${a.id}`}><IconDownload size={14} /> {a.fileName}</a>)}
                      <a className="btn btn-sm btn-link" href={`/api/public/inquiries/${c.id}/pdf?pismo=${l.id}`}>PDF pisma</a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </>
  );
}
