import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare, Users, FileSearch, Check } from 'lucide-react';
import { CheckoutButton } from '@/components/marketing/checkout-button';

export const metadata: Metadata = {
    title: 'MeasureX — See how AI search talks about your brand',
    description:
        'Track your brand across ChatGPT and Perplexity, compare against competitors, and see every raw AI answer as proof. $9/month.',
    openGraph: {
        title: 'MeasureX — AI search visibility for your brand',
        description:
            'Track your brand across ChatGPT and Perplexity, compare against competitors, and see every raw AI answer as proof.',
        type: 'website',
        siteName: 'MeasureX',
    },
    twitter: { card: 'summary_large_image' },
};

const VALUE_PROPS = [
    {
        icon: MessageSquare,
        title: 'Track your brand across ChatGPT and Perplexity',
        body: 'Every week, buyers ask AI engines which tools to use. MeasureX runs your prompts across ChatGPT and Perplexity and shows whether your brand shows up — and how prominently.',
    },
    {
        icon: Users,
        title: 'See exactly where competitors beat you',
        body: 'Side-by-side scoring against the competitors you choose. Find the prompts where they get recommended and you get left out — the gaps worth closing first.',
    },
    {
        icon: FileSearch,
        title: 'Evidence-backed — view every raw AI response',
        body: 'No black-box scores. Click any prompt to read the exact answer, with your brand, competitors, and citations highlighted. Every number traces back to a real response.',
    },
];

const STEPS = [
    { n: 1, title: 'Add your brand & competitors', body: 'Two minutes. Your domain plus up to two competitors.' },
    { n: 2, title: 'We scan ChatGPT & Perplexity', body: 'We generate buyer-intent prompts and run them across both engines.' },
    { n: 3, title: 'See your score & the proof', body: 'A 0–100 visibility score, a prompt-by-prompt breakdown, and every raw answer.' },
];

const PRICING_FEATURES = [
    'ChatGPT + Perplexity coverage',
    'Up to 20 monitored prompts',
    'Two tracked competitors',
    'Raw answers with highlighted evidence',
    'Run a fresh scan whenever you want',
];

export default function Home() {
    return (
        <main className="min-h-screen bg-white text-slate-900">
            {/* Nav */}
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-gradient" aria-hidden="true" />
                    <span className="text-xl font-bold">MeasureX</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                    <Link href="#how-it-works" className="hidden text-slate-600 hover:text-slate-900 sm:block">How it works</Link>
                    <Link href="#pricing" className="hidden text-slate-600 hover:text-slate-900 sm:block">Pricing</Link>
                    <Link href="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link>
                    <CheckoutButton className="rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white transition hover:opacity-90">
                        Get started
                    </CheckoutButton>
                </div>
            </nav>

            {/* Hero */}
            <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center sm:pt-28">
                <div className="mb-6 inline-block rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
                    AI answer engine optimization
                </div>
                <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                    See how AI search talks about{' '}
                    <span className="text-gradient">your brand</span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 sm:text-xl">
                    Track your brand across ChatGPT and Perplexity, compare against competitors, and
                    know exactly what&apos;s changing — with the raw answers as proof.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <CheckoutButton className="rounded-lg bg-brand-gradient px-7 py-3 text-base font-semibold text-white transition hover:opacity-90">
                        Start monitoring — $9/mo
                    </CheckoutButton>
                    <Link href="#how-it-works" className="rounded-lg border border-slate-200 px-7 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50">
                        See how it works
                    </Link>
                </div>
                <p className="mt-4 text-sm text-slate-400">No setup fees · cancel anytime</p>
            </section>

            {/* Social proof — structurally present, fills in with logos/testimonials later */}
            <section className="border-y border-slate-100 bg-slate-50/60">
                <div className="mx-auto max-w-5xl px-6 py-10 text-center">
                    <p className="text-sm font-medium uppercase tracking-wider text-slate-400">
                        Built for growth & content teams at B2B SaaS companies
                    </p>
                </div>
            </section>

            {/* Value props */}
            <section id="features" className="mx-auto max-w-6xl px-6 py-20">
                <div className="grid gap-8 md:grid-cols-3">
                    {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
                        <div key={title}>
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <h3 className="text-lg font-semibold">{title}</h3>
                            <p className="mt-2 text-slate-600">{body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section id="how-it-works" className="border-t border-slate-100 bg-slate-50/60">
                <div className="mx-auto max-w-5xl px-6 py-20">
                    <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
                    <div className="mt-12 grid gap-8 md:grid-cols-3">
                        {STEPS.map((s) => (
                            <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
                                    {s.n}
                                </div>
                                <h3 className="mt-4 font-semibold">{s.title}</h3>
                                <p className="mt-1.5 text-sm text-slate-600">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
                <h2 className="text-center text-3xl font-bold tracking-tight">One simple plan</h2>
                <p className="mt-2 text-center text-slate-600">Everything you need to monitor your AI search visibility.</p>
                <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">$9</span>
                        <span className="text-slate-500">/month</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">Billed monthly. Cancel anytime.</p>
                    <ul className="mt-6 space-y-3">
                        {PRICING_FEATURES.map((f) => (
                            <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                                {f}
                            </li>
                        ))}
                    </ul>
                    <div className="mt-8">
                        <CheckoutButton className="w-full rounded-lg bg-brand-gradient px-6 py-3 text-base font-semibold text-white transition hover:opacity-90">
                            Start monitoring
                        </CheckoutButton>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="border-t border-slate-100">
                <div className="mx-auto max-w-3xl px-6 py-20 text-center">
                    <h2 className="text-3xl font-bold tracking-tight">Know where you stand in AI search</h2>
                    <p className="mx-auto mt-3 max-w-xl text-slate-600">
                        Your buyers are already asking AI which tools to use. See what it tells them about you.
                    </p>
                    <div className="mt-8">
                        <CheckoutButton className="rounded-lg bg-brand-gradient px-7 py-3 text-base font-semibold text-white transition hover:opacity-90">
                            Get started — $9/mo
                        </CheckoutButton>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-200">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-brand-gradient" aria-hidden="true" />
                        <span className="font-semibold text-slate-700">MeasureX</span>
                        <span className="text-slate-400">© 2026</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/dashboard/settings" className="hover:text-slate-900">Manage billing</Link>
                        <a href="mailto:support@measurex.io" className="hover:text-slate-900">Contact</a>
                        <Link href="/login" className="hover:text-slate-900">Sign in</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
