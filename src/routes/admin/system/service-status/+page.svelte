<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Globe, LoaderCircle, Play, RefreshCw, RotateCw, Server, Square, Wifi } from '@lucide/svelte';
	type ServiceStatus = {
		label?: string; role?: string; status?: string; running?: boolean; reachable?: boolean;
		service?: string | null; startMode?: string; url?: string; port?: number; apiBase?: string;
		controls?: string[]; licensed?: boolean; blocked?: boolean; future?: boolean; reason?: string | null;
		installed?: boolean; attached?: boolean; configured?: boolean; online?: boolean; available?: boolean; standby?: boolean;
		enabledWorkspaces?: number; knownClients?: number; database?: string; checkedAt?: string; error?: string; exitCode?: number; processId?: number;
		lastAction?: { action?: string; ok?: boolean; message?: string; at?: string };
		health?: { ok?: boolean; status?: number; message?: string; checkedAt?: string } | null;
		events?: Array<{ at?: string; level?: string; id?: number; message?: string }>;
		fullShutdown?: boolean;
	};
	type SystemStatus = { checkedAt?: string; panel?: ServiceStatus; mcp?: ServiceStatus; tunnel?: ServiceStatus; licence?: ServiceStatus };
	type ServiceKey = 'panel' | 'mcp' | 'tunnel';
	const services: { key: ServiceKey; fallback: string; icon: typeof Server }[] = [
		{ key: 'panel', fallback: 'Panel shell', icon: Wifi },
		{ key: 'mcp', fallback: 'MCP server', icon: Server },
		{ key: 'tunnel', fallback: 'Cloudflare tunnel', icon: Globe }
	];
	let status = $state<SystemStatus | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state<string | null>(null);
	let controlErrors = $state<Record<string, string>>({});
	function isOnline(service?: ServiceStatus) { return Boolean(service?.running || service?.reachable); }
	function isStandby(service?: ServiceStatus) { return Boolean(service?.standby && !isOnline(service)); }
	function statusText(service?: ServiceStatus) {
		if (!service) return 'Unknown';
		if (service.fullShutdown) return 'Shutdown';
		if (service.blocked) return 'Blocked';
		return service.status ?? (isOnline(service) ? 'Online' : 'Offline');
	}
	function statusVariant(service?: ServiceStatus) {
		if (service?.fullShutdown || service?.blocked) return 'destructive';
		return isOnline(service) ? 'success' : isStandby(service) ? 'warning' : 'destructive';
	}
	function controlsFor(service?: ServiceStatus) {
		return (service?.controls ?? []).filter((item) => ['start', 'stop', 'restart'].includes(item));
	}
	function onlineCount() { return services.filter((item) => isOnline(status?.[item.key])).length; }
	function standbyCount() { return services.filter((item) => isStandby(status?.[item.key])).length; }
	function blockedCount() { return services.filter((item) => status?.[item.key]?.blocked).length; }
	function offlineCount() { return services.filter((item) => !isOnline(status?.[item.key]) && !isStandby(status?.[item.key]) && !status?.[item.key]?.blocked).length; }
	async function load() {
		loading = true; error = '';
		try { status = await api.get<SystemStatus>('/system/status'); }
		catch (err) { error = err instanceof ApiError ? err.message : 'Failed to load system monitor'; }
		finally { loading = false; }
	}
	load();
	async function control(target: string, action: 'start' | 'stop' | 'restart') {
		const key = target + ':' + action;
		busy = key;
		controlErrors = { ...controlErrors, [target]: '' };
		try {
			const result = await api.post<{ message?: string; queued?: boolean }>('/system/control', { target, action });
			if (target === 'panel' && action === 'restart') {
				controlErrors = { ...controlErrors, [target]: result.message || 'Panel restart queued. Refresh in a few seconds.' };
				setTimeout(load, 7000);
			} else await load();
		} catch (err) {
			controlErrors = { ...controlErrors, [target]: err instanceof ApiError ? err.message : 'Action failed' };
		} finally { busy = null; }
	}
</script>

<div class="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
	<section class="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm">
		<div class="absolute -right-12 -top-16 size-48 rounded-full bg-primary/10 blur-3xl"></div>
		<div class="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-primary">OrbitFS control room</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">System monitor</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">Live service state, connection health, safe controls, and add-on licensing blocks.</p>
			</div>
			<div class="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
				<div class="rounded-xl border bg-background/60 px-3 py-2"><div class="text-lg font-semibold">{onlineCount()}</div><div class="text-muted-foreground">online</div></div>
				<div class="rounded-xl border bg-background/60 px-3 py-2"><div class="text-lg font-semibold">{standbyCount()}</div><div class="text-muted-foreground">standby</div></div>
				<div class="rounded-xl border bg-background/60 px-3 py-2"><div class="text-lg font-semibold">{offlineCount()}</div><div class="text-muted-foreground">offline</div></div>
				<div class="rounded-xl border bg-background/60 px-3 py-2"><div class="text-lg font-semibold">{blockedCount()}</div><div class="text-muted-foreground">blocked</div></div>
			</div>
		</div>
	</section>
	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>{/if}
	<div class="flex items-center justify-between gap-3">
		<p class="text-xs text-muted-foreground">Last checked: {status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : 'not checked'}</p>
		<Button variant="outline" size="sm" onclick={load} disabled={loading}>{#if loading}<LoaderCircle class="size-4 animate-spin" />{:else}<RefreshCw class="size-4" />{/if}Refresh</Button>
	</div>
	{#if loading && !status}
		<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground"><LoaderCircle class="size-5 animate-spin" />Loading monitor&hellip;</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
			{#each services as item (item.key)}
				{@const service = status?.[item.key]}
				{@const online = isOnline(service)}
				{@const standby = isStandby(service)}
				<Card class="group overflow-hidden border-border/80 bg-card/90 shadow-sm transition hover:border-primary/40 hover:shadow-lg">
					<div class="h-1.5 {online ? 'bg-emerald-400' : standby ? 'bg-amber-400' : service?.blocked ? 'bg-red-500' : 'bg-red-400'}"></div>
					<CardHeader class="pb-3">
						<div class="flex items-start justify-between gap-3">
							<div class="flex min-w-0 items-center gap-3">
								<div class="grid size-12 place-items-center rounded-2xl border {online ? 'border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_28px_rgba(16,185,129,0.38)]' : standby ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_28px_rgba(245,158,11,0.28)]' : 'border-red-400/60 bg-red-500/10 shadow-[0_0_28px_rgba(239,68,68,0.38)]'}"> 
									<item.icon class="size-5 {online ? 'text-emerald-300' : standby ? 'text-amber-300' : 'text-red-300'}" />
								</div>
								<div class="min-w-0"><CardTitle class="truncate text-base">{service?.label || item.fallback}</CardTitle><p class="text-xs text-muted-foreground">{service?.role || 'Runtime component'}</p></div>
							</div>
							<Badge variant={statusVariant(service)}>{statusText(service)}</Badge>
						</div>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="grid gap-2 rounded-xl border bg-background/45 p-3 text-xs">
							<div class="flex justify-between gap-3"><span class="text-muted-foreground">Service</span><span class="truncate text-right">{service?.service || 'Not configured'}</span></div>
							{#if service?.startMode}<div class="flex justify-between gap-3"><span class="text-muted-foreground">Start mode</span><span>{service.startMode}</span></div>{/if}
							{#if service?.url}<div class="flex justify-between gap-3"><span class="text-muted-foreground">URL</span><span class="truncate text-right">{service.url}</span></div>{/if}
							{#if service?.port}<div class="flex justify-between gap-3"><span class="text-muted-foreground">Port</span><span>{service.port}</span></div>{/if}
							{#if service?.apiBase}<div class="flex justify-between gap-3"><span class="text-muted-foreground">API base</span><span>{service.apiBase}</span></div>{/if}
							{#if service?.licensed !== undefined}<div class="flex justify-between gap-3"><span class="text-muted-foreground">Licence</span><span>{service.licensed ? 'Allowed' : 'Blocked'}</span></div>{/if}
						</div>
						{#if item.key === 'mcp'}
							<div class="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
								<div class="mb-2 font-semibold text-primary">MCP connection</div>
								<div class="grid grid-cols-2 gap-x-3 gap-y-1">
									<span class="text-muted-foreground">Installed</span><span>{service?.installed ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Licensed</span><span>{service?.licensed ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Attached</span><span>{service?.attached ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Configured</span><span>{service?.configured ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Online</span><span>{service?.online ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Available</span><span>{service?.available ? 'yes' : 'no'}</span>
									<span class="text-muted-foreground">Workspaces</span><span>{service?.enabledWorkspaces ?? 0}</span>
									<span class="text-muted-foreground">Clients</span><span>{service?.knownClients ?? 0}</span>
									<span class="text-muted-foreground">Database</span><span>{service?.database || 'unknown'}</span>
								</div>
							</div>
						{/if}
						{#if service?.reason}<div class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{service.reason}</div>{/if}
						<div class="rounded-xl border bg-background/45 p-3 text-xs">
							<div class="mb-2 font-semibold">Diagnostics</div>
							<div class="space-y-1">
								<div class="flex justify-between gap-3"><span class="text-muted-foreground">Process</span><span>{service?.processId || 'none'} · exit {service?.exitCode ?? 'unknown'}</span></div>
								{#if service?.health}<div class="flex justify-between gap-3"><span class="text-muted-foreground">Health check</span><span class={service.health.ok ? 'text-emerald-300' : 'text-destructive'}>{service.health.ok ? 'Passed' : 'Failed'}{service.health.status ? ` · HTTP ${service.health.status}` : ''}</span></div>{/if}
								{#if service?.lastAction}<div class="mt-2 rounded-md border p-2 {service.lastAction.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/10'}"><div class="font-medium">Last action: {service.lastAction.action}</div><div class="mt-1 break-words text-muted-foreground">{service.lastAction.message}</div><div class="mt-1 text-[11px] text-muted-foreground">{service.lastAction.at ? new Date(service.lastAction.at).toLocaleString() : ''}</div></div>{/if}
								{#if service?.error}<div class="mt-2 break-words text-destructive">{service.error}</div>{/if}
								{#if service?.health && !service.health.ok}<div class="mt-2 break-words text-destructive">{service.health.message}</div>{/if}
								{#if service?.events?.length}<details class="mt-2"><summary class="cursor-pointer font-medium">Recent Windows events ({service.events.length})</summary><div class="mt-2 max-h-40 space-y-2 overflow-auto">{#each service.events as event}<div class="rounded border p-2"><div class="text-[11px] text-muted-foreground">{event.level || 'Event'} · {event.at ? new Date(event.at).toLocaleString() : ''}</div><div class="mt-1 break-words">{event.message}</div></div>{/each}</div></details>{/if}
							</div>
						</div>
						{#if controlErrors[item.key]}<p class="text-sm text-destructive">{controlErrors[item.key]}</p>{/if}
						<div class="flex flex-wrap gap-2">
							{#each controlsFor(service) as action}
								<Button size="sm" variant="outline" class="rounded-full" disabled={busy !== null || (service?.blocked && (action === 'start' || action === 'restart'))} onclick={() => control(item.key, action as 'start' | 'stop' | 'restart')}>
									{#if busy === item.key + ':' + action}<LoaderCircle class="size-4 animate-spin" />{:else if action === 'start'}<Play class="size-4" />{:else if action === 'stop'}<Square class="size-4" />{:else}<RotateCw class="size-4" />{/if}
									{action}
								</Button>
							{/each}
							{#if controlsFor(service).length === 0}<span class="text-xs text-muted-foreground">Status only</span>{/if}
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
