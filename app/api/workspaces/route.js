import { createWorkspace, listWorkspaces } from '../../../lib/workspace-store.js';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ ok: true, workspaces: listWorkspaces() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    return Response.json({ ok: true, workspace: createWorkspace(body) }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
