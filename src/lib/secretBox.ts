import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto";

/**
 * Szyfrowanie wartości wrażliwych przechowywanych w bazie (AES-256-GCM).
 *
 * Klucze:
 *  - APP_ENCRYPTION_KEY       - klucz główny (32 bajty w base64, np. `openssl rand -base64 32`),
 *  - APP_ENCRYPTION_KEYS_OLD  - poprzednie klucze (lista po przecinku) - tylko do odszyfrowania
 *                               przy rotacji (`npm run secrets:rotate` przepisuje dane kluczem głównym),
 *  - gdy APP_ENCRYPTION_KEY nie jest ustawiony, klucz jest wyprowadzany (HKDF) z NEXTAUTH_SECRET.
 *    Działa, ale zmiana NEXTAUTH_SECRET uniemożliwi odszyfrowanie - na produkcji ustaw osobny klucz.
 *
 * Format: `enc:v1:<kid>:<iv>:<tag>:<szyfrogram>` (base64url). `kid` = skrót klucza (nie klucz).
 * `context` (AAD) wiąże szyfrogram z miejscem użycia - przeniesiony w inne miejsce się nie odszyfruje.
 */

type Key = { id: string; key: Buffer };

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 10);
}

function parseKey(b64: string): Buffer {
  const k = Buffer.from(b64.trim(), "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY musi mieć 32 bajty (base64).");
  return k;
}

function derivedKey(): Buffer | null {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!s) return null;
  return Buffer.from(hkdfSync("sha256", s, "iobrady", "app-encryption-v1", 32));
}

function keyRing(): { primary: Key; all: Key[] } {
  const all: Key[] = [];
  const main = process.env.APP_ENCRYPTION_KEY ? parseKey(process.env.APP_ENCRYPTION_KEY) : derivedKey();
  if (!main) throw new Error("Brak klucza szyfrowania (APP_ENCRYPTION_KEY lub NEXTAUTH_SECRET).");
  const primary = { id: keyId(main), key: main };
  all.push(primary);
  for (const old of (process.env.APP_ENCRYPTION_KEYS_OLD ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = parseKey(old);
    all.push({ id: keyId(k), key: k });
  }
  // Klucz wyprowadzony z NEXTAUTH_SECRET zawsze dostępny do odczytu (dane sprzed ustawienia klucza głównego).
  const d = derivedKey();
  if (d && !all.some((k) => k.key.equals(d))) all.push({ id: keyId(d), key: d });
  return { primary, all };
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("enc:v1:");
}

export function encryptSecret(plain: string, context: string): string {
  const { primary } = keyRing();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", primary.key, iv);
  c.setAAD(Buffer.from(context));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["enc", "v1", primary.id, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

/** Odszyfrowuje wartość. Wartości niezaszyfrowane (sprzed migracji) zwraca bez zmian. */
export function decryptSecret(value: string, context: string): string {
  if (!isEncrypted(value)) return value;
  const [, , kid, ivS, tagS, ctS] = value.split(":");
  const k = keyRing().all.find((x) => x.id === kid);
  if (!k) throw new Error(`Brak klucza ${kid} do odszyfrowania (ustaw APP_ENCRYPTION_KEYS_OLD).`);
  const d = createDecipheriv("aes-256-gcm", k.key, Buffer.from(ivS, "base64url"));
  d.setAAD(Buffer.from(context));
  d.setAuthTag(Buffer.from(tagS, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ctS, "base64url")), d.final()]).toString("utf8");
}

/** Czy wartość jest zaszyfrowana kluczem innym niż główny (do rotacji). */
export function needsReencrypt(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!isEncrypted(value)) return true;
  return value.split(":")[2] !== keyRing().primary.id;
}
