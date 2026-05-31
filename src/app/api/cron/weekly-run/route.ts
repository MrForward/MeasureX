/**
 * Vercel Cron endpoint — triggers weekly scheduled runs for all workspaces.
 *
 * Validates: Requirement 4.1 (weekly scheduled runs via cron)
 *
 * Vercel Cron sends a request with the `authorization` header containing
 * the CRON_SECRET. This endpoint verifies that header before processing.
 *
 * Schedule: Every Monday at 06:00 UTC (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { scheduleWeeklyRuns } from '@/lib/scheduler/weekly-scheduler';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
    // Verify CRON_SECRET header (Vercel sends this for cron jobs)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 },
        );
    }

    // Check kill switch before processing
    const killSwitch = await config.get<boolean>('platform.kill_switch', false);
    if (killSwitch) {
        return NextResponse.json(
            { status: 'paused', message: 'Platform kill switch is active' },
            { status: 200 },
        );
    }

    const result = await scheduleWeeklyRuns();

    return NextResponse.json(
        { status: 'ok', ...result },
        { status: 200 },
    );
}
