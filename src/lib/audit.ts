import { prisma } from "@/lib/db";
import type { AuditAction } from "@prisma/client";

export async function audit(params: {
  action: AuditAction;
  description: string;
  meetingId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      description: params.description,
      meetingId: params.meetingId,
      userId: params.userId,
      metadata: params.metadata as never,
    },
  });
}
