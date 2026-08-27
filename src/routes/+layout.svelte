<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Boxes, ContactRound, FolderTree, Cloud, Database, LogOut, UserRound, Bell, Shield } from '@lucide/svelte';
	import { baseStore } from '$lib/base-store.svelte';

	let { children } = $props();
	let authReady = $state(false);
	let user = $state<{ id: string; username: string; display_name: string; role: string } | null>(null);
	let unreadNotifications = $state(0);
	const publicRoute = $derived(['/login', '/register', '/setup'].some((path) => page.url.pathname.startsWith(path)));

	const active = (href: string) => page.url.pathname.startsWith(href)
		? 'bg-sidebar-accent text-sidebar-accent-foreground'
		: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground';

	onMount(async () => {
		if (publicRoute) { authReady = true; return; }
		try {
			const response = await fetch('/api/auth/me', { cache: 'no-store' });
			const payload = await response.json();
			if (!payload.authenticated) return void (await goto('/login'));
			user = payload.user;
			unreadNotifications = Number(payload.unreadNotifications || 0);
			await baseStore.init();
		} catch {
			await goto('/login');
		} finally { authReady = true; }
	});

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
		baseStore.reset();
		await goto('/login');
	}
</script>

<svelte:head>
	<title>OrbitFS Base Panel</title>
	<meta name="description" content="Standalone OrbitFS Base System on Vercel and Supabase" />
</svelte:head>

{#if publicRoute}
	{@render children()}
{:else if !authReady}
	<div class="grid min-h-dvh place-items-center bg-background text-foreground"><div class="text-center"><Cloud class="mx-auto size-8 animate-pulse text-primary" /><p class="mt-3 text-sm text-muted-foreground">Loading OrbitFS…</p></div></div>
{:else if user}
	<div class="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[245px_minmax(0,1fr)]">
		<aside class="border-b border-border bg-sidebar lg:min-h-screen lg:border-b-0 lg:border-r">
			<div class="flex items-center gap-3 px-4 py-4 lg:px-5 lg:py-6">
				<div class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Cloud class="size-5" /></div>
				<div><div class="font-semibold tracking-tight">OrbitFS</div><div class="text-xs text-muted-foreground">Standalone Base System</div></div>
			</div>
			<nav class="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
				<a href="/workspaces/explorer" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/workspaces/explorer')}`}><FolderTree class="size-4" /> Files</a>
				<a href="/workspaces" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/workspaces')}`}><Boxes class="size-4" /> Workspaces</a>
				<a href="/profiles" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/profiles')}`}><ContactRound class="size-4" /> Profiles</a>
				<a href="/account" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/account')}`}><UserRound class="size-4" /> Account</a>
				<a href="/notifications" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/notifications')}`}><Bell class="size-4" /> Notifications {#if unreadNotifications}<span class="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadNotifications}</span>{/if}</a>
				{#if user.role === 'owner' || user.role === 'admin'}<a href="/admin" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/admin')}`}><Shield class="size-4" /> Administration</a>{/if}
			</nav>
			<div class="hidden px-5 pt-5 text-xs text-muted-foreground lg:block">
				<div class="flex items-center gap-2"><Database class="size-3.5" /> Supabase database</div>
				<p class="mt-2 leading-relaxed">Base System runs on Vercel. No VPS, localhost service or desktop runtime dependency.</p>
			</div>
		</aside>

		<section class="min-w-0">
			<header class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
				<div><div class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Base System</div><div class="text-sm text-muted-foreground">Workspaces · Profiles · Files · Permissions</div></div>
				<div class="flex items-center gap-2">
					{#if baseStore.ready}<select class="min-w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm" value={baseStore.currentWorkspaceId} onchange={(event) => baseStore.selectWorkspace(event.currentTarget.value)}>{#each baseStore.workspaces as workspace}<option value={workspace.id}>{workspace.name}</option>{/each}</select>{/if}
					<div class="hidden text-right sm:block"><p class="text-sm font-medium">{user.display_name}</p><p class="text-xs capitalize text-muted-foreground">{user.role}</p></div>
					<button class="grid size-9 place-items-center rounded-lg border hover:bg-muted" onclick={logout} aria-label="Sign out"><LogOut class="size-4" /></button>
				</div>
			</header>
			<main>{@render children()}</main>
		</section>
	</div>
{/if}
