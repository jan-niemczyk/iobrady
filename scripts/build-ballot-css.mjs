// Kompiluje src/styles/ballot-bootstrap.scss i zawęża wszystkie reguły do .bs-ballot
// (karty do głosowania w panelu radnego). :root, html i body -> sam kontener .bs-ballot.
import { writeFileSync } from "node:fs";
import * as sass from "sass";
import postcss from "postcss";

const SRC = "src/styles/ballot-bootstrap.scss";
const OUT = "src/app/ballot-bootstrap.css";
const SCOPE = ".bs-ballot";

/** Podział listy selektorów po przecinkach poza nawiasami (np. :is(a, b)). */
function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function scope(sel) {
  if (/^(:root|html|body)\b/.test(sel)) return sel.replace(/^(:root|html|body)/, SCOPE);
  return `${SCOPE} ${sel}`;
}

const css = sass.compile(SRC, { loadPaths: ["node_modules"], style: "compressed", silenceDeprecations: ["import", "global-builtin", "color-functions"], quietDeps: true }).css;
const root = postcss.parse(css);
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  rule.selector = splitSelectors(rule.selector).map(scope).join(",");
});
writeFileSync(OUT, root.toString());
console.log(`${OUT}: ${root.toString().length} B`);
