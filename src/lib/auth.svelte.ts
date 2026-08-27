export type User = { username: string; role: 'owner' | 'admin' | 'user'; email?: string | null; permissions?: Record<string, boolean> };

const STORAGE_KEY = 'orbitfs.session';

function loadStored(): { token: string; user: User } | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

class AuthStore {
	token = $state<string | null>(null);
	user = $state<User | null>(null);
	ready = $state(false);

	init() {
		const stored = loadStored();
		if (stored) {
			this.token = stored.token;
			this.user = stored.user;
		}
		this.ready = true;
	}

	set(token: string, user: User) {
		this.token = token;
		this.user = user;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
	}

	setUser(user: User) {
		this.user = user;
		if (this.token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: this.token, user }));
	}

	clear() {
		this.token = null;
		this.user = null;
		localStorage.removeItem(STORAGE_KEY);
	}

	get isAuthenticated() {
		return this.token !== null;
	}

	get isAdmin() {
		return this.user?.role === 'owner' || this.user?.role === 'admin';
	}
}

export const auth = new AuthStore();
