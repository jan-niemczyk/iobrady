import { newDisplayToken } from "@/lib/displayAccess";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { newMeetingId } from "@/lib/ids";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { PageContainer, PageHeader } from "@/components/operator/ui";

export const dynamic = "force-dynamic";

async function createMeeting(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") redirect("/login");

  const number = String(formData.get("number") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const meetingType = String(formData.get("meetingType") ?? "").trim() || null;
  const scheduledAt = new Date(String(formData.get("scheduledAt")));
  const attendanceMode = (String(formData.get("attendanceMode")) === "SELF_CONFIRMATION" ? "SELF_CONFIRMATION" : "MANUAL") as "MANUAL" | "SELF_CONFIRMATION";
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!number || !name || isNaN(scheduledAt.getTime())) {
    throw new Error("Niepełne dane");
  }

  // Domyślne ustawienia z ustawień globalnych przenoszone na nowe posiedzenie (m.in. reguła kworum).
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  const m = await prisma.meeting.create({
    data: {
      id: newMeetingId(),
      displayToken: newDisplayToken(),
      number, name, description, meetingType, scheduledAt, attendanceMode, status: "PREPARED",
      quorumRule: settings?.defaultQuorumRule ?? undefined,
      quorumValue: settings?.defaultQuorumValue ?? undefined,
      // Domyślne dla prezentacji głosowań z ustawień globalnych (operator może zmienić per posiedzenie).
      displayShowCastCount: settings?.defaultShowCastCount ?? true,
      displayShowByName: settings?.defaultShowByName ?? true,
      displayShowIndividualVotes: settings?.defaultShowIndividualVotes ?? true,
    },
  });

  await audit({ action: "MEETING_CREATED", description: `Utworzono posiedzenie ${number} - ${name}`, meetingId: m.id, userId: session.user.id });

  redirect(`/meetings/${m.id}`);
}

export default async function NewMeetingPage() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") redirect("/login");

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const defaultAttMode = settings?.defaultAttendanceMode === "SELF_CONFIRMATION" ? "SELF_CONFIRMATION" : "MANUAL";

  return (
    <PageContainer size="sm">
      <PageHeader
        kicker="Posiedzenia"
        title="Nowe posiedzenie"
        description="Po utworzeniu posiedzenie ma status „Przygotowane”. Punkty porządku obrad, uczestników i głosowania dodajesz w panelu posiedzenia."
      />

      <form action={createMeeting} className="card">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="number">Numer posiedzenia</label>
              <input className="form-control" id="number" name="number" required placeholder="np. II/2026" />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="meetingType">Typ</label>
              <input className="form-control" id="meetingType" name="meetingType" placeholder="np. sesja zwyczajna" />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="name">Nazwa</label>
              <input className="form-control" id="name" name="name" required placeholder="np. II sesja Rady Miasta" />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="scheduledAt">Termin</label>
              <input className="form-control" type="datetime-local" id="scheduledAt" name="scheduledAt" required />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="attendanceMode">Tryb listy obecności</label>
              <select className="form-select" id="attendanceMode" name="attendanceMode" defaultValue={defaultAttMode}>
                <option value="MANUAL">Operator potwierdza ręcznie</option>
                <option value="SELF_CONFIRMATION">Uczestnik potwierdza samodzielnie</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="description">Opis <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label>
              <textarea className="form-control" id="description" name="description" rows={3} />
            </div>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-end gap-2">
          <a href="/meetings" className="btn">Anuluj</a>
          <button type="submit" className="btn btn-primary">Utwórz posiedzenie</button>
        </div>
      </form>
    </PageContainer>
  );
}
