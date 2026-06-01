/**
 * Shared types for dashboard layout components.
 */

export type WorkspaceRole = 'owner' | 'viewer';

export interface WorkspaceSummary {
    id: string;
    name: string;
    role: WorkspaceRole;
}

export interface DashboardUser {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
}
