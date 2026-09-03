import { MajorityKind, MajorityBase, MajorityType } from "@prisma/client";

export interface MajorityInput {
  yes: number;
  no: number;
  abstain: number;
  /** liczba uczestników obecnych z prawem głosu (po snapshocie) */
  presentCount: number;
  /** liczba uprawnionych w ogóle (pełen skład) */
  eligibleCount: number;
}

export interface MajorityResult {
  passed: boolean;
  basis: number;          // mianownik
  threshold: number;      // ile minimum głosów ZA wymaganych
  yesCount: number;
  formulaLabel: string;
}

/**
 * Oblicza wynik głosowania na podstawie typu (Kind) i mianownika (Base).
 *
 * - SIMPLE: zwykła. ZA > PRZECIW, wstrzymania ignorujemy. Base bez wpływu.
 * - ABSOLUTE: bezwzględna. ZA > (PRZECIW + WSTRZYMAŁO). Próg = floor(base/2) + 1.
 * - QUALIFIED_TWO_THIRDS: ZA >= ceil(2/3 * base).
 * - QUALIFIED_THREE_FIFTHS: ZA >= ceil(3/5 * base).
 *
 * Base określa co jest mianownikiem dla bezwzględnej i kwalifikowanych:
 * - OF_VOTERS:    głosujący (oddanych głosów = yes + no + abstain)
 * - OF_PRESENT:   obecnych z prawem głosu (presentCount)
 * - OF_FULL_BODY: wszystkich uprawnionych (eligibleCount)
 */
export function evaluateMajority(
  kind: MajorityKind,
  base: MajorityBase,
  input: MajorityInput,
): MajorityResult {
  const { yes, no, abstain, presentCount, eligibleCount } = input;
  const cast = yes + no + abstain;

  if (kind === MajorityKind.SIMPLE) {
    return {
      passed: yes > no,
      basis: yes + no,
      threshold: no + 1,
      yesCount: yes,
      formulaLabel: "Większość zwykła (ZA > PRZECIW)",
    };
  }

  // Wyznaczanie mianownika dla ABSOLUTE i kwalifikowanych
  const baseValue = base === MajorityBase.OF_VOTERS ? cast
    : base === MajorityBase.OF_PRESENT ? presentCount
    : eligibleCount;
  const baseLabel = base === MajorityBase.OF_VOTERS ? "głosujących"
    : base === MajorityBase.OF_PRESENT ? "obecnych"
    : "pełnego składu";

  if (kind === MajorityKind.ABSOLUTE) {
    const threshold = Math.floor(baseValue / 2) + 1;
    return {
      passed: yes >= threshold && baseValue > 0,
      basis: baseValue,
      threshold,
      yesCount: yes,
      formulaLabel: `Większość bezwzględna (> 1/2 ${baseLabel})`,
    };
  }
  if (kind === MajorityKind.QUALIFIED_TWO_THIRDS) {
    const threshold = Math.ceil((2 / 3) * baseValue);
    return {
      passed: yes >= threshold && baseValue > 0,
      basis: baseValue,
      threshold,
      yesCount: yes,
      formulaLabel: `Większość 2/3 ${baseLabel}`,
    };
  }
  if (kind === MajorityKind.QUALIFIED_THREE_FIFTHS) {
    const threshold = Math.ceil((3 / 5) * baseValue);
    return {
      passed: yes >= threshold && baseValue > 0,
      basis: baseValue,
      threshold,
      yesCount: yes,
      formulaLabel: `Większość 3/5 ${baseLabel}`,
    };
  }

  // Nie powinno się zdarzyć - fallback
  return {
    passed: yes > no,
    basis: yes + no,
    threshold: no + 1,
    yesCount: yes,
    formulaLabel: "Reguła nieznana - fallback zwykła",
  };
}

export const KIND_LABELS: Record<MajorityKind, string> = {
  SIMPLE: "Zwykła (ZA > PRZECIW, wstrzymania nie liczą się)",
  ABSOLUTE: "Bezwzględna (więcej niż połowa głosujących/obecnych)",
  QUALIFIED_TWO_THIRDS: "Kwalifikowana 2/3",
  QUALIFIED_THREE_FIFTHS: "Kwalifikowana 3/5",
};

export const BASE_LABELS: Record<MajorityBase, string> = {
  OF_VOTERS: "Od głosujących",
  OF_PRESENT: "Od obecnych",
  OF_FULL_BODY: "Od pełnego składu",
};

/** Łączne formatowanie do wyświetlania użytkownikowi */
export function formatMajority(kind: MajorityKind, base: MajorityBase): string {
  if (kind === MajorityKind.SIMPLE) return "Zwykła";
  const k = kind === MajorityKind.ABSOLUTE ? "Bezwzględna"
    : kind === MajorityKind.QUALIFIED_TWO_THIRDS ? "2/3"
    : kind === MajorityKind.QUALIFIED_THREE_FIFTHS ? "3/5"
    : "-";
  const b = base === MajorityBase.OF_VOTERS ? "od głosujących"
    : base === MajorityBase.OF_PRESENT ? "od obecnych"
    : "od pełnego składu";
  return `${k} ${b}`;
}

/** Legacy mapping - dla wstecznej kompatybilności */
export const MAJORITY_LABELS: Record<MajorityType, string> = {
  SIMPLE: "Większość zwykła",
  ABSOLUTE: "Większość bezwzględna",
  QUALIFIED_TWO_THIRDS: "Większość 2/3",
  QUALIFIED_THREE_FIFTHS: "Większość 3/5",
  OF_VOTERS: "Od liczby głosujących",
  OF_PRESENT: "Od liczby obecnych",
  OF_FULL_BODY: "Od pełnego składu",
  CUSTOM: "Własna",
};
