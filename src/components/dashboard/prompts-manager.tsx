'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Archive, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Serializable prompt shape passed from the server page. */
export interface PromptListItem {
    id: string;
    text: string;
    intent: string | null;
    topic: string | null;
    geography: string;
    language: string;
    engines: string[];
    version: number;
    status: string;
    parentPromptId: string | null;
    createdAt: string;
}

interface PromptsManagerProps {
    workspaceId: string;
    initialPrompts: PromptListItem[];
    canEdit: boolean;
}

const ENGINES = [
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'google_ai', label: 'Google AI' },
] as const;

const INTENTS = ['informational', 'navigational', 'commercial', 'transactional'] as const;

const MIN_LEN = 10;
const MAX_LEN = 500;

interface FormState {
    text: string;
    intent: string;
    topic: string;
    engines: string[];
}

const EMPTY_FORM: FormState = {
    text: '',
    intent: 'commercial',
    engines: ['chatgpt'],
    topic: '',
};

export function PromptsManager({ workspaceId, initialPrompts, canEdit }: PromptsManagerProps) {
    const router = useRouter();
    const base = `/api/v1/workspaces/${workspaceId}/prompts`;

    const [showForm, setShowForm] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [busyId, setBusyId] = React.useState<string | null>(null);

    const active = initialPrompts.filter((p) => p.status === 'active');
    const archived = initialPrompts.filter((p) => p.status !== 'active');

    function openCreate() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError(null);
        setShowForm(true);
    }

    function openEdit(p: PromptListItem) {
        setEditingId(p.id);
        setForm({
            text: p.text,
            intent: p.intent ?? 'commercial',
            topic: p.topic ?? '',
            engines: p.engines.length ? p.engines : ['chatgpt'],
        });
        setError(null);
        setShowForm(true);
    }

    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setError(null);
    }

    function toggleEngine(id: string) {
        setForm((f) => ({
            ...f,
            engines: f.engines.includes(id)
                ? f.engines.filter((e) => e !== id)
                : [...f.engines, id],
        }));
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setNotice(null);

        const body = {
            text: form.text.trim(),
            intent: form.intent,
            engines: form.engines,
            ...(form.topic.trim() ? { topic: form.topic.trim() } : {}),
        };

        setSubmitting(true);
        try {
            const res = await fetch(editingId ? `${base}/${editingId}` : base, {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();

            if (!res.ok) {
                setError(json?.error?.message ?? 'Something went wrong.');
                return;
            }

            // Create returns { prompt, warning }; surface a non-blocking warning.
            const warning = json?.data?.warning;
            if (warning?.message) {
                setNotice(warning.message);
            } else {
                setNotice(editingId ? 'Prompt updated.' : 'Prompt created.');
            }

            closeForm();
            router.refresh();
        } catch {
            setError('Network error — please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    async function archive(p: PromptListItem) {
        if (!confirm(`Archive this prompt? It will be excluded from future runs.\n\n"${p.text}"`)) {
            return;
        }
        setBusyId(p.id);
        setNotice(null);
        try {
            const res = await fetch(`${base}/${p.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                setError(json?.error?.message ?? 'Could not archive prompt.');
                return;
            }
            setNotice('Prompt archived.');
            router.refresh();
        } catch {
            setError('Network error — please try again.');
        } finally {
            setBusyId(null);
        }
    }

    const len = form.text.trim().length;
    const lenValid = len >= MIN_LEN && len <= MAX_LEN;
    const canSubmit = lenValid && form.engines.length > 0 && !submitting;

    return (
        <div className="space-y-6">
            {/* Action bar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ''}
                </p>
                {canEdit && !showForm && (
                    <Button onClick={openCreate} size="sm">
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        New prompt
                    </Button>
                )}
            </div>

            {notice && (
                <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden="true" />
                    <span>{notice}</span>
                    <button onClick={() => setNotice(null)} className="ml-auto text-brand-400 hover:text-brand-700" aria-label="Dismiss">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Create / edit form */}
            {showForm && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-900">
                                {editingId ? 'Edit prompt' : 'New prompt'}
                            </h2>
                            <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {error && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {/* Text */}
                        <div>
                            <label htmlFor="prompt-text" className="mb-1 block text-xs font-medium text-slate-700">
                                Prompt text
                            </label>
                            <textarea
                                id="prompt-text"
                                value={form.text}
                                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                                rows={3}
                                placeholder="e.g. What is the best CRM for early-stage startups?"
                                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                            />
                            <p className={cn('mt-1 text-xs', lenValid || len === 0 ? 'text-slate-400' : 'text-red-600')}>
                                {len}/{MAX_LEN} {len > 0 && len < MIN_LEN ? `(min ${MIN_LEN})` : ''}
                            </p>
                        </div>

                        {/* Intent + topic */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="prompt-intent" className="mb-1 block text-xs font-medium text-slate-700">
                                    Intent
                                </label>
                                <select
                                    id="prompt-intent"
                                    value={form.intent}
                                    onChange={(e) => setForm((f) => ({ ...f, intent: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm capitalize text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                                >
                                    {INTENTS.map((i) => (
                                        <option key={i} value={i} className="capitalize">{i}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="prompt-topic" className="mb-1 block text-xs font-medium text-slate-700">
                                    Topic <span className="text-slate-400">(optional)</span>
                                </label>
                                <input
                                    id="prompt-topic"
                                    value={form.topic}
                                    onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                                    placeholder="e.g. CRM comparison"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                                />
                            </div>
                        </div>

                        {/* Engines */}
                        <div>
                            <span className="mb-1.5 block text-xs font-medium text-slate-700">Engines</span>
                            <div className="flex flex-wrap gap-2">
                                {ENGINES.map((eng) => {
                                    const checked = form.engines.includes(eng.id);
                                    return (
                                        <button
                                            type="button"
                                            key={eng.id}
                                            onClick={() => toggleEngine(eng.id)}
                                            aria-pressed={checked}
                                            className={cn(
                                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                                checked
                                                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                                            )}
                                        >
                                            {eng.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <Button type="submit" size="sm" disabled={!canSubmit}>
                                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create prompt'}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Active prompts */}
            {active.length === 0 && !showForm ? (
                <Card className="p-8 text-center">
                    <p className="text-sm text-slate-500">
                        No active prompts yet.{canEdit ? ' Create one to start monitoring your brand.' : ''}
                    </p>
                </Card>
            ) : (
                <ul className="space-y-3">
                    {active.map((p) => (
                        <PromptRow
                            key={p.id}
                            prompt={p}
                            canEdit={canEdit}
                            busy={busyId === p.id}
                            onEdit={() => openEdit(p)}
                            onArchive={() => archive(p)}
                        />
                    ))}
                </ul>
            )}

            {/* Archived (collapsed) */}
            {archived.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-500 hover:text-slate-700">
                        <span className="select-none">Archived ({archived.length})</span>
                    </summary>
                    <ul className="mt-3 space-y-3">
                        {archived.map((p) => (
                            <PromptRow key={p.id} prompt={p} canEdit={false} busy={false} />
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}

interface PromptRowProps {
    prompt: PromptListItem;
    canEdit: boolean;
    busy: boolean;
    onEdit?: () => void;
    onArchive?: () => void;
}

function PromptRow({ prompt, canEdit, busy, onEdit, onArchive }: PromptRowProps) {
    const archived = prompt.status !== 'active';
    return (
        <li>
            <Card className={cn('flex items-start gap-4 p-4', archived && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{prompt.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {prompt.intent && (
                            <Badge variant="brand" className="capitalize">{prompt.intent}</Badge>
                        )}
                        {prompt.engines.map((e) => (
                            <Badge key={e} variant="outline">{engineLabel(e)}</Badge>
                        ))}
                        {prompt.version > 1 && <Badge variant="default">v{prompt.version}</Badge>}
                        {archived && <Badge variant="default">archived</Badge>}
                    </div>
                </div>
                {canEdit && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit prompt" className="h-8 w-8">
                            <Pencil className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onArchive}
                            disabled={busy}
                            aria-label="Archive prompt"
                            className="h-8 w-8"
                        >
                            <Archive className="h-4 w-4 text-slate-500" />
                        </Button>
                    </div>
                )}
            </Card>
        </li>
    );
}

function engineLabel(id: string): string {
    return ENGINES.find((e) => e.id === id)?.label ?? id;
}
