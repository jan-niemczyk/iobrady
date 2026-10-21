/** Etykiety modułu interpelacji i zapytań - bez zależności serwerowych (także w komponentach klienta). */

export const INQUIRY_KIND_LABEL: Record<string, string> = { INTERPELLATION: "Interpelacja", QUESTION: "Zapytanie" };
export const INQUIRY_KIND_GEN: Record<string, string> = { INTERPELLATION: "interpelacji", QUESTION: "zapytania" };

export const INQUIRY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Szkic",
  SUBMITTED: "Złożono",
  REGISTERED: "Zarejestrowano",
  FORWARDED: "Przekazano części adresatów",
  AWAITING: "Oczekiwanie na odpowiedź",
  PARTIAL: "Odpowiedź częściowa",
  ANSWERED: "Otrzymano odpowiedzi",
  CLOSED: "Zakończono",
  WITHDRAWN: "Wycofano",
};

export const LETTER_KIND_LABEL: Record<string, string> = {
  SUBMISSION: "Pismo wnoszące",
  ANSWER: "Odpowiedź",
  SUPPLEMENT: "Uzupełnienie",
  FOLLOWUP: "Ponowienie pytania",
  CORRECTION: "Korekta",
  OTHER: "Inne pismo",
};

/** Rodzaje pism, które może złożyć autor sprawy (z prawem składania). */
export const AUTHOR_LETTER_KINDS = ["SUPPLEMENT", "FOLLOWUP", "CORRECTION"] as const;
/** Rodzaje pism rejestrowanych przez operatora. */
export const OPERATOR_LETTER_KINDS = ["ANSWER", "SUPPLEMENT", "FOLLOWUP", "CORRECTION", "OTHER"] as const;
