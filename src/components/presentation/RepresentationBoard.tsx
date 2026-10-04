"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { boardBackgroundColor } from "@/lib/board";

/**
 * Plansza reprezentacyjna - ekran prezentacji pokazywany na żądanie operatora.
 * Ten sam komponent renderuje podgląd w ustawieniach i właściwą prezentację.
 *
 * Warstwy (od spodu), składane dynamicznie z CSS - bez spłaszczania do jednego obrazka:
 *  1. jednolite tło w kolorze przewodnim (widoczne, gdy brak zdjęcia albo zdjęcie się nie wczyta),
 *  2. zdjęcie: cover (bez rozciągania), odbarwione do skali szarości i lekko przyciemnione,
 *  3. nakładka w kolorze przewodnim z regulowanym kryciem,
 *  4. treść: logo + tekst - filtry i krycie tła ich nie dotyczą.
 * Wymiary liczone jednostkami kontenera (cqh/cqw), więc proporcje są takie same w małym
 * podglądzie i na ekranie 1920 × 1080 / 1280 × 720. Gdy treść się nie mieści (długi tekst,
 * wiele wierszy), cała kompozycja zmniejsza się proporcjonalnie - nic nie jest obcinane.
 */
export interface BoardContent {
  /** Kolor przewodni = kolor nagłówka prezentacji. */
  color: string;
  backgroundUrl: string | null;
  logoUrl: string | null;
  text: string | null;
  /** Krycie nakładki 0-100 (%). */
  overlayOpacity: number;
  fontFamily?: string;
}

/** Maksymalna szerokość logo na planszy w % szerokości ekranu (wzór: 330 px przy 1920 px). */
const LOGO_MAX_W_CQW = 17.2;

export function RepresentationBoard({ color, backgroundUrl, logoUrl, text, overlayOpacity, fontFamily }: BoardContent) {
  const bg = boardBackgroundColor(color);
  const opacity = Math.min(100, Math.max(0, Number.isFinite(overlayOpacity) ? overlayOpacity : 80)) / 100;
  const cleanText = (text ?? "").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");

  // Uszkodzone / niedostępne logo: znika bez ikony błędu i bez zarezerwowanego miejsca.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  // Proporcje logo (szer./wys.) - do ograniczenia jednocześnie wysokości i szerokości bez zniekształceń.
  const [logoRatio, setLogoRatio] = useState<number | null>(null);
  const showLogo = !!logoUrl && failedLogo !== logoUrl;

  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Dopasowanie: zmniejszaj całą kompozycję (zmienna --k), aż zmieści się w polu bezpiecznym.
  const fit = useCallback(() => {
    const box = boxRef.current, content = contentRef.current;
    if (!box || !content) return;
    let k = 1;
    content.style.setProperty("--k", "1");
    for (let i = 0; i < 26; i++) {
      if (content.scrollHeight <= box.clientHeight + 1 && content.scrollWidth <= box.clientWidth + 1) break;
      k = Math.max(0.3, k - 0.04);
      content.style.setProperty("--k", String(k));
      if (k <= 0.3) break;
    }
  }, []);

  useLayoutEffect(() => {
    fit();
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    return () => ro.disconnect();
  }, [fit, cleanText, showLogo, logoUrl, logoRatio]);

  return (
    <div
      aria-label="Plansza reprezentacyjna"
      style={{
        position: "relative", width: "100%", height: "100%", overflow: "hidden",
        containerType: "size", background: bg, fontFamily: fontFamily ?? "inherit",
      }}
    >
      {backgroundUrl && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            // CSS background: niedostępny plik nie pokazuje ikony błędu - zostaje tło w kolorze.
            backgroundImage: `url(${JSON.stringify(backgroundUrl)})`,
            backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
            filter: "grayscale(1) brightness(0.8) contrast(1.05)",
          }}
        />
      )}
      {backgroundUrl && (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: bg, opacity }} />
      )}
      <div
        ref={boxRef}
        style={{
          position: "absolute", inset: "7cqh 7cqw", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          ref={contentRef}
          style={{
            ["--k" as string]: 1,
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "calc(6.5cqh * var(--k))", maxWidth: "100%", maxHeight: "100%",
            color: "#FFFFFF", textAlign: "center",
          }}
        >
          {showLogo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={logoUrl}
              src={logoUrl!}
              alt=""
              onError={() => setFailedLogo(logoUrl)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) setLogoRatio(img.naturalWidth / img.naturalHeight);
                fit();
              }}
              style={{
                // Logo mieści się w polu: wysokość do 22% ekranu, szerokość do 17,2% (wzór: logo
                // 330 px na ekranie 1920 px). Szerokie logo jest zmniejszane proporcjonalnie.
                display: "block", width: "auto", objectFit: "contain", flexShrink: 0,
                height: logoRatio
                  ? `calc(min(22cqh, ${(LOGO_MAX_W_CQW / logoRatio).toFixed(4)}cqw) * var(--k))`
                  : "calc(22cqh * var(--k))",
                maxWidth: `calc(${LOGO_MAX_W_CQW}cqw * var(--k))`,
              }}
            />
          )}
          {cleanText && (
            <div
              style={{
                fontSize: "calc(min(3.1cqh, 2.4cqw) * var(--k))", lineHeight: 1.38, fontWeight: 600,
                letterSpacing: "0.01em", whiteSpace: "pre-line", overflowWrap: "anywhere",
                maxWidth: "72cqw", textShadow: "0 1px 0.6cqh rgba(0,0,0,0.25)",
              }}
            >
              {cleanText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
