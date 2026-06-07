import type { Metadata } from 'next';
import { Lightbulb } from 'lucide-react';
import { ComingSoon } from '@/components/dashboard/coming-soon';

export const metadata: Metadata = { title: 'Recommendations — MeasureX' };

export default function RecommendationsPage() {
    return (
        <ComingSoon
            title="Recommendations"
            description="Actionable suggestions to improve your brand's AI visibility."
            icon={<Lightbulb className="h-6 w-6" aria-hidden="true" />}
            planned={[
                'Evidence-backed recommendations from your raw responses',
                'Prioritized by estimated impact',
                'Targeted tips when a competitor outranks you on a prompt',
            ]}
        />
    );
}
