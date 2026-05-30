import { z } from 'zod';

/**
 * Validation schema for creating a new workspace.
 * Requirement 1: workspace name is required, 1–100 characters.
 */
export const CreateWorkspaceSchema = z.object({
    name: z
        .string()
        .min(1, 'Workspace name is required')
        .max(100, 'Workspace name must be 100 characters or fewer')
        .trim(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

/**
 * Validation schema for updating an existing workspace.
 * All fields are optional — only provided fields are updated.
 */
export const UpdateWorkspaceSchema = z.object({
    name: z
        .string()
        .min(1, 'Workspace name is required')
        .max(100, 'Workspace name must be 100 characters or fewer')
        .trim()
        .optional(),
});

export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

/**
 * Validation schema for inviting a member to a workspace.
 * Requirement 1.2: owner can invite users with 'owner' or 'viewer' role.
 */
export const InviteMemberSchema = z.object({
    email: z.string().email('A valid email address is required'),
    role: z.enum(['owner', 'viewer'], {
        errorMap: () => ({ message: "Role must be 'owner' or 'viewer'" }),
    }),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

/**
 * Validation schema for updating a workspace member's role.
 * Requirement 1.2: roles are 'owner' or 'viewer'.
 */
export const UpdateMemberRoleSchema = z.object({
    role: z.enum(['owner', 'viewer'], {
        errorMap: () => ({ message: "Role must be 'owner' or 'viewer'" }),
    }),
});

export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
