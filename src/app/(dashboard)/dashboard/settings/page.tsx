import type { Metadata } from 'next';
import { Settings } from 'lucide-react';
import { ComingSoon } from '@/components/dashboard/coming-soon';

export const metadata: Metadata = { title: 'Settings — MeasureX' };

export default function SettingsPage() {
    return (
        <ComingSoon
            title="Settings"
            description="Manage your brand profile, workspace, and run schedule."
            icon={<Settings className="h-6 w-6" aria-hidden="true" />}
            planned={[
                'Brand name, domain, and aliases',
                'Workspace members and roles',
                'Weekly run schedule and notifications',
            ]}
        />
    );
}
