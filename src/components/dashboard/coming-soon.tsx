import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ComingSoonProps {
    /** Section title, e.g. "Competitors". */
    title: string;
    /** One-line description of what this section will do. */
    description: string;
    /** Icon rendered in the badge. */
    icon: React.ReactNode;
    /** Optional bullet list of what's planned. */
    planned?: string[];
}

/**
 * Friendly placeholder for dashboard sections that aren't built yet.
 *
 * Replaces a hard 404 (which reads as "broken") with a clear "coming soon"
 * state, so every nav link lands somewhere intentional. Always offers a way
 * back to the parts of the product that do work.
 */
export function ComingSoon({ title, description, icon, planned }: ComingSoonProps) {
    return (
        <div className="space-y-8">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    {title}
                </h1>
                <p className="text-sm text-slate-500">{description}</p>
            </header>

            <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    {icon}
                </div>
                <div className="space-y-1">
                    <p className="text-base font-medium text-slate-900">Coming soon</p>
                    <p className="mx-auto max-w-md text-sm text-slate-500">
                        This section is on the roadmap. {description}
                    </p>
                </div>

                {planned && planned.length > 0 && (
                    <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-slate-600">
                        {planned.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-center gap-2 pt-2">
                    <Link href="/dashboard">
                        <Button variant="outline" size="sm">Back to dashboard</Button>
                    </Link>
                    <Link href="/dashboard/prompts">
                        <Button size="sm">Manage prompts</Button>
                    </Link>
                </div>
            </Card>
        </div>
    );
}
