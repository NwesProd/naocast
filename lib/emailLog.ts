import { prisma } from "@/lib/db";
import type { EmailMessage } from "@/lib/email";
import type { EmailStatus } from "@/app/generated/prisma/client";

export interface EmailLogEntry {
  msg: EmailMessage;
  status: EmailStatus;
  error?: string;
  providerId?: string;
}

// Écrit dans le journal d'emails. Ne doit JAMAIS faire échouer ni retarder
// un envoi : une erreur de journalisation est seulement loggée.
export async function logEmails(entries: EmailLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.emailLog.createMany({
      data: entries.map(({ msg, status, error, providerId }) => ({
        toEmail: msg.to.toLowerCase(),
        kind: msg.kind ?? "other",
        subject: msg.subject.slice(0, 300),
        status,
        error: error ? error.slice(0, 500) : null,
        providerId: providerId ?? null,
      })),
    });
  } catch (err) {
    console.error("[email] écriture du journal d'emails impossible", err);
  }
}
