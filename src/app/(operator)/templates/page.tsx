import { redirect } from "next/navigation";

/** Dawne „Szablony składu" są teraz grupami organizacyjnymi (skład przeniesiony przy migracji). */
export default function TemplatesPage() {
  redirect("/groups");
}
