'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Category = 'category' | 'comparison' | 'buyer_intent';

interface PromptItem {
    id: string;
    text: string;
    savedText: string;
    category: Category;
    active: boolean;
}

const MAX_PROMPTS = 20;
const CATEGORY_LABEL: Record<Category, string> = {
    category: 'Category',
    comparison: 'Comparison',
    buyer_intent: 'Buyer intent',
};

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    }
    return body.data as T;
}

export function PromptManager({
    initialPrompts,
}: {
    initialPrompts: Array<{ id: string; text: string; category: Category; active: boolean }>;
}) {
    const [prompts, setPrompts] = React.useState<PromptItem[]>(
        initialPrompts.map((p) => ({ ...p, savedText: p.text })),
    );
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [newText, setNewText] = React.useState('');
    const [newCategory, setNewCategory] = React.useState<Category>('buyer_intent');

    const activeCount = prompts.filter((p) => p.active).length;
    const total = prompts.length;

    function patchLocal(id: string, patch: Partial<PromptItem>) {
        setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    }

    async function saveText(item: PromptItem) {
        const text = item.text.trim();
        if (text === item.savedText) return;
        if (text.length === 0) {
            patchLocal(item.id, { text: item.savedText }); // revert empty
            return;
        }
        setError(null);
        try {
            await api(`/api/prompts/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            patchLocal(item.id, { text, savedText: text });
        } catch (e) {
            patchLocal(item.id, { text: item.savedText });
            setError(e instanceof Error ? e.message : 'Could not save prompt.');
        }
    }

    async function toggleActive(item: PromptItem) {
        const next = !item.active;
        if (next && activeCount >= MAX_PROMPTS) {
            setError(`You can have at most ${MAX_PROMPTS} active prompts.`);
            return;
        }
        setError(null);
        patchLocal(item.id, { active: next }); // optimistic
        try {
            await api(`/api/prompts/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: next }),
            });
        } catch (e) {
            patchLocal(item.id, { active: item.active }); // revert
            setError(e instanceof Error ? e.message : 'Could not update prompt.');
        }
    }

    async function remove(item: PromptItem) {
        setError(null);
        try {
            await api(`/api/prompts/${item.id}`, { method: 'DELETE' });
            setPrompts((prev) => prev.filter((p) => p.id !== item.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete prompt.');
        }
    }

    async function addPrompt() {
        const text = newText.trim();
        if (text.length === 0) return;
        if (total >= MAX_PROMPTS) {
            setError(`Prompt limit reached (max ${MAX_PROMPTS}).`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const { prompt } = await api<{ prompt: { id: string; text: string; category: Category; active: boolean } }>(
                '/api/prompts',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, category: newCategory }),
                },
            );
            setPrompts((prev) => [...prev, { ...prompt, savedText: prompt.text }]);
            setNewText('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not add prompt.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Prompts</h2>
                <span className="text-xs text-slate-400">{activeCount} active · {total}/{MAX_PROMPTS} total</span>
            </div>

            {error && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <ul className="mt-4 space-y-2">
                {prompts.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <input
                            type="checkbox"
                            checked={p.active}
                            onChange={() => toggleActive(p)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                            aria-label={p.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                        />
                        <input
                            value={p.text}
                            onChange={(e) => patchLocal(p.id, { text: e.target.value })}
                            onBlur={() => saveText(p)}
                            maxLength={500}
                            className={`flex-1 bg-transparent text-sm focus:outline-none ${p.active ? 'text-slate-900' : 'text-slate-400'}`}
                        />
                        <Badge variant="outline" className="shrink-0">{CATEGORY_LABEL[p.category]}</Badge>
                        <button
                            type="button"
                            onClick={() => remove(p)}
                            className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label="Delete prompt"
                        >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                            </svg>
                        </button>
                    </li>
                ))}
                {prompts.length === 0 && (
                    <li className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                        No prompts yet.
                    </li>
                )}
            </ul>

            {/* Add custom prompt */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addPrompt(); }}
                    placeholder="Add a custom prompt…"
                    maxLength={500}
                    disabled={total >= MAX_PROMPTS}
                    className={inputClass}
                />
                <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as Category)}
                    disabled={total >= MAX_PROMPTS}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    aria-label="Prompt category"
                >
                    <option value="category">Category</option>
                    <option value="comparison">Comparison</option>
                    <option value="buyer_intent">Buyer intent</option>
                </select>
                <Button onClick={addPrompt} disabled={busy || total >= MAX_PROMPTS || newText.trim().length === 0}>
                    {busy ? 'Adding…' : 'Add'}
                </Button>
            </div>
            {total >= MAX_PROMPTS && (
                <p className="mt-2 text-xs text-slate-400">Prompt limit reached ({MAX_PROMPTS}). Delete one to add another.</p>
            )}
        </section>
    );
}
