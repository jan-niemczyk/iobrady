/** Link do ekranu prezentacji / nakładki OBS z tokenem ekranu (SA-07). Bez zależności serwerowych. */
export function screenUrl(kind: "display" | "overlay", meetingId: string, token: string | null | undefined): string {
  return token ? `/${kind}/${meetingId}?t=${encodeURIComponent(token)}` : `/${kind}/${meetingId}`;
}
