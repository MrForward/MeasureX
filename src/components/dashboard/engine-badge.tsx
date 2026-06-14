import { cn } from '@/lib/utils';

const ENGINES: Record<string, { label: string; dot: string }> = {
    chatgpt: { label: 'ChatGPT', dot: 'bg-emerald-500' },
    perplexity: { label: 'Perplexity', dot: 'bg-teal-500' },
};

/** Small engine indicator — colored dot + name (PRD §F7 "Engine" column). */
export function EngineBadge({ engine, className }: { engine: string; className?: string }) {
    const e = ENGINES[engine] ?? { label: engine, dot: 'bg-slate-400' };
    return (
        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-600', className)}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', e.dot)} aria-hidden="true" />
            {e.label}
        </span>
    );
}
