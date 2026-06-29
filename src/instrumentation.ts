// Next.js instrumentation — runs once when the server starts.
// Used here to start the cron worker for self-hosted / local dev deployments.
//
// In production on Vercel, the /api/cron/tick route is invoked externally
// (configured in vercel.json) so the in-process worker is not started
// (vercel sets VERCEL=1 to signal we're on their platform).

export async function register() {
  if (process.env.VERCEL === '1' || process.env.DISABLE_CRON_WORKER === '1') {
    // Vercel Cron drives the schedule via /api/cron/tick — don't double-run.
    return
  }
  // Only start the worker in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCronWorker } = await import('./lib/jobs')
    startCronWorker()
  }
}
