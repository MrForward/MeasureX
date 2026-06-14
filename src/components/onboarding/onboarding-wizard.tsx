'use client';

/**
 * Onboarding wizard (PRD §F3) — 4 steps:
 *   1. Brand name + domain
 *   2. Competitor 1 (name + domain)
 *   3. Competitor 2 (name + domain, skippable)
 *   4. Generate 25 prompts via Claude → review / edit / toggle / select 10-20 →
 *      confirm → POST /api/brand/onboard (creates brand + triggers first scan) →
 *      redirect to the dashboard.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Category = 'category' | 'comparison' | 'buyer_intent';

interface EditablePrompt {
    text: string;
    category: Category;
    active: boolean;
}

const MIN_PROMPTS = 10;
const MAX_PROMPTS = 20;

const CATEGORY_LABEL: Record<Category, string> = {
    category: 'Category',
    comparison: 'Comparison',
    buyer_intent: 'Buyer intent',
};

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition';

/** Read the `{ data, error }` envelope, throwing the error message on failure. */
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    }
    return body.data as T;
}

export function OnboardingWizard() {
    const router = useRouter();
    const [step, setStep] = React.useState(1);

    const [brandName, setBrandName] = React.useState('');
    const [domain, setDomain] = React.useState('');
    const [c1Name, setC1Name] = React.useState('');
    const [c1Domain, setC1Domain] = React.useState('');
    const [c2Name, setC2Name] = React.useState('');
    const [c2Domain, setC2Domain] = React.useState('');
    const [c2Skipped, setC2Skipped] = React.useState(false);

    const [prompts, setPrompts] = React.useState<EditablePrompt[]>([]);
    const [generating, setGenerating] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const step1Valid = brandName.trim() && domain.trim();
    const step2Valid = c1Name.trim() && c1Domain.trim();
    const step3Valid = c2Skipped || (c2Name.trim() && c2Domain.trim());

    const activePrompts = prompts.filter((p) => p.active && p.text.trim());
    const selectedCount = activePrompts.length;
    const canConfirm =
        selectedCount >= MIN_PROMPTS && selectedCount <= MAX_PROMPTS && !submitting;

    async function generatePrompts() {
        setGenerating(true);
        setError(null);
        try {
            const data = await apiFetch<{ prompts: { text: string; category: Category }[] }>(
                '/api/prompts/generate',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        brandName: brandName.trim(),
                        domain: domain.trim(),
                        competitor1: c1Name.trim(),
                        competitor2: c2Skipped ? undefined : c2Name.trim() || undefined,
                    }),
                },
            );
            // Default-select the first MAX_PROMPTS so the user is at/over the minimum.
            setPrompts(
                data.prompts.map((p, i) => ({ ...p, active: i < MAX_PROMPTS })),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not generate prompts.');
        } finally {
            setGenerating(false);
        }
    }

    function goToStep4() {
        setStep(4);
        if (prompts.length === 0) {
            void generatePrompts();
        }
    }

    async function confirm() {
        setSubmitting(true);
        setError(null);
        try {
            const competitors = [{ name: c1Name.trim(), domain: c1Domain.trim() }];
            if (!c2Skipped && c2Name.trim() && c2Domain.trim()) {
                competitors.push({ name: c2Name.trim(), domain: c2Domain.trim() });
            }
            await apiFetch('/api/brand/onboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brand: { name: brandName.trim(), domain: domain.trim() },
                    competitors,
                    prompts: activePrompts.map((p) => ({ text: p.text.trim(), category: p.category })),
                }),
            });
            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not complete setup.');
            setSubmitting(false);
        }
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-brand-gradient" aria-hidden="true" />
            <div className="px-6 py-6 sm:px-8 sm:py-8">
                <StepIndicator step={step} />

                {error && (
                    <div role="alert" className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {step === 1 && (
                    <Section title="Your brand" subtitle="Tell us which brand to monitor across AI answer engines.">
                        <Field label="Brand name">
                            <input className={inputClass} value={brandName} maxLength={100}
                                onChange={(e) => setBrandName(e.target.value)} placeholder="MeasureX" autoFocus />
                        </Field>
                        <Field label="Domain">
                            <input className={inputClass} value={domain} maxLength={255}
                                onChange={(e) => setDomain(e.target.value)} placeholder="measurex.io" />
                        </Field>
                        <Nav>
                            <span />
                            <Button onClick={() => setStep(2)} disabled={!step1Valid}>Continue</Button>
                        </Nav>
                    </Section>
                )}

                {step === 2 && (
                    <Section title="Competitor 1" subtitle="Add a competitor to compare your visibility against.">
                        <Field label="Competitor name">
                            <input className={inputClass} value={c1Name} maxLength={100}
                                onChange={(e) => setC1Name(e.target.value)} placeholder="Otterly" autoFocus />
                        </Field>
                        <Field label="Domain">
                            <input className={inputClass} value={c1Domain} maxLength={255}
                                onChange={(e) => setC1Domain(e.target.value)} placeholder="otterly.ai" />
                        </Field>
                        <Nav>
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={() => setStep(3)} disabled={!step2Valid}>Continue</Button>
                        </Nav>
                    </Section>
                )}

                {step === 3 && (
                    <Section title="Competitor 2" subtitle="Add a second competitor, or skip if you only track one.">
                        <Field label="Competitor name">
                            <input className={inputClass} value={c2Name} maxLength={100} disabled={c2Skipped}
                                onChange={(e) => setC2Name(e.target.value)} placeholder="Peec" autoFocus />
                        </Field>
                        <Field label="Domain">
                            <input className={inputClass} value={c2Domain} maxLength={255} disabled={c2Skipped}
                                onChange={(e) => setC2Domain(e.target.value)} placeholder="peec.ai" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={c2Skipped} onChange={(e) => setC2Skipped(e.target.checked)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                            I only want to track one competitor
                        </label>
                        <Nav>
                            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                            <Button onClick={goToStep4} disabled={!step3Valid}>Generate prompts</Button>
                        </Nav>
                    </Section>
                )}

                {step === 4 && (
                    <Section title="Review your prompts" subtitle="Pick 10-20 prompts to monitor. Edit any of them inline.">
                        {generating ? (
                            <div className="py-10 text-center text-sm text-slate-500">
                                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
                                Generating prompts…
                            </div>
                        ) : prompts.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="mb-4 text-sm text-slate-500">We couldn&apos;t generate prompts.</p>
                                <Button variant="outline" onClick={generatePrompts}>Try again</Button>
                            </div>
                        ) : (
                            <>
                                <PromptList prompts={prompts} setPrompts={setPrompts} />
                                <div className="mt-2 flex items-center justify-between">
                                    <button type="button" onClick={() =>
                                        setPrompts((p) => [...p, { text: '', category: 'category', active: true }])}
                                        className="text-sm font-medium text-brand-600 hover:underline">
                                        + Add custom prompt
                                    </button>
                                    <span className={`text-sm ${selectedCount >= MIN_PROMPTS && selectedCount <= MAX_PROMPTS ? 'text-slate-500' : 'text-red-600'}`}>
                                        {selectedCount} of {MAX_PROMPTS} selected (min {MIN_PROMPTS})
                                    </span>
                                </div>
                                <Nav>
                                    <Button variant="ghost" onClick={() => setStep(3)} disabled={submitting}>Back</Button>
                                    <Button onClick={confirm} disabled={!canConfirm} aria-busy={submitting}>
                                        {submitting ? 'Starting scan…' : 'Confirm & run first scan'}
                                    </Button>
                                </Nav>
                            </>
                        )}
                    </Section>
                )}
            </div>
        </div>
    );
}

function PromptList({
    prompts,
    setPrompts,
}: {
    prompts: EditablePrompt[];
    setPrompts: React.Dispatch<React.SetStateAction<EditablePrompt[]>>;
}) {
    const update = (i: number, patch: Partial<EditablePrompt>) =>
        setPrompts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

    return (
        <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {prompts.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <input type="checkbox" checked={p.active} onChange={(e) => update(i, { active: e.target.checked })}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                    <input value={p.text} onChange={(e) => update(i, { text: e.target.value })}
                        placeholder="Enter a prompt…"
                        className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
                    <Badge variant="default" className="shrink-0">{CATEGORY_LABEL[p.category]}</Badge>
                </li>
            ))}
        </ul>
    );
}

function StepIndicator({ step }: { step: number }) {
    const labels = ['Brand', 'Competitor 1', 'Competitor 2', 'Prompts'];
    return (
        <ol className="mb-6 flex items-center gap-2">
            {labels.map((label, i) => {
                const n = i + 1;
                const state = n < step ? 'done' : n === step ? 'active' : 'todo';
                return (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            state === 'active' ? 'bg-brand-gradient text-white'
                                : state === 'done' ? 'bg-brand-100 text-brand-700'
                                : 'bg-slate-100 text-slate-400'}`}>
                            {n}
                        </span>
                        <span className={`hidden text-xs sm:block ${state === 'todo' ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
                        {n < labels.length && <span className="h-px flex-1 bg-slate-200" />}
                    </li>
                );
            })}
        </ol>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 mb-5 text-sm text-slate-500">{subtitle}</p>
            <div className="space-y-4">{children}</div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
            {children}
        </div>
    );
}

function Nav({ children }: { children: React.ReactNode }) {
    return <div className="mt-6 flex items-center justify-between">{children}</div>;
}
