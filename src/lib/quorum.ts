import type { Meeting } from "@prisma/client";
import { QuorumRule } from "@prisma/client";

export interface QuorumStatus {
  eligibleCount: number;       // uprawnieni do głosowania w posiedzeniu
  presentCount: number;        // obecni z prawem głosu
  requiredCount: number;       // próg liczby osób
  met: boolean;
  ruleLabel: string;
}

export function evaluateQuorum(
  meeting: Pick<Meeting, "quorumRule" | "quorumValue">,
  eligibleCount: number,
  presentCount: number,
): QuorumStatus {
  let required = 0;
  let label = "";

  switch (meeting.quorumRule) {
    case QuorumRule.MORE_THAN_HALF:
      required = Math.floor(eligibleCount / 2) + 1;
      label = "więcej niż połowa składu";
      break;
    case QuorumRule.AT_LEAST_HALF:
      required = Math.ceil(eligibleCount / 2);
      label = "co najmniej połowa składu";
      break;
    case QuorumRule.PERCENTAGE: {
      const pct = meeting.quorumValue ?? 50;
      required = Math.ceil((pct / 100) * eligibleCount);
      label = `${pct}% składu`;
      break;
    }
    case QuorumRule.COUNT:
      required = Math.floor(meeting.quorumValue ?? 0);
      label = `co najmniej ${required} osób`;
      break;
    case QuorumRule.CUSTOM:
      // rezerwacja na własną regułę - w MVP traktujemy jak więcej niż połowa
      required = Math.floor(eligibleCount / 2) + 1;
      label = "reguła własna";
      break;
  }

  return {
    eligibleCount,
    presentCount,
    requiredCount: required,
    met: presentCount >= required && eligibleCount > 0,
    ruleLabel: label,
  };
}
