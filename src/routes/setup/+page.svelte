<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import { Button, Input, Card, CardContent } from '$lib/components/ui';
	import { CheckCircle2, HardDrive, LoaderCircle, Settings, Wrench, XCircle } from '@lucide/svelte';

	type SetupStep = {
		complete: boolean;
		configured?: boolean;
		bootstrapped?: boolean;
		title: string;
		description: string;
	};
	type SetupConfig = {
		setupComplete: boolean;
		needsSetup: boolean;
		currentStep: 'step1' | 'step2' | 'owner' | 'complete';
		coreRequired: string[];
		config: Record<string, string | number>;
		steps: { step1: SetupStep; step2: SetupStep; owner: SetupStep };
		addons: { id: string; label: string; required: boolean; status: string }[];
		notes: string[];
	};

	let loading = $state(true);
	let saving = $state(false);
	let bootstrapping = $state(false);
	let error = $state('');
	let saved = $state('');
	let model = $state<SetupConfig | null>(null);
	let activeStep = $state<'step1' | 'step2'>('step1');
	let testResults = $state<Record<string, { ok: boolean; message: string; status?: number }>>({});

	onMount(load);

	async function load() {
		loading = true;
		error = '';
		try {
			model = await api.get<SetupConfig>('/setup/config');
			if (model.setupComplete) {
				await goto('/login');
				return;
			}
			if (model.currentStep === 'owner') {
				await goto('/setup/owner');
				return;
			}
			activeStep = model.currentStep === 'step2' ? 'step2' : 'step1';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not load setup config';
		} finally {
			loading = false;
		}
	}

	function update(key: string, value: string) {
		if (!model) return;
		model.config = { ...model.config, [key]: value };
	}

	async function save(step: 'step1' | 'step2') {
		if (!model) return;
		saving = true;
		error = '';
		saved = '';
		try {
			await api.put('/setup/config', model.config);
			saved = step === 'step1' ? 'Step 1 saved.' : 'Step 2 paths saved.';
			await load();
			if (step === 'step1') activeStep = 'step2';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function bootstrap() {
		if (!model) return;
		bootstrapping = true;
		error = '';
		saved = '';
		try {
			await api.put('/setup/config', model.config);
			await api.post('/setup/bootstrap');
			await goto('/setup/owner');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Bootstrap failed';
		} finally {
			bootstrapping = false;
		}
	}

	async function test(target: string, value: string) {
		testResults = { ...testResults, [target]: { ok: false, message: 'Testing...' } };
		try {
			const res = await api.post<{ ok: boolean; message: string; status?: number }>('/setup/test-link', { target, value });
			testResults = { ...testResults, [target]: res };
		} catch (err) {
			testResults = { ...testResults, [target]: { ok: false, message: err instanceof ApiError ? err.message : 'Test failed' } };
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
	<div class="space-y-1">
		<h1 class="flex items-center gap-2 text-xl font-semibold"><Settings class="size-5" />OrbitFS V2 installer</h1>
		<p class="text-sm text-muted-foreground">This panel starts blank. Finish Step 1 and Step 2 before creating the first owner.</p>
	</div>

	{#if loading}
		<Card><CardContent class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" />Loading installer...</CardContent></Card>
	{:else if model}
		<div class="grid gap-3 md:grid-cols-3">
			<div class="rounded-lg border p-4 {activeStep === 'step1' ? 'border-primary bg-primary/5' : ''}">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Step 1</p>
				<p class="mt-1 font-medium">{model.steps.step1.title}</p>
				<p class="mt-1 text-sm text-muted-foreground">{model.steps.step1.description}</p>
				<p class="mt-3 text-xs {model.steps.step1.complete ? 'text-primary' : 'text-muted-foreground'}">{model.steps.step1.complete ? 'Complete' : 'Pending'}</p>
			</div>
			<div class="rounded-lg border p-4 {activeStep === 'step2' ? 'border-primary bg-primary/5' : ''}">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Step 2</p>
				<p class="mt-1 font-medium">{model.steps.step2.title}</p>
				<p class="mt-1 text-sm text-muted-foreground">{model.steps.step2.description}</p>
				<p class="mt-3 text-xs {model.steps.step2.complete ? 'text-primary' : 'text-muted-foreground'}">
					{#if model.steps.step2.complete}Complete{:else if model.steps.step2.configured}Saved, waiting for bootstrap{:else}Pending{/if}
				</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Finish</p>
				<p class="mt-1 font-medium">{model.steps.owner.title}</p>
				<p class="mt-1 text-sm text-muted-foreground">{model.steps.owner.description}</p>
				<p class="mt-3 text-xs {model.steps.owner.complete ? 'text-primary' : 'text-muted-foreground'}">{model.steps.owner.complete ? 'Complete' : 'Waiting for owner creation'}</p>
			</div>
		</div>

		{#if activeStep === 'step1'}
			<Card>
				<CardContent class="space-y-4 p-4">
					<div class="flex items-center gap-2">
						<Settings class="size-4" />
						<h2 class="font-semibold">Step 1: panel runtime</h2>
					</div>
					<div class="grid gap-3 md:grid-cols-2">
						<label class="space-y-1 text-sm"><span>Public panel URL</span><Input value={String(model.config.publicOrigin ?? '')} oninput={(e) => update('publicOrigin', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>Backend port</span><Input value={String(model.config.backendPort ?? '')} oninput={(e) => update('backendPort', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>API base</span><Input value={String(model.config.apiBase ?? '')} oninput={(e) => update('apiBase', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>Deploy mode</span><Input value={String(model.config.deployMode ?? '')} oninput={(e) => update('deployMode', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm md:col-span-2"><span>Licence API URL <span class="text-muted-foreground">(optional)</span></span><Input value={String(model.config.licenseApiUrl ?? '')} oninput={(e) => update('licenseApiUrl', e.currentTarget.value)} /></label>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button onclick={() => save('step1')} disabled={saving}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{/if}Save Step 1</Button>
						<Button variant="outline" onclick={() => test('license', String(model?.config.licenseApiUrl ?? ''))}>Test licence API</Button>
					</div>
				</CardContent>
			</Card>
		{:else}
			<Card>
				<CardContent class="space-y-4 p-4">
					<div class="flex items-center gap-2">
						<HardDrive class="size-4" />
						<h2 class="font-semibold">Step 2: core files and paths</h2>
					</div>
					<div class="grid gap-3">
						<label class="space-y-1 text-sm"><span>Storage root</span><Input value={String(model.config.storageRoot ?? '')} oninput={(e) => update('storageRoot', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>Main workspace root</span><Input value={String(model.config.mainWorkspaceRoot ?? '')} oninput={(e) => update('mainWorkspaceRoot', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>Branch workspace root</span><Input value={String(model.config.branchWorkspaceRoot ?? '')} oninput={(e) => update('branchWorkspaceRoot', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>System root</span><Input value={String(model.config.systemRoot ?? '')} oninput={(e) => update('systemRoot', e.currentTarget.value)} /></label>
						<label class="space-y-1 text-sm"><span>Plugin/add-on root</span><Input value={String(model.config.pluginRoot ?? '')} oninput={(e) => update('pluginRoot', e.currentTarget.value)} /></label>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" onclick={() => (activeStep = 'step1')}>Back to Step 1</Button>
						<Button onclick={() => save('step2')} disabled={saving}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{/if}Save Step 2</Button>
						<Button variant="destructive" onclick={bootstrap} disabled={bootstrapping}>{#if bootstrapping}<LoaderCircle class="size-4 animate-spin" />{/if}Bootstrap install</Button>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" onclick={() => test('storage', String(model?.config.storageRoot ?? ''))}>Test storage</Button>
						<Button variant="outline" onclick={() => test('plugins', String(model?.config.pluginRoot ?? ''))}>Test plugin path</Button>
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if saved}<p class="text-sm text-primary">{saved}</p>{/if}
		{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
		{#each Object.entries(testResults) as [key, result]}
			<p class="flex items-center gap-2 text-sm {result.ok ? 'text-primary' : 'text-destructive'}">
				{#if result.ok}<CheckCircle2 class="size-4" />{:else}<XCircle class="size-4" />{/if}
				{key}: {result.message}{result.status ? ` (${result.status})` : ''}
			</p>
		{/each}

		<Card>
			<CardContent class="space-y-3 p-4">
				<div class="flex items-center gap-2">
					<Wrench class="size-4" />
					<h2 class="font-semibold">Package state</h2>
				</div>
				<div class="grid gap-2 md:grid-cols-2">
					{#each model.addons as addon}
						<div class="rounded-md border p-3 text-sm">
							<p class="font-medium">{addon.label}</p>
							<p class="text-muted-foreground">{addon.status}</p>
						</div>
					{/each}
				</div>
				{#each model.notes as note}
					<p class="text-sm text-muted-foreground">{note}</p>
				{/each}
			</CardContent>
		</Card>
	{/if}
</div>
