'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * error.tsx — Next.js file-convention error boundary (must be a Client Component).
 *
 * Catches unhandled errors in the dashboard page (e.g. DB connection failures,
 * unexpected data shapes). Shows a friendly message with a retry action instead
 * of crashing the entire page.
 */
export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        // Log the error for observability — replace with your error service in prod
        console.error('[Dashboard Error]', error);
    }, [error]);

    return (
        <div className="flex min-h-[50vh] items-center justify-center px-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader className="items-center pb-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                        <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                    </div>
                    <CardTitle className="mt-4 text-lg">
                        Something went wrong loading your dashboard
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500">
                        We couldn&apos;t load your workspace data. This is usually temporary
                        — try refreshing.
                    </p>
                    <Button onClick={reset} variant="default" size="sm">
                        Try again
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
