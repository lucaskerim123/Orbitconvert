export type Workspace = {
	id: string;
	name: string;
	description: string;
	slug: string;
	status: 'active' | 'offline';
	permission: 'owner' | 'editor' | 'contributor' | 'viewer';
	is_main: boolean;
	createdAt: string;
};

export type Profile = {
	id: string;
	workspaceId: string;
	name: string;
	type: string;
	classification: string;
	labels: string[];
	background: string;
	relationship: string;
	notes: string;
	updatedAt: string;
};

export type FileEntry = {
	id: string;
	workspaceId: string;
	path: string;
	kind: 'file' | 'folder';
	content: string;
	size: number;
	updatedAt: string;
};
type State = {
	currentWorkspaceId: string;
	workspaces: Workspace[];
	profiles: Profile[];
	files: FileEntry[];
};

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

function defaultState(): State {
	return {
		currentWorkspaceId: 'workspace-user',
		workspaces: [
			{ id: 'workspace-public', name: 'Public Workspace', description: 'Shared public workspace', slug: 'public-workspace', status: 'active', permission: 'owner', is_main: true, createdAt: now() },
			{ id: 'workspace-user', name: 'My Workspace', description: 'Private workspace', slug: 'my-workspace', status: 'active', permission: 'owner', is_main: false, createdAt: now() }
		],
		profiles: [],
		files: []
	};
}

class BaseStore {
	workspaces = $state<Workspace[]>([]);
	profiles = $state<Profile[]>([]);
	files = $state<FileEntry[]>([]);
	currentWorkspaceId = $state('');
	ready = $state(false);
	saving = $state(false);
	error = $state('');	async init() {
		if (this.ready) return;
		let state = defaultState();
		let loadedFromDb = false;
		try {
			const response = await fetch('/api/base/state');
			if (!response.ok) throw new Error('Database load failed');
			const payload = await response.json();
			if (payload.state) {
				state = { ...state, ...payload.state };
				loadedFromDb = true;
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Database load failed';
		}
		this.workspaces = state.workspaces;
		this.profiles = state.profiles;
		this.files = state.files;
		this.currentWorkspaceId = state.currentWorkspaceId || state.workspaces[0]?.id || '';
		for (const workspace of this.workspaces) this.ensureCoreFolders(workspace.id);
		this.ready = true;
		if (!loadedFromDb) await this.persist();
	}

	private snapshot(): State {
		return {
			currentWorkspaceId: this.currentWorkspaceId,
			workspaces: this.workspaces,
			profiles: this.profiles,
			files: this.files
		};
	}
	async persist() {
		if (!this.ready) return;
		this.saving = true;
		try {
			const response = await fetch('/api/base/state', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ state: this.snapshot() })
			});
			if (!response.ok) throw new Error('Database save failed');
			this.error = '';
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Database save failed';
		} finally {
			this.saving = false;
		}
	}

	get currentWorkspace() {
		return this.workspaces.find((item) => item.id === this.currentWorkspaceId) ?? null;
	}
	selectWorkspace(workspaceId: string) {
		if (!this.workspaces.some((item) => item.id === workspaceId)) return;
		this.currentWorkspaceId = workspaceId;
		void this.persist();
	}

	createWorkspace(name: string, description = '') {
		const clean = name.trim();
		if (clean.length < 2) throw new Error('Workspace name must be at least 2 characters');
		const workspace: Workspace = {
			id: makeId('workspace'), name: clean, description: description.trim(),
			slug: slugify(clean), status: 'active', permission: 'owner',
			is_main: false, createdAt: now()
		};
		this.workspaces = [...this.workspaces, workspace];
		this.currentWorkspaceId = workspace.id;
		this.ensureCoreFolders(workspace.id);
		void this.persist();
		return workspace;
	}
	updateWorkspace(workspaceId: string, changes: Partial<Pick<Workspace, 'name' | 'description' | 'status'>>) {
		this.workspaces = this.workspaces.map((item) => item.id === workspaceId
			? { ...item, ...changes, slug: changes.name ? slugify(changes.name) : item.slug }
			: item);
		void this.persist();
	}

	deleteWorkspace(workspaceId: string) {
		const workspace = this.workspaces.find((item) => item.id === workspaceId);
		if (!workspace || workspace.is_main) return false;
		this.workspaces = this.workspaces.filter((item) => item.id !== workspaceId);
		this.profiles = this.profiles.filter((item) => item.workspaceId !== workspaceId);
		this.files = this.files.filter((item) => item.workspaceId !== workspaceId);
		this.currentWorkspaceId = this.workspaces[0]?.id || '';
		void this.persist();
		return true;
	}

	profilesFor(workspaceId = this.currentWorkspaceId) {
		return this.profiles.filter((item) => item.workspaceId === workspaceId);
	}
	createProfile(input: Pick<Profile, 'name' | 'type' | 'classification' | 'labels' | 'background' | 'relationship' | 'notes'>) {
		if (!this.currentWorkspaceId) throw new Error('Select a workspace first');
		const name = input.name.trim();
		if (!name) throw new Error('Profile name is required');
		const profile: Profile = {
			id: makeId('profile'), workspaceId: this.currentWorkspaceId, name,
			type: input.type.trim() || 'Person',
			classification: input.classification.trim() || 'General',
			labels: input.labels, background: input.background,
			relationship: input.relationship, notes: input.notes,
			updatedAt: now()
		};
		this.profiles = [...this.profiles, profile];
		void this.persist();
		return profile;
	}

	updateProfile(profileId: string, changes: Partial<Profile>) {
		this.profiles = this.profiles.map((item) => item.id === profileId
			? { ...item, ...changes, updatedAt: now() }
			: item);
		void this.persist();
	}
	deleteProfile(profileId: string) {
		this.profiles = this.profiles.filter((item) => item.id !== profileId);
		void this.persist();
	}

	ensureCoreFolders(workspaceId: string) {
		for (const path of ['_trash', '_media']) {
			if (!this.files.some((item) => item.workspaceId === workspaceId && item.path === path)) {
				this.files = [...this.files, {
					id: makeId('folder'), workspaceId, path, kind: 'folder',
					content: '', size: 0, updatedAt: now()
				}];
			}
		}
	}

	entriesFor(directory = '', workspaceId = this.currentWorkspaceId) {
		const prefix = directory ? `${directory.replace(/\/$/, '')}/` : '';
		return this.files.filter((item) => {
			if (item.workspaceId !== workspaceId || !item.path.startsWith(prefix)) return false;
			return !item.path.slice(prefix.length).includes('/');
		}).sort((a, b) => a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'folder' ? -1 : 1);
	}
	createFolder(directory: string, name: string) {
		const clean = name.trim().replace(/[\\/]+/g, '-');
		if (!clean) throw new Error('Folder name is required');
		const path = [directory.replace(/\/$/, ''), clean].filter(Boolean).join('/');
		if (this.files.some((item) => item.workspaceId === this.currentWorkspaceId && item.path === path)) {
			throw new Error('That path already exists');
		}
		this.files = [...this.files, {
			id: makeId('folder'), workspaceId: this.currentWorkspaceId,
			path, kind: 'folder', content: '', size: 0, updatedAt: now()
		}];
		void this.persist();
	}

	createFile(directory: string, name: string, content = '') {
		const clean = name.trim().replace(/[\\/]+/g, '-');
		if (!clean) throw new Error('File name is required');
		const path = [directory.replace(/\/$/, ''), clean].filter(Boolean).join('/');
		if (this.files.some((item) => item.workspaceId === this.currentWorkspaceId && item.path === path)) {
			throw new Error('That path already exists');
		}
		this.files = [...this.files, {
			id: makeId('file'), workspaceId: this.currentWorkspaceId,
			path, kind: 'file', content,
			size: new Blob([content]).size, updatedAt: now()
		}];
		void this.persist();
	}

	updateFile(fileId: string, content: string) {
		this.files = this.files.map((item) => item.id === fileId
			? { ...item, content, size: new Blob([content]).size, updatedAt: now() }
			: item);
		void this.persist();
	}

	deleteEntry(entry: FileEntry) {
		const prefix = `${entry.path}/`;
		this.files = this.files.filter((item) => !(
			item.workspaceId === entry.workspaceId &&
			(item.path === entry.path || item.path.startsWith(prefix))
		));
		void this.persist();
	}
}

export const baseStore = new BaseStore();
