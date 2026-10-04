import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const forced = session.user.mustChangePassword;

  return (
    <div className="container-fluid px-3 py-4 py-sm-5" style={{ maxWidth: 480 }}>
      <div className="card">
        <div className="card-body p-4">
          <div className="page-kicker small text-body-secondary fw-medium mb-1">Konto</div>
          <h1 className="h4 mb-1">Zmiana hasła</h1>
          <p className="small text-body-secondary mb-4" style={{ overflowWrap: "anywhere" }}>
            Zalogowano jako {session.user.email}
          </p>
          {forced && (
            <div className="alert alert-warning small py-2" role="alert">
              Hasło startowe trzeba zmienić przed dalszą pracą: wpisz je jako obecne hasło i ustaw własne. Do czasu zmiany pozostałe funkcje są niedostępne.
            </div>
          )}
          <ChangePasswordForm redirectAfter={forced ? "/" : undefined} />
        </div>
        {!forced && (
          <div className="card-footer">
            <a href="/" className="btn btn-sm">← Powrót</a>
          </div>
        )}
      </div>
    </div>
  );
}
