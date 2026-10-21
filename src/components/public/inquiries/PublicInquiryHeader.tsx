import Link from "next/link";
import { prisma } from "@/lib/db";

/** Nagłówek publicznego rejestru (nazwa jednostki, logo). */
export async function PublicInquiryHeader() {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true, presentationLogoUrl: true } });
  return (
    <header className="pub-header">
      <div className="container-lg py-3" style={{ maxWidth: 1080 }}>
        <div className="d-flex align-items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s?.presentationLogoUrl && <img src={s.presentationLogoUrl} alt="" className="pub-logo" />}
          <div className="min-w-0">
            {s?.organizationName && <div className="small text-uppercase fw-semibold text-body-secondary" style={{ letterSpacing: ".06em" }}>{s.organizationName}</div>}
            <div className="h4 mb-0"><Link href="/public/interpelacje" className="text-reset text-decoration-none">Rejestr interpelacji i zapytań</Link></div>
          </div>
        </div>
      </div>
    </header>
  );
}
