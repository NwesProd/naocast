// Interroge GET /api/episodes/[id] (déjà utilisé ailleurs pour suivre le
// pipeline automatique) jusqu'à ce que le job `jobId` passe à DONE/FAILED.
// Utilisé pour les jobs déclenchés depuis le tunnel/la relecture qui
// n'affectent pas episode.status (cf. MANUAL_TRANSCRIBE, worker/run.ts).
export async function pollJobUntilDone(
  episodeId: string,
  jobId: string,
  intervalMs = 3000
): Promise<{ status: string; errorMessage: string | null }> {
  for (;;) {
    const res = await fetch(`/api/episodes/${episodeId}`);
    if (res.ok) {
      const data = await res.json();
      const job = (data.jobs as { id: string; status: string; errorMessage: string | null }[] | undefined)?.find(
        (j) => j.id === jobId
      );
      if (job && (job.status === "DONE" || job.status === "FAILED")) {
        return job;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
