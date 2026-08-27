<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Boxes, ContactRound, FolderTree, Cloud, Database } from '@lucide/svelte';
	import { baseStore } from '$lib/base-store.svelte';

	let { children } = $props();
	onMount(() => { void baseStore.init(); });

	const active = (href: string) => page.url.pathname.startsWith(href)
		? 'bg-sidebar-accent text-sidebar-accent-foreground'
		: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground';
</script>

<svelte:head>
	<title>OrbitFS Base Panel</title>
	<meta name="description" content="OrbitFS Base Panel on Vercel" />
</svelte:head>

<div class="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
	<aside class="border-b border-border bg-sidebar lg:min-h-screen lg:border-b-0 lg:border-r">
		<div class="flex items-center gap-3 px-4 py-4 lg:px-5 lg:py-6">
			<div class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Cloud class="size-5" /></div>
			<div><div class="font-semibold tracking-tight">OrbitFS</div><div class="text-xs text-muted-foreground">Base Panel · Vercel</div></div>
		</div>
		<nav class="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
			<a href="/workspaces/explorer" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/workspaces/explorer')}`}><FolderTree class="size-4" /> Files</a>
			<a href="/workspaces" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/workspaces')}`}><Boxes class="size-4" /> Workspaces</a>
			<a href="/profiles" class={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active('/profiles')}`}><ContactRound class="size-4" /> Profiles</a>
		</nav>
		<div class="hidden px-5 pt-5 text-xs text-muted-foreground lg:block">
			<div class="flex items-center gap-2"><Database class="size-3.5" /> Supabase database</div>
			<p class="mt-2 leading-relaxed">Standalone cloud runtime. Base Panel state persists in Supabase and the app runs on Vercel.</p>
		</div>
	</aside>

	<section class="min-w-0">
		<header class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
			<div><div class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Phase 1 Base Panel</div><div class="text-sm text-muted-foreground">Workspaces · Profiles · Files</div></div>
			{#if baseStore.ready}
				<select class="min-w-48 rounded-lg border border-input bg-card px-3 py-2 text-sm" value={baseStore.currentWorkspaceId} onchange={(event) => baseStore.selectWorkspace(event.currentTarget.value)}>
					{#each baseStore.workspaces as workspace}<option value={workspace.id}>{workspace.name}</option>{/each}
				</select>
			{/if}
		</header>
		<main>{@render children()}</main>
	</section>
</div>
