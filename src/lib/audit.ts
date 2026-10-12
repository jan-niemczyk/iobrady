import { prisma } from "@/lib/db";
import type { AuditAction, Prisma } from "@prisma/client";

/** Wpis dziennika. Z `client` = transakcja (H-05): wpis zapisuje się atomowo razem ze zmianą. */
export async function audit(params: {
  action: AuditAction;
  description: string;
  meetingId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}, client: Prisma.TransactionClient | typeof prisma = prisma) {
  await client.auditLog.create({
    data: {
      action: params.action,
      description: params.description,
      meetingId: params.meetingId,
      userId: params.userId,
      metadata: params.metadata as never,
    },
  });
}
