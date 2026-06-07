'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlayCircle, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RunScanButtonProps {
    workspaceId: string;
    /** Owners only — viewers can't trigger runs (the API enforces this too). */
    canRun: boolean;
}

type Status = 'idle' | 'running' | 'done' | 'error';

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_TRIES = 20; // ~50s ceiling (throttled local pipeline can be slower)

/**
 * Triggers a manual run and reflects its progress.
 *
 * Flow: POST /runs → poll GET /runs for the new run's terminal status →
 * refresh the dashboard so freshly-computed metrics appear. Surfaces the
 * 24h-cooldown rule (HTTP 429) and the "no active prompts" case as friendly
 * inline messages rather than silent failures.
 */
export function RunScanButton({ workspaceId, canRun }: RunScanButtonProps) {
    const router = useRouter();
    const base = `/api/v1/workspaces/${workspaceId}/runs`;
    const [status, setStatus] = React.useState<Status>('idle');
    const [message, setMessage] = React.useState<string | null>(null);

    async function pollUntilDone(runId: string): Promise<void> {
        for (let i = 0; i < POLL_MAX_TRIES; i++) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            try {
                const res = await fetch(base, { cache: 'no-store' });
                const json = await res.json();
                const run = (json?.data ?? []).find((r: { id: string }) => r.id === runId);
                if (run && ['completed', 'partial', 'failed'].includes(run.status)) {
                    router.refresh();
                    setStatus('done');
                    setMessage(
                        run.status === 'failed'
                            ? 'Scan finished with errors — see results below.'
                            : 'Scan complete — dashboard updated.',
                    );
                    return;
                }
            } catch {
                // transient — keep polling
            }
        }
        // Timed out waiting; refresh anyway in case metrics landed.
        router.refresh();
        setStatus('done');
        setMessage('Scan is taking longer than usual — refresh in a moment.');
    }

    async function run() {
        setStatus('running');
        setMessage('Scan started — querying AI engines…');
        try {
            const res = await fetch(base, { method: 'POST' });
            const json = await res.json().catch(() => null);

            if (!res.ok) {
                setStatus('error');
                if (res.status === 429) {
                    setMessage(json?.error?.message ?? 'A scan was already run in the last 24 hours.');
                } else if (res.status === 400) {
                    setMessage('Add at least one active prompt before running a scan.');
                } else {
                    setMessage(json?.error?.message ?? 'Could not start the scan.');
                }
                return;
            }

            const runId = json?.data?.runId;
            if (runId) {
                await pollUntilDone(runId);
            } else {
                router.refresh();
                setStatus('done');
                setMessage('Scan started.');
            }
        } catch {
            setStatus('error');
            setMessage('Network error — please try again.');
        }
    }

    if (!canRun) return null;

    const running = status === 'running';

    return (
        <div className="flex flex-col items-end gap-1.5">
            <Button onClick={run} disabled={running} size="default">
                {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {running ? 'Running…' : 'Run scan'}
            </Button>
            {message && (
                <p
                    className={cn(
                        'flex items-center gap-1 text-xs',
                        status === 'error' ? 'text-red-600' : status === 'done' ? 'text-green-700' : 'text-slate-500',
                    )}
                >
                    {status === 'done' && <Check className="h-3 w-3" aria-hidden="true" />}
                    {status === 'error' && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
                    {message}
                </p>
            )}
        </div>
    );
}
