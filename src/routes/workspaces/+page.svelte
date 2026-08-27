<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { baseStore } from '$lib/base-store.svelte';
	import { Plus, FolderOpen, Trash2, Power, Database } from '@lucide/svelte';

	let name = $state('');
	let description = $state('');
	let error = $state('');

	onMount(() => { void baseStore.init(); });

	function createWorkspace() {
		error = '';
		try {
			baseStore.createWorkspace(name, description);
			name = '';
			description = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create workspace';
		}
	}

	function toggleStatus(id: string, current: 'active' | 'offline') {
		baseStore.updateWorkspace(id, { status: current === 'active' ? 'offline' : 'active' });
	}
</script>

<div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Phase 1</p>
			<h1 class="text-2xl font-semibold tracking-tight">Workspaces</h1>
			<p class="mt-1 text-sm text-muted-foreground">Base Panel workspace management backed by Supabase.</p>
		</div>
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<Database class="size-4" />
			{baseStore.saving ? 'Saving to database...' : 'Database persistence'}
		</div>
	</header>

	{#if baseStore.error || error}
		<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error || baseStore.error}</div>
	{/if}

	<section class="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
		<div class="rounded-xl border bg-card p-4 shadow-sm">
			<h2 class="font-semibold">Create workspace</h2>
			<p class="mt-1 text-sm text-muted-foreground">Creates a new isolated Base Panel workspace.</p>
			<div class="mt-4 space-y-3">
				<input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={name} placeholder="Workspace name" />
				<textarea class="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" bind:value={description} placeholder="Description"></textarea>
				<button class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onclick={createWorkspace} disabled={!name.trim()}>
					<Plus class="size-4" /> Create workspace
				</button>
			</div>
		</div>

		<div class="space-y-3">
			{#if !baseStore.ready}
				<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Loading workspaces...</div>
			{:else}
				{#each baseStore.workspaces as workspace (workspace.id)}
					<article class="rounded-xl border bg-card p-4 shadow-sm {baseStore.currentWorkspaceId === workspace.id ? 'border-primary/60' : ''}">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<h2 class="truncate text-lg font-semibold">{workspace.name}</h2>
									<span class="rounded-full border px-2 py-0.5 text-xs capitalize">{workspace.status}</span>
									{#if workspace.is_main}<span class="rounded-full border px-2 py-0.5 text-xs">Main</span>{/if}
								</div>
								<p class="mt-1 text-sm text-muted-foreground">{workspace.description || 'No description'}</p>
								<p class="mt-2 text-xs text-muted-foreground">/{workspace.slug} · {workspace.permission}</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" onclick={() => { baseStore.selectWorkspace(workspace.id); void goto('/workspaces/explorer'); }}>
									<FolderOpen class="size-4" /> Open
								</button>
								<button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" onclick={() => toggleStatus(workspace.id, workspace.status)}>
									<Power class="size-4" /> {workspace.status === 'active' ? 'Offline' : 'Activate'}
								</button>
								{#if !workspace.is_main}
									<button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-destructive hover:bg-destructive/10" onclick={() => baseStore.deleteWorkspace(workspace.id)}>
										<Trash2 class="size-4" /> Delete
									</button>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			{/if}
		</div>
	</section>
</div>
