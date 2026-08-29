<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui';
	import { Cloud, GitBranch, RefreshCw, LoaderCircle, Server, ShieldCheck } from '@lucide/svelte';
	type DeploymentStatus = {
		platform:string; environment:string; branch:string; commit:string|null;
		commitMessage:string|null; deploymentUrl:string; productionUrl:string;
		provider:string; managed:boolean; checkedAt:string;
	};
	let status = $state<DeploymentStatus|null>(null);
	let loading = $state(true);
	let error = $state('');
	async function load() {
		loading = true; error = '';
		try { status = await api.get<DeploymentStatus>('/system/deployment-status'); }
		catch (err) { error = err instanceof ApiError ? err.message : 'Failed to load deployment status'; }
		finally { loading = false; }
	}
	load();
</script>

<div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div><h1 class="flex items-center gap-2 text-xl font-semibold"><Cloud class="size-5" />Updates</h1>
		<p class="text-sm text-muted-foreground">OrbitFS cloud deployments are managed by GitHub and Vercel.</p></div>		<Button variant="outline" size="sm" onclick={load} disabled={loading}>
			{#if loading}<LoaderCircle class="size-4 animate-spin" />{:else}<RefreshCw class="size-4" />Refresh{/if}
		</Button>
	</div>
	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>{/if}
	{#if loading}
		<div class="flex items-center justify-center gap-2 py-20 text-muted-foreground"><LoaderCircle class="size-5 animate-spin" />Loading deployment&hellip;</div>
	{:else if status}
		<div class="grid gap-4 md:grid-cols-3">
			<Card><CardHeader><CardTitle class="flex items-center gap-2"><Server class="size-4" />Platform</CardTitle><CardDescription>Runtime provider</CardDescription></CardHeader>
			<CardContent><Badge variant="success">{status.platform}</Badge><p class="mt-2 text-xs text-muted-foreground">{status.environment}</p></CardContent></Card>
			<Card><CardHeader><CardTitle class="flex items-center gap-2"><GitBranch class="size-4" />Source</CardTitle><CardDescription>Deployment branch</CardDescription></CardHeader>
			<CardContent><Badge variant="secondary">{status.branch}</Badge><p class="mt-2 font-mono text-xs text-muted-foreground">{status.commit?.slice(0,12) || 'local build'}</p></CardContent></Card>
			<Card><CardHeader><CardTitle class="flex items-center gap-2"><ShieldCheck class="size-4" />Update model</CardTitle><CardDescription>Cloud-managed releases</CardDescription></CardHeader>
			<CardContent><Badge variant="outline">{status.provider}</Badge><p class="mt-2 text-xs text-muted-foreground">No Windows update agent required.</p></CardContent></Card>
		</div>		<Card>
			<CardHeader><CardTitle>Current deployment</CardTitle><CardDescription>Production and build metadata for this Vercel release.</CardDescription></CardHeader>
			<CardContent class="space-y-3 text-sm">
				<div><span class="text-muted-foreground">Production URL</span><div class="font-mono text-xs break-all">{status.productionUrl}</div></div>
				<div><span class="text-muted-foreground">Deployment URL</span><div class="font-mono text-xs break-all">{status.deploymentUrl}</div></div>
				{#if status.commitMessage}<div><span class="text-muted-foreground">Commit</span><div>{status.commitMessage}</div></div>{/if}
				<div class="text-xs text-muted-foreground">Checked {new Date(status.checkedAt).toLocaleString()}</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader><CardTitle>How updates apply</CardTitle><CardDescription>Cloud OrbitFS does not install local release packages.</CardDescription></CardHeader>
			<CardContent class="text-sm text-muted-foreground">
				Changes pushed to the configured GitHub branch are built by Vercel and promoted as deployments. MCP/APEX package/update controls will return when those cloud add-ons are ported.
			</CardContent>
		</Card>
	{/if}
</div>