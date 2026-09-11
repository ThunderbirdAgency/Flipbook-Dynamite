export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type TeamPermission = 'read' | 'edit' | 'delete' | 'team';
export const roleDescriptions: Record<TeamRole,string> = {
 owner: 'Full access, including administrators and team membership.',
 admin: 'Manage publications, links, shelves, editors and viewers.',
 editor: 'Upload, customize, edit, share and view analytics. Cannot delete publications or manage people.',
 viewer: 'Read the team library and view analytics. Cannot change publications or membership.',
};
export function permits(role: TeamRole | null, permission: TeamPermission): boolean {
 if (!role) return false;
 if (permission === 'read') return true;
 if (permission === 'edit') return role !== 'viewer';
 return role === 'owner' || role === 'admin';
}
export function canAssign(actor: TeamRole | null, oldRole: TeamRole | null, nextRole: TeamRole): boolean {
 if (nextRole === 'owner' || oldRole === 'owner') return false;
 return actor === 'owner' || (actor === 'admin' && oldRole !== 'admin' && nextRole !== 'admin');
}
