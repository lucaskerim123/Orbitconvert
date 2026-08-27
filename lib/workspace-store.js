const seed = [
  { id: 'admin-main', name: 'Public Workspace', slug: 'public-workspace', role: 'owner', isPublic: true, status: 'active', files: 0 },
  { id: 'user-main', name: 'My Workspace', slug: 'my-workspace', role: 'owner', isPublic: false, status: 'active', files: 0 }
];

let workspaces = [...seed];

export function listWorkspaces() { return workspaces.map((w) => ({ ...w })); }
export function getWorkspace(id) { return workspaces.find((w) => w.id === id) ?? null; }
export function createWorkspace(input = {}) {
  const name = String(input.name ?? '').trim();
  if (name.length < 2) throw new Error('Workspace name must be at least 2 characters');
  const slug = (input.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  const workspace = { id: `ws-${crypto.randomUUID()}`, name, slug, role: 'owner', isPublic: Boolean(input.isPublic), status: 'active', files: 0 };
  workspaces.push(workspace);
  return { ...workspace };
}
