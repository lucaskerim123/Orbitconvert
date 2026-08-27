<script lang="ts">
	import { onMount } from 'svelte';
	import { baseStore } from '$lib/base-store.svelte';
	import { ContactRound, Plus, Trash2 } from '@lucide/svelte';

	let name = $state('');
	let type = $state('Person');
	let classification = $state('General');
	let labels = $state('');
	let relationship = $state('');
	let background = $state('');
	let notes = $state('');
	let error = $state('');

	onMount(() => { void baseStore.init(); });
	const profiles = $derived(baseStore.profilesFor());

	function createProfile() {
		error = '';
		try {
			baseStore.createProfile({
				name,
				type,
				classification,
				labels: labels.split(',').map((item) => item.trim()).filter(Boolean),
				background,
				relationship,
				notes
			});
			name = '';
			labels = '';
			relationship = '';
			background = '';
			notes = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create profile';
		}
	}
</script>

<div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
	<header>
		<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Phase 1</p>
		<h1 class="text-2xl font-semibold tracking-tight">Profiles</h1>
		<p class="mt-1 text-sm text-muted-foreground">Core profile records for {baseStore.currentWorkspace?.name || 'the selected workspace'}.</p>
	</header>

	{#if error || baseStore.error}
		<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error || baseStore.error}</div>
	{/if}

	<div class="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
		<section class="rounded-xl border bg-card p-4 shadow-sm">
			<div class="flex items-center gap-2"><ContactRound class="size-5" /><h2 class="font-semibold">New profile</h2></div>
			<div class="mt-4 space-y-3">
				<input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={name} placeholder="Profile name" />
				<div class="grid grid-cols-2 gap-3">
					<select class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={type}>
						<option>Person</option><option>Organisation</option><option>Project</option><option>Incident</option>
					</select>
					<select class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={classification}>
						<option>General</option><option>Private</option><option>Sensitive</option><option>System</option>
					</select>
				</div>
				<input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={labels} placeholder="Labels, comma separated" />
				<input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={relationship} placeholder="Relationship / connection" />
				<textarea class="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" bind:value={background} placeholder="Background"></textarea>
				<textarea class="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" bind:value={notes} placeholder="Notes"></textarea>
				<button class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onclick={createProfile} disabled={!name.trim()}>
					<Plus class="size-4" /> Create profile
				</button>
			</div>
		</section>

		<section class="space-y-3">
			{#if !baseStore.ready}
				<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Loading profiles...</div>
			{:else if profiles.length === 0}
				<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No profiles in this workspace yet.</div>
			{:else}
				{#each profiles as profile (profile.id)}
					<article class="rounded-xl border bg-card p-4 shadow-sm">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<h2 class="truncate text-lg font-semibold">{profile.name}</h2>
									<span class="rounded-full border px-2 py-0.5 text-xs">{profile.type}</span>
									<span class="rounded-full border px-2 py-0.5 text-xs">{profile.classification}</span>
								</div>
								{#if profile.relationship}<p class="mt-2 text-sm"><span class="text-muted-foreground">Relationship:</span> {profile.relationship}</p>{/if}
								{#if profile.background}<p class="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{profile.background}</p>{/if}
								{#if profile.labels.length}<div class="mt-3 flex flex-wrap gap-1.5">{#each profile.labels as label}<span class="rounded-md bg-muted px-2 py-1 text-xs">{label}</span>{/each}</div>{/if}
							</div>
							<button class="rounded-md border p-2 text-destructive hover:bg-destructive/10" aria-label="Delete profile" onclick={() => baseStore.deleteProfile(profile.id)}><Trash2 class="size-4" /></button>
						</div>
					</article>
				{/each}
			{/if}
		</section>
	</div>
</div>
