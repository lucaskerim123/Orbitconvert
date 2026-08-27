<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import { Button, Card, CardContent } from '$lib/components/ui';
	import { CheckCircle2, Cloud, Database, LoaderCircle, UserPlus } from '@lucide/svelte';

	type SetupConfig = {
		setupComplete:boolean; needsSetup:boolean; currentStep:'owner'|'complete';
		config:Record<string,string|number>;
		steps:{ step1:{title:string;description:string;complete:boolean}; step2:{title:string;description:string;complete:boolean}; owner:{title:string;description:string;complete:boolean} };
		notes:string[];
	};
	let loading = $state(true);
	let error = $state('');
	let model = $state<SetupConfig|null>(null);
	onMount(load);
	async function load() {
		loading = true; error = '';
		try {
			model = await api.get<SetupConfig>('/setup/config');
			if (model.setupComplete) await goto('/login');
		} catch (err) { error = err instanceof ApiError ? err.message : 'Could not load setup status'; }
		finally { loading = false; }
	}
</script>

<div class="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
	<div><h1 class="text-xl font-semibold">OrbitFS Cloud Setup</h1>
	<p class="text-sm text-muted-foreground">Vercel and Supabase provide the runtime, database and workspace storage for this installation.</p></div>	{#if loading}
		<Card><CardContent class="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" />Checking cloud setup…</CardContent></Card>
	{:else if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{:else if model}
		<div class="grid gap-3 md:grid-cols-2">
			<Card><CardContent class="space-y-2 p-5"><div class="flex items-center gap-2 font-medium"><Cloud class="size-4" />Vercel runtime</div><p class="text-sm text-muted-foreground">{model.steps.step1.description}</p><div class="flex items-center gap-1 text-sm text-success"><CheckCircle2 class="size-4" />Ready</div></CardContent></Card>
			<Card><CardContent class="space-y-2 p-5"><div class="flex items-center gap-2 font-medium"><Database class="size-4" />Supabase database & storage</div><p class="text-sm text-muted-foreground">{model.steps.step2.description}</p><div class="flex items-center gap-1 text-sm text-success"><CheckCircle2 class="size-4" />Ready</div></CardContent></Card>
		</div>
		<Card><CardContent class="space-y-4 p-5">
			<div class="flex items-center gap-2 font-medium"><UserPlus class="size-4" />{model.steps.owner.title}</div>
			<p class="text-sm text-muted-foreground">{model.steps.owner.description}</p>
			<div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
				<div>API: <span class="font-mono">{model.config.apiBase}</span></div>
				<div>Storage: <span class="font-mono">orbitfs-files</span></div>
				<div>Runtime: <span class="font-mono">Vercel</span></div>
				<div>Database: <span class="font-mono">Supabase Postgres</span></div>
			</div>
			<Button onclick={() => goto('/setup/owner')}>Create first Owner</Button>
		</CardContent></Card>
	{/if}
</div>