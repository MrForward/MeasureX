'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, X, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { suggestPrompts, type SuggestedPrompt } from '@/lib/prompts/suggestions';

interface OnboardingWizardProps {
    workspaceId: string;
    /** Pre-fill the brand name from the workspace name. */
    defaultBrandName?: string;
}

const STEPS = ['Brand', 'Competitors', 'Prompts', 'Launch'] as const;
const ALL_ENGINES = ['chatgpt', 'perplexity', 'google_ai'];

const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200';

interface CompetitorDraft {
    name: string;
    domain: string;
}

export function OnboardingWizard({ workspaceId, defaultBrandName }: OnboardingWizardProps) {
    const router = useRouter();
    const base = `/api/v1/workspaces/${workspaceId}`;

    const [step, setStep] = React.useState(0);
    const [brandName, setBrandName] = React.useState(defaultBrandName ?? '');
    const [domain, setDomain] = React.useState('');
    const [competitors, setCompetitors] = React.useState<CompetitorDraft[]>([]);
    const [suggestions, setSuggestions] = React.useState<SuggestedPrompt[]>([]);
    const [selected, setSelected] = React.useState<Set<number>>(new Set());
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [progress, setProgress] = React.useState<string | null>(null);

    // Refresh suggestions when entering the Prompts step.
    React.useEffect(() => {
        if (step === 2 && suggestions.length === 0) {
            const s = suggestPrompts(brandName);
            setSuggestions(s);
            setSelected(new Set(s.map((_, i) => i)));
        }
    }, [step, brandName, suggestions.length]);

    const domainValid = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim().replace(/^https?:\/\//i, ''));
    const canLeaveBrand = brandName.trim().length > 0 && domainValid;

    function addCompetitor() {
        if (competitors.length < 5) setCompetitors((c) => [...c, { name: '', domain: '' }]);
    }
    function updateCompetitor(i: number, field: keyof CompetitorDraft, value: string) {
        setCompetitors((c) => c.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
    }
    function removeCompetitor(i: number) {
        setCompetitors((c) => c.filter((_, idx) => idx !== i));
    }
    function toggleSuggestion(i: number) {
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    }

    async function post(path: string, body: unknown): Promise<boolean> {
        const res = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const json = await res.json().catch(() => null);
            setError(json?.error?.message ?? `Request to ${path} failed.`);
            return false;
        }
        return true;
    }

    async function launch() {
        setBusy(true);
        setError(null);
        try {
            setProgress('Saving your brand…');
            if (!(await post('/brand', { brandName: brandName.trim(), domain: domain.trim(), aliases: [] }))) return;

            const validCompetitors = competitors.filter((c) => c.name.trim() && c.domain.trim());
            for (const c of validCompetitors) {
                setProgress(`Adding competitor ${c.name}…`);
                if (!(await post('/competitors', { name: c.name.trim(), domain: c.domain.trim(), aliases: [] }))) return;
            }

            const chosen = suggestions.filter((_, i) => selected.has(i));
            for (const p of chosen) {
                setProgress(`Adding prompt "${p.text.slice(0, 30)}…"`);
                if (!(await post('/prompts', { text: p.text, intent: p.intent, engines: ALL_ENGINES }))) return;
            }

            setProgress('Starting your first scan…');
            await post('/runs', {}); // baseline run; ignore cooldown errors on re-onboard

            setProgress('All set! Taking you to your dashboard…');
            router.push(`/dashboard?workspace=${workspaceId}`);
            router.refresh();
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Stepper */}
            <ol className="flex items-center gap-2">
                {STEPS.map((label, i) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            className={cn(
                                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                i < step ? 'bg-brand-gradient text-white' : i === step ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400',
                            )}
                        >
                            {i < step ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                        <span className={cn('text-xs font-medium', i === step ? 'text-slate-900' : 'text-slate-400')}>
                            {label}
                        </span>
                        {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-100" />}
                    </li>
                ))}
            </ol>

            <Card className="space-y-5 p-6">
                {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Step 1: Brand */}
                {step === 0 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Tell us about your brand</h2>
                            <p className="mt-0.5 text-sm text-slate-500">We&apos;ll track how it appears in AI answers.</p>
                        </div>
                        <div>
                            <label htmlFor="ob-name" className="mb-1 block text-xs font-medium text-slate-700">Brand name</label>
                            <input id="ob-name" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. HubSpot" className={inputClass} />
                        </div>
                        <div>
                            <label htmlFor="ob-domain" className="mb-1 block text-xs font-medium text-slate-700">Primary domain</label>
                            <input id="ob-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. hubspot.com" className={inputClass} />
                            {domain && !domainValid && <p className="mt-1 text-xs text-red-600">Enter a valid domain (e.g. hubspot.com).</p>}
                        </div>
                    </div>
                )}

                {/* Step 2: Competitors */}
                {step === 1 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Add competitors <span className="font-normal text-slate-400">(optional)</span></h2>
                            <p className="mt-0.5 text-sm text-slate-500">Compare your visibility against up to 5 competitors. You can add these later.</p>
                        </div>
                        <div className="space-y-2">
                            {competitors.map((c, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input value={c.name} onChange={(e) => updateCompetitor(i, 'name', e.target.value)} placeholder="Name" className={cn(inputClass, 'flex-1')} />
                                    <input value={c.domain} onChange={(e) => updateCompetitor(i, 'domain', e.target.value)} placeholder="domain.com" className={cn(inputClass, 'flex-1')} />
                                    <button onClick={() => removeCompetitor(i)} className="text-slate-400 hover:text-slate-700" aria-label="Remove">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {competitors.length < 5 && (
                            <Button variant="outline" size="sm" onClick={addCompetitor}>
                                <Plus className="mr-1 h-4 w-4" /> Add competitor
                            </Button>
                        )}
                    </div>
                )}

                {/* Step 3: Prompts */}
                {step === 2 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Pick prompts to monitor</h2>
                            <p className="mt-0.5 text-sm text-slate-500">Suggested for {brandName.trim() || 'your brand'} — uncheck any you don&apos;t want.</p>
                        </div>
                        <ul className="space-y-2">
                            {suggestions.map((s, i) => (
                                <li key={i}>
                                    <button
                                        onClick={() => toggleSuggestion(i)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                                            selected.has(i) ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                                        )}
                                    >
                                        <span className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', selected.has(i) ? 'border-brand-500 bg-brand-gradient text-white' : 'border-slate-300')}>
                                            {selected.has(i) && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="flex-1 text-sm text-slate-800">{s.text}</span>
                                        <Badge variant="outline" className="capitalize">{s.intent}</Badge>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Step 4: Launch */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Ready to launch</h2>
                            <p className="mt-0.5 text-sm text-slate-500">We&apos;ll save your setup and run your first scan.</p>
                        </div>
                        <ul className="space-y-1.5 text-sm text-slate-600">
                            <li>• Brand: <span className="font-medium text-slate-900">{brandName.trim()}</span> ({domain.trim()})</li>
                            <li>• Competitors: <span className="font-medium text-slate-900">{competitors.filter((c) => c.name.trim()).length}</span></li>
                            <li>• Prompts: <span className="font-medium text-slate-900">{selected.size}</span> across ChatGPT, Perplexity, Google AI</li>
                        </ul>
                        {progress && (
                            <div className="flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                                <Loader2 className="h-4 w-4 animate-spin" /> {progress}
                            </div>
                        )}
                    </div>
                )}

                {/* Nav */}
                <div className="flex items-center justify-between pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
                        <ArrowLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={(step === 0 && !canLeaveBrand) || (step === 2 && selected.size === 0)}>
                            Next <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button size="sm" onClick={launch} disabled={busy}>
                            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            {busy ? 'Setting up…' : 'Launch MeasureX'}
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
}
