import type { RequestHandler } from './$types';
import { handleOrbitMcpRequest } from '$lib/server/mcp/cloud-server';

const handle: RequestHandler = async ({ request }) => {
	return handleOrbitMcpRequest(request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
