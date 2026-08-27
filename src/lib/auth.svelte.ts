export type User = { id?: string; username: string; display_name?: string; role: 'owner' | 'admin' | 'user'; email?: string | null; permissions?: Record<string, boolean> };

class AuthStore {
	token = <string | null>(null);
	user = <User | null>(null);
	ready = (false);
	private loading = false;

	init() {
		if (this.ready || this.loading || typeof window === 'undefined') return;
		this.loading = true;
		fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
			.then((r) => r.json())
			.then((data) => {
				if (data?.authenticated && data.user) {
					const role = data.user.role === 'member' ? 'user' : data.user.role;
					this.user = { ...data.user, role };
					this.token = 'cookie-session';
				}
			})
			.catch(() => {})
			.finally(() => { this.loading = false; this.ready = true; });
	}

	set(_token: string, user: User) { this.token = 'cookie-session'; this.user = user; this.ready = true; }
	setUser(user: User) { this.user = { ...user, role: user.role === ('member' as any) ? 'user' : user.role }; this.token = 'cookie-session'; this.ready = true; }
	clear() { this.token = null; this.user = null; this.ready = true; }
	get isAuthenticated() { return this.token !== null && this.user !== null; }
	get isAdmin() { return this.user?.role === 'owner' || this.user?.role === 'admin'; }
}

export const auth = new AuthStore();
