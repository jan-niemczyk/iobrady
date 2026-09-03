/**
 * Logika głosowania na listę kandydatów (VoteType.LIST).
 *
 * Założenie zgodne z praktyką Sejmu RP (potwierdzone wydrukami):
 *
 *   - Wyborca otrzymuje listę N kandydatów / opcji.
 *   - Może zaznaczyć od `minSelections` do `maxSelections` opcji.
 *   - Zaznaczenie opcji = głos ZA tym kandydatem.
 *   - BRAK zaznaczenia opcji u głosującego = głos PRZECIW temu kandydatowi.
 *   - Nieoddanie ballota w ogóle = nie głosował (NIE GŁOSOWAŁ),
 *     osobny status - nie liczy się ani jako "za", ani jako "przeciw".
 *
 * Próg poparcia (np. większość bezwzględna = floor(głosujących/2) + 1)
 * stosujemy do liczby głosów ZA każdego kandydata.
 */

import type { MajorityKind, MajorityBase } from "@prisma/client";
import { MajorityKind as MK, MajorityBase as MB } from "@prisma/client";

export interface ListVoteOption {
  id: string;
  order: number;
  label: string;
}

export interface ListBallot {
  /** id ballota (niezbędne, ale niewykorzystywane w obliczeniach) */
  id: string;
  /** id użytkownika - null dla głosów tajnych po anonimizacji */
  userId: string | null;
  /** wybrane opcje */
  selectedOptionIds: string[];
}

export interface ListOptionResult {
  optionId: string;
  label: string;
  yesCount: number;     // liczba głosów ZA
  noCount: number;      // liczba głosów PRZECIW (głosujący, którzy nie zaznaczyli)
  passed: boolean;      // czy przekroczył próg poparcia
}

export interface ListVoteResult {
  voterCount: number;          // liczba osób, które oddały ballot
  thresholdForPass: number;    // próg "za" wymagany dla danego trybu
  thresholdLabel: string;
  options: ListOptionResult[]; // posortowane alfabetycznie po etykiecie
}

export function computeListVoteResult(args: {
  options: ListVoteOption[];
  ballots: ListBallot[];
  majorityKind: MajorityKind;
  majorityBase: MajorityBase;
  /** liczba uprawnionych - dla większości od pełnego składu */
  eligibleCount: number;
  /** liczba obecnych z prawem głosu - dla większości od obecnych */
  presentCount: number;
}): ListVoteResult {
  const { options, ballots, majorityKind, majorityBase, eligibleCount, presentCount } = args;
  const voterCount = ballots.length;

  // Mianownik
  const baseValue = majorityBase === MB.OF_VOTERS ? voterCount
    : majorityBase === MB.OF_PRESENT ? presentCount
    : eligibleCount;
  const baseLabel = majorityBase === MB.OF_VOTERS ? "głosujących"
    : majorityBase === MB.OF_PRESENT ? "obecnych"
    : "pełnego składu";

  // wyznacz próg poparcia
  let threshold = 0;
  let thresholdLabel = "";
  switch (majorityKind) {
    case MK.SIMPLE:
      threshold = Math.floor(voterCount / 2) + 1;
      thresholdLabel = "Zwykła (> 1/2 głosujących)";
      break;
    case MK.ABSOLUTE:
      threshold = Math.floor(baseValue / 2) + 1;
      thresholdLabel = `Bezwzględna (> 1/2 ${baseLabel})`;
      break;
    case MK.QUALIFIED_TWO_THIRDS:
      threshold = Math.ceil((2 / 3) * baseValue);
      thresholdLabel = `2/3 ${baseLabel}`;
      break;
    case MK.QUALIFIED_THREE_FIFTHS:
      threshold = Math.ceil((3 / 5) * baseValue);
      thresholdLabel = `3/5 ${baseLabel}`;
      break;
    default:
      threshold = Math.floor(voterCount / 2) + 1;
      thresholdLabel = "Reguła własna";
  }

  // liczymy "za" dla każdej opcji jako liczbę zaznaczeń
  const yesByOption = new Map<string, number>();
  for (const opt of options) yesByOption.set(opt.id, 0);
  for (const b of ballots) {
    for (const optId of b.selectedOptionIds) {
      yesByOption.set(optId, (yesByOption.get(optId) ?? 0) + 1);
    }
  }

  const results: ListOptionResult[] = options
    .map((o) => {
      const yes = yesByOption.get(o.id) ?? 0;
      const no = voterCount - yes;
      return {
        optionId: o.id,
        label: o.label,
        yesCount: yes,
        noCount: no,
        passed: yes >= threshold && voterCount > 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));

  return { voterCount, thresholdForPass: threshold, thresholdLabel, options: results };
}
