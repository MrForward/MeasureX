import Link from 'next/link';

export default function Home() {
    return (
        <main className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-gradient" />
                    <span className="text-xl font-bold text-slate-900">MeasureX</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-slate-600">
                    <Link href="#features" className="hover:text-slate-900">Features</Link>
                    <Link href="#how-it-works" className="hover:text-slate-900">How it works</Link>
                    <Link
                        href="/login"
                        className="rounded-lg bg-brand-gradient px-4 py-2 font-medium text-white hover:opacity-90"
                    >
                        Get started
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="px-6 py-24 max-w-4xl mx-auto text-center">
                <div className="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 mb-6">
                    AI Answer Engine Optimization
                </div>
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
                    See where your brand appears in{' '}
                    <span className="text-gradient">AI answers</span>
                </h1>
                <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
                    Track your visibility across ChatGPT, Perplexity, and Google AI Overviews.
                    Compare against competitors. Get evidence-backed recommendations.
                </p>
                <div className="flex items-center justify-center gap-4">
                    <Link
                        href="/login"
                        className="rounded-lg bg-brand-gradient px-6 py-3 font-medium text-white hover:opacity-90"
                    >
                        Start monitoring
                    </Link>
                    <Link
                        href="#how-it-works"
                        className="rounded-lg border border-slate-200 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50"
                    >
                        See how it works
                    </Link>
                </div>
            </section>

            {/* Trust strip */}
            <section className="px-6 py-12 border-t border-slate-100">
                <p className="text-center text-sm font-medium uppercase tracking-wider text-slate-400 mb-2">
                    Built for transparency
                </p>
                <p className="text-center text-slate-600 max-w-2xl mx-auto">
                    Every metric links back to the raw prompt, answer, and citations — no black-box scores.
                </p>
            </section>
        </main>
    );
}
