<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from '$lib/components/ui';
	import { Download, Upload, RefreshCw, LoaderCircle, PackageCheck, Server, ShieldCheck, History } from '@lucide/svelte';

	type ComponentInfo = { id: string; product: string; packageType: string; version: string; service?: string | null };
	type ReleaseInfo = { releaseId: string; name?: string; nextVersion?: string; notes?: string; channel?: string; publishedAt?: string | null; status: string; error?: string | null; rolledBack?: boolean; summary?: { added?: number; modified?: number; deleted?: number; total?: number } | null; components?: Array<{ component?: string; name?: string; packageType?: string; currentVersion?: string; nextVersion?: string; summary?: { total?: number } }> | null; releaseComponents?: Array<{ component?: string; name?: string; packageType?: string; currentVersion?: string; nextVersion?: string; summary?: { total?: number } }> | null; completedAt?: string };
	const releaseComponents = (item: ReleaseInfo) => item.releaseComponents || item.components || [];
	type UpdateStatus = {
		agentInstalled: boolean;
		agentRoot: string;
		config: { managerUrl: string; channel: string; autoApply: boolean; pollMinutes: number } | null;
		installation?: { installationId: string; generatedAt: string; machine: { hostname: string; platform: string; arch: string }; components: ComponentInfo[] } | null;
		lastRun?: { checkedInAt?: string; results?: ReleaseInfo[] } | null;
		history?: ReleaseInfo[];
		lastManualApply?: { completedAt?: string; result?: { ok: boolean; rolledBack?: boolean; error?: string } } | null;
		task?: { installed: boolean; enabled: boolean };
		paired?: boolean;
		registered?: boolean;
	};

	let status = $state<UpdateStatus | null>(null);
	let loading = $state(true);
	let busy = $state('');
	let error = $state('');
	let message = $state('');
	let channel = $state('stable');
	let autoApply = $state(false);
	let pollMinutes = $state(1440);
	let uploadProgress = $state(0);
	let autoInstallAttempted = $state(false);

	async function load() {
		loading = true; error = '';
		try {
			status = await api.get<UpdateStatus>('/addons/updates/status');
			channel = status.config?.channel || 'stable';
			autoApply = Boolean(status.config?.autoApply);
			pollMinutes = status.config?.pollMinutes || 1440;
			if (!status.agentInstalled && !autoInstallAttempted) { autoInstallAttempted = true; queueMicrotask(() => installAgent()); }
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load update status';
		} finally { loading = false; }
	}
	load();

	async function action(name: 'check' | 'apply') {
		busy = name; error = ''; message = '';
		try {
			const result = await api.post<{ assignments?: Array<{ status: string }> }>(`/addons/updates/${name}`);
			message = name === 'check'
				? `${result.assignments?.length || 0} update assignment(s) found.`
				: 'Update operation completed. Restart may be required before changes apply.';
			await load();
		} catch (err) { error = err instanceof ApiError ? err.message : 'Update action failed'; }
		finally { busy = ''; }
	}

	async function installAgent() {
		busy = 'install-agent'; error = ''; message = '';
		try { await api.post('/addons/updates/install-agent', { channel }); message = 'Update Agent installed, registered, and connected to the Update Manager.'; await load(); }
		catch (err) { error = err instanceof ApiError ? err.message : 'Agent installation failed'; }
		finally { busy = ''; }
	}

	async function confirmAgent() {
		busy = 'confirm-agent'; error = ''; message = '';
		try { await api.post('/addons/updates/confirm-agent'); message = 'Agent installation checked.'; await load(); }
		catch (err) { error = err instanceof ApiError ? err.message : 'Agent confirmation failed'; }
		finally { busy = ''; }
	}


	async function saveSettings() {
		busy = 'settings'; error = ''; message = '';
		try {
			await api.patch('/addons/updates/settings', { channel, autoApply, pollMinutes });
			message = 'Update settings saved.'; await load();
		} catch (err) { error = err instanceof ApiError ? err.message : 'Settings could not be saved'; }
		finally { busy = ''; }
	}

	async function uploadPackage(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		busy = 'upload'; error = ''; message = ''; uploadProgress = 0;
		try {
			await api.uploadResult('/addons/updates/package/apply', file, { 'X-File-Name': file.name }, value => (uploadProgress = value));
			message = 'Package applied. Restart may be required before changes apply.'; await load();
		} catch (err) { error = err instanceof ApiError ? err.message : 'Package apply failed'; }
		finally { busy = ''; input.value = ''; }
	}
</script>
<div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<Download class="size-5 text-muted-foreground" />Updates
			</h1>
			<p class="text-sm text-muted-foreground">Check, review, apply, or manually upload OrbitFS release packages.</p>
		</div>
		<Button variant="outline" size="sm" onclick={load} disabled={loading || Boolean(busy)}>
			{#if loading}<LoaderCircle class="size-4 animate-spin" />{:else}<RefreshCw class="size-4" />Refresh{/if}
		</Button>
	</div>

	{#if status && !status.agentInstalled}
	<Card><CardHeader><CardTitle>Install Update Agent</CardTitle><CardDescription>Install the bundled background agent and scheduled task on this server.</CardDescription></CardHeader><CardContent class="flex flex-wrap gap-2"><Button onclick={installAgent} disabled={Boolean(busy)}>{busy === 'install-agent' ? 'Installing…' : 'Install agent'}</Button><Button variant="outline" onclick={confirmAgent} disabled={Boolean(busy)}>Confirm installation</Button></CardContent></Card>
	{/if}


	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>{/if}
	{#if message}<div class="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{message}</div>{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-20 text-muted-foreground"><LoaderCircle class="size-5 animate-spin" />Loading update agent&hellip;</div>
	{:else if status}
		<div class="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader><CardTitle>Agent</CardTitle><CardDescription>Local update runtime</CardDescription></CardHeader>
				<CardContent class="space-y-2"><Badge variant={status.agentInstalled ? 'success' : 'destructive'}>{status.agentInstalled ? 'Installed' : 'Missing'}</Badge><div class="text-xs text-muted-foreground">Task: {status.task?.installed ? (status.task.enabled ? 'Enabled' : 'Disabled') : 'Missing'}</div></CardContent>
			</Card>
			<Card>
				<CardHeader><CardTitle>Channel</CardTitle><CardDescription>Release stream</CardDescription></CardHeader>
				<CardContent><Badge variant="secondary">{status.config?.channel || 'Not configured'}</Badge></CardContent>
			</Card>
			<Card>
				<CardHeader><CardTitle>Target</CardTitle><CardDescription>{status.installation?.machine.hostname || 'Not registered'}</CardDescription></CardHeader>
				<CardContent class="text-xs text-muted-foreground">{status.installation?.installationId || 'No installation ID'}</CardContent>
			</Card>
		</div>
		<Card>
			<CardHeader><CardTitle class="flex items-center gap-2"><Server class="size-4" />Installed components</CardTitle></CardHeader>
			<CardContent class="space-y-2">
				{#each status.installation?.components || [] as component (component.id)}
					<div class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
						<div><strong>{component.id}</strong><div class="text-xs text-muted-foreground">{component.packageType}</div></div>
						<Badge variant="outline">v{component.version}</Badge>
					</div>
				{/each}
			</CardContent>
		</Card>

		<div class="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader><CardTitle class="flex items-center gap-2"><PackageCheck class="size-4" />Available updates</CardTitle><CardDescription>Review release details before applying.</CardDescription></CardHeader>
				<CardContent class="space-y-3">
					<div class="flex flex-wrap gap-2"><Button variant="outline" onclick={() => action('check')} disabled={!status.config || Boolean(busy)}>{#if busy === 'check'}<LoaderCircle class="size-4 animate-spin" />{/if}Check now</Button><Button onclick={() => action('apply')} disabled={!status.config || Boolean(busy) || !status.lastRun?.results?.some(item => item.status === 'available')}>{#if busy === 'apply'}<LoaderCircle class="size-4 animate-spin" />{/if}Apply available</Button></div>
					{#each (status.lastRun?.results || []).filter(item => item.status === 'available') as item (item.releaseId)}
						<div class="rounded-md border p-3 text-sm"><div class="flex items-start justify-between gap-3"><div><strong>{item.name || 'OrbitFS update'}</strong><div class="text-xs text-muted-foreground">Version {item.nextVersion || 'unknown'} · {item.channel || status.config?.channel}</div></div><Badge variant="secondary">Available</Badge></div>{#if item.notes}<p class="mt-3 whitespace-pre-wrap text-sm">{item.notes}</p>{/if}<div class="mt-3 space-y-1">{#each releaseComponents(item) as component}<div class="flex justify-between rounded border px-2 py-1 text-xs"><span>{component.name || component.component}</span><span class="text-muted-foreground">{component.currentVersion || '?'} → {component.nextVersion || item.nextVersion || '?'} · {component.summary?.total || 0} files</span></div>{/each}</div>{#if item.summary}<div class="mt-2 text-xs text-muted-foreground">{item.summary.total || 0} changes · {item.summary.added || 0} added · {item.summary.modified || 0} modified · {item.summary.deleted || 0} deleted</div>{/if}</div>
					{:else}<p class="text-sm text-muted-foreground">No updates currently available.</p>{/each}
				</CardContent>
			</Card>
			<Card>
				<CardHeader><CardTitle class="flex items-center gap-2"><Upload class="size-4" />Manual package</CardTitle><CardDescription>Upload a signed `.orbitupdate` package and apply it locally.</CardDescription></CardHeader>
				<CardContent>
					<label class="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm hover:bg-muted/40">
						{#if busy === 'upload'}<LoaderCircle class="size-4 animate-spin" />Applying {uploadProgress}%{:else}<Upload class="size-4" />Choose package{/if}
						<input class="hidden" type="file" accept=".orbitupdate,application/zip" onchange={uploadPackage} disabled={Boolean(busy)} />
					</label>
				</CardContent>
			</Card>
		</div>
		<Card>
			<CardHeader><CardTitle class="flex items-center gap-2"><ShieldCheck class="size-4" />Update settings</CardTitle><CardDescription>Automatic application remains off unless explicitly enabled.</CardDescription></CardHeader>
			<CardContent class="grid gap-4 md:grid-cols-3">
				<label class="space-y-1.5 text-sm"><span>Channel</span><select class="h-10 w-full rounded-md border bg-background px-3" bind:value={channel}><option value="dev">Dev</option><option value="beta">Beta</option><option value="stable">Stable</option></select></label>
				<label class="space-y-1.5 text-sm"><span>Poll interval (minutes)</span><Input type="number" min="1" max="1440" bind:value={pollMinutes} /></label>
				<label class="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" bind:checked={autoApply} />Apply assigned updates automatically</label>
				<div class="md:col-span-3"><Button size="sm" onclick={saveSettings} disabled={Boolean(busy)}>{#if busy === 'settings'}<LoaderCircle class="size-4 animate-spin" />{/if}Save settings</Button></div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader><CardTitle class="flex items-center gap-2"><History class="size-4" />Update history</CardTitle><CardDescription>Updates applied to this installation.</CardDescription></CardHeader>
			<CardContent class="space-y-3 text-sm">
				{#each status.history || [] as item (item.releaseId + (item.completedAt || ''))}
					<div class="rounded-md border p-3"><div class="flex items-start justify-between gap-3"><div><strong>{item.name || item.releaseId}</strong><div class="text-xs text-muted-foreground">Version {item.nextVersion || 'unknown'}{item.completedAt ? ' · ' + new Date(item.completedAt).toLocaleString() : ''}</div></div><Badge variant={item.status === 'deployed' ? 'success' : item.status === 'failed' ? 'destructive' : 'secondary'}>{item.rolledBack ? 'rolled back' : item.status}</Badge></div>{#if item.notes}<p class="mt-2 whitespace-pre-wrap">{item.notes}</p>{/if}<div class="mt-2 flex flex-wrap gap-1">{#each releaseComponents(item) as component}<Badge variant="outline">{component.name || component.component} {component.currentVersion || '?'} → {component.nextVersion || item.nextVersion || '?'}</Badge>{/each}</div>{#if item.error}<p class="mt-2 text-xs text-destructive">{item.error}</p>{/if}</div>
				{:else}<p class="text-muted-foreground">No completed updates recorded yet.</p>{/each}
				{#if status.lastManualApply}<p class="text-xs text-muted-foreground">Last manual package: {status.lastManualApply.completedAt || 'unknown'} · {status.lastManualApply.result?.ok ? 'successful' : 'failed'}{status.lastManualApply.result?.rolledBack ? ' · rolled back' : ''}</p>{/if}
			</CardContent>
		</Card>
	{/if}
</div>
