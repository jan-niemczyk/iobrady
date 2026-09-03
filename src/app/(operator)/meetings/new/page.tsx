import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { newMeetingId } from "@/lib/ids";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";

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
    <div className="px-6 py-8 max-w-[720px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8">
        <div className="eyebrow mb-2">Nowe posiedzenie</div>
        <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Utwórz posiedzenie</h1>
        <p className="text-sm mt-3" style={{ color: "var(--color-ink-2)" }}>
          Po utworzeniu posiedzenie ma status <span className="mono">PRZYGOTOWANE</span>. Punkty porządku obrad, uczestników i głosowania dodajesz w panelu posiedzenia.
        </p>
      </header>

      <form action={createMeeting} className="card p-8 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="number">Numer posiedzenia</label>
            <input className="input" id="number" name="number" required placeholder="np. II/2026" />
          </div>
          <div>
            <label className="label" htmlFor="meetingType">Typ</label>
            <input className="input" id="meetingType" name="meetingType" placeholder="np. sesja zwyczajna" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="name">Nazwa</label>
          <input className="input" id="name" name="name" required placeholder="np. II sesja Rady Miasta" />
        </div>

        <div>
          <label className="label" htmlFor="scheduledAt">Termin</label>
          <input className="input" type="datetime-local" id="scheduledAt" name="scheduledAt" required />
        </div>

        <div>
          <label className="label" htmlFor="attendanceMode">Tryb listy obecności</label>
          <select className="input" id="attendanceMode" name="attendanceMode" defaultValue={defaultAttMode}>
            <option value="MANUAL">Operator potwierdza ręcznie</option>
            <option value="SELF_CONFIRMATION">Uczestnik potwierdza samodzielnie</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">Opis (opcjonalnie)</label>
          <textarea className="input" id="description" name="description" rows={3} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <a href="/meetings" className="btn">Anuluj</a>
          <button type="submit" className="btn btn-primary">Utwórz posiedzenie</button>
        </div>
      </form>
    </div>
  );
}
