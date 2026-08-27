import { api, ApiError } from '$lib/api';
import { fileContext } from '$lib/context.svelte';

export type Workspace = {
	id: string;
	name: string;
	slug: string;
	is_main: boolean;
	permission: 'owner' | 'editor' | 'contributor' | 'viewer';
	status: string;
	drive_state?: string;
};

const STORAGE_KEY = 'orbitfs.workspace';

class WorkspaceStore {
	workspaces = $state<Workspace[]>([]);
	currentId = $state<string | null>(null);
	loaded = $state(false);

	async load() {
		try {
			// Capture the user's choice before the request. A background add-on refresh must
			// never replace a selection made while this request is in flight.
			const selectedBeforeLoad = this.currentId ?? localStorage.getItem(STORAGE_KEY);
			const res = await api.get<{ workspaces: Workspace[] }>('/workspaces');
			this.workspaces = res.workspaces;
			const stored = localStorage.getItem(STORAGE_KEY);
			const preferred = stored ?? selectedBeforeLoad;
			const main = res.workspaces.find((w) => w.is_main);
			this.currentId =
				(preferred && res.workspaces.some((w) => w.id === preferred) ? preferred : null) ??
				main?.id ??
				res.workspaces[0]?.id ??
				null;
			if (this.currentId) localStorage.setItem(STORAGE_KEY, this.currentId);
			const chosen = res.workspaces.find((w) => w.id === this.currentId);
			fileContext.set(this.currentId, chosen?.name ?? 'Main workspace');
		} catch (err) {
			// A 401 means the whole session is about to be torn down elsewhere (auth.clear()
			// already ran) — leave state alone rather than fighting that. Anything else (addon
			// detached mid-session, licence lapsed, workspace router unmounted) means workspaces
			// are no longer usable: reset fully so nothing downstream references a dead id.
			if (!(err instanceof ApiError && err.status === 401)) {
				this.workspaces = [];
				this.currentId = null;
				fileContext.clear();
			}
		} finally {
			this.loaded = true;
		}
	}

	select(id: string) {
		this.currentId = id;
		localStorage.setItem(STORAGE_KEY, id);
		const chosen = this.workspaces.find((w) => w.id === id);
		fileContext.set(id, chosen?.name ?? 'Workspace');
	}

	get current() {
		return this.workspaces.find((w) => w.id === this.currentId) ?? null;
	}

	get enabled() {
		return this.workspaces.length > 0;
	}
}

export const workspace = new WorkspaceStore();

