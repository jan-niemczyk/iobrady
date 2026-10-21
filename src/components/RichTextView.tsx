import { Fragment, type ReactNode } from "react";
import { parseBlocks, type Block, type Run } from "@/lib/noticeText";

const runs = (rs: Run[]) => rs.map((r, i) => (
  r.bold ? <strong key={i}>{r.text}</strong> : r.italic ? <em key={i}>{r.text}</em> : <Fragment key={i}>{r.text}</Fragment>
));

/**
 * Wyświetlenie tekstu w ograniczonym zapisie (akapity, **pogrubienie**, _kursywa_, listy „- ” i „1. ”)
 * jako zwykłe elementy HTML - bez wstawiania surowego HTML. Kolejne pozycje listy tworzą jedną listę.
 */
export function RichTextView({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (b.type === "p") {
      const empty = b.runs.every((r) => !r.text.trim());
      if (!empty) out.push(<p key={i} style={b.align !== "left" ? { textAlign: b.align } : undefined}>{runs(b.runs)}</p>);
      i++;
      continue;
    }
    const group: Block[] = [];
    let j = i;
    while (j < blocks.length && blocks[j].type === b.type) group.push(blocks[j++]);
    const items = group.map((g, k) => <li key={k}>{runs(g.runs)}</li>);
    out.push(b.type === "ul"
      ? <ul key={i} style={{ listStyleType: "disc", paddingLeft: "1.5em" }}>{items}</ul>
      : <ol key={i} start={group[0].number ?? 1} style={{ listStyleType: "decimal", paddingLeft: "1.8em" }}>{items}</ol>);
    i = j;
  }
  return <div className={className}>{out}</div>;
}
