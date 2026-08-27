import { env } from '$env/dynamic/public';
import { untrack } from 'svelte';
import { auth } from './auth.svelte';

export class ApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

type HeaderProvider = () => Record<string, string>;
const headerProviders = new Set<HeaderProvider>();
const API_BASE = (env.PUBLIC_API_BASE || '/api').replace(/\/$/, '');

export function registerHeaderProvider(provider: HeaderProvider) {
	headerProviders.add(provider);
	return () => headerProviders.delete(provider);
}

function apiUrl(path: string) {
	return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function authHeaders(): HeadersInit {
	return untrack(() => {
		const headers: Record<string, string> = {};
		if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
		for (const provider of headerProviders) Object.assign(headers, provider());
		return headers;
	});
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	for (const [key, value] of Object.entries(authHeaders())) headers.set(key, value);
	if (init.body && !(init.body instanceof ArrayBuffer) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	const res = await fetch(apiUrl(path), { ...init, headers });
	if (res.status === 401) { auth.clear(); throw new ApiError('Session expired', 401); }
	const isJson = res.headers.get('content-type')?.includes('application/json');
	const body = isJson ? await res.json().catch(() => ({})) : null;
	if (!res.ok) {
		const code = body?.code;
		const component = body?.component;
		const panelFailure = component === 'orbitfs_panel' || component === null || component === undefined;
		if ((code === 'LICENSE_REQUIRED' || code === 'LICENSE_COMPONENT_DENIED') && panelFailure) {
			if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/license')) {
				window.location.assign('/admin/license?reason=panel_invalid');
			}
		}
		throw new ApiError(body?.error || res.statusText || 'Request failed', res.status, code);
	}
	return body as T;
}

export const api = {
	get: <T>(path: string, headers?: HeadersInit) => request<T>(path, { headers }),
	post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
	patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
	put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
	upload: (path: string, file: File, onProgress?: (pct: number) => void) => new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest(); xhr.open('POST', apiUrl(path));
		for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
		xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
		xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new ApiError(xhr.responseText || 'Upload failed', xhr.status)); };
		xhr.onerror = () => reject(new ApiError('Upload failed', 0)); xhr.send(file);
	}),
	uploadResult: <T>(path: string, file: File, headers: Record<string,string> = {}, onProgress?: (pct: number) => void) => new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest(); xhr.open('POST', apiUrl(path));
		for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
		for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
		xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
		xhr.onload = () => {
			let body: any = null;
			try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { body = null; }
			if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
			else reject(new ApiError(body?.error || xhr.responseText || 'Upload failed', xhr.status, body?.code));
		};
		xhr.onerror = () => reject(new ApiError('Upload failed', 0)); xhr.send(file);
	}),
	downloadEndpoint: async (endpoint: string, filename: string) => {
		const res = await fetch(apiUrl(endpoint), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Download failed', res.status);
		const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
		a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
	},
	download: async (path: string, filename: string) => {
		return api.downloadEndpoint(`/download?path=${encodeURIComponent(path)}`, filename);
	},
	downloadSelectedZip: async (paths: string[], filename: string) => {
		const res = await fetch(apiUrl('/download-zip-selected'), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) });
		if (!res.ok) throw new ApiError('Selected ZIP download failed', res.status);
		const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
		a.href = url; a.download = filename.endsWith('.zip') ? filename : (filename || 'root') + '.zip'; a.click(); URL.revokeObjectURL(url);
	},
	downloadZip: async (path: string, filename: string) => {
		const res = await fetch(apiUrl(`/download-zip?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('ZIP download failed', res.status);
		const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
		a.href = url; a.download = filename.endsWith('.zip') ? filename : (filename || 'root') + '.zip'; a.click(); URL.revokeObjectURL(url);
	},
	uploadZipExtract: (path: string, file: File, onProgress?: (pct: number) => void) => new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest(); xhr.open('POST', apiUrl(`/upload-zip-extract?path=${encodeURIComponent(path)}`));
		for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
		xhr.setRequestHeader('Content-Type', 'application/zip');
		xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
		xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new ApiError(xhr.responseText || 'ZIP extract failed', xhr.status)); };
		xhr.onerror = () => reject(new ApiError('ZIP extract failed', 0)); xhr.send(file);
	}),
	previewStreamUrl: async (path: string) => {
		const { ticket } = await request<{ ticket: string }>('/preview-ticket', {
			method: 'POST',
			body: JSON.stringify({ path })
		});
		return apiUrl(`/preview-stream/${encodeURIComponent(ticket)}`);
	},
	previewBlob: async (path: string) => {
		const res = await fetch(apiUrl(`/preview?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Preview failed', res.status);
		return res.blob();
	},
	previewBlobUrl: async (path: string) => {
		const res = await fetch(apiUrl(`/preview?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Preview failed', res.status);
		const blob = await res.blob(); return URL.createObjectURL(blob);
	}
};
