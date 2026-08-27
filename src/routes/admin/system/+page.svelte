<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from '$lib/components/ui';
	import {
		Activity,
		HardDrive,
		Server,
		Globe,
		Play,
		Square,
		RotateCw,
		LoaderCircle,
		Terminal,
		TriangleAlert,
		Trash2,
		Save,
		ShieldAlert
	} from '@lucide/svelte';

	type ServiceStatus = { status?: string; running?: boolean; reachable?: boolean; service?: string | null };
	type SystemStatus = {
		panel?: ServiceStatus;
		hive?: ServiceStatus;
		tunnel?: ServiceStatus;
		disk?: { usedGB: number | null; freeGB: number | null; totalGB: number | null };
	};

	const SERVICES: { key: 'panel' | 'hive' | 'tunnel'; label: string; icon: typeof HardDrive; restartOnly?: boolean }[] = [
		{ key: 'panel', label: 'Panel', icon: HardDrive },
		{ key: 'hive', label: 'MCP Server', icon: Server },
		{ key: 'tunnel', label: 'Cloudflare Tunnel', icon: Globe, restartOnly: true }
	];

	function statusOf(svc?: ServiceStatus) {
		const text = svc?.status ?? (svc?.running ? 'Running' : svc ? 'Stopped' : 'Unknown');
		const lower = text.toLowerCase();
		const variant = lower.includes('running')
			? 'success'
			: lower.includes('block')
				? 'destructive'
				: lower.includes('not')
					? 'warning'
					: 'secondary';
		return { text, variant } as const;
	}

	let status = $state<SystemStatus | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state<string | null>(null);
	let controlError = $state<Record<string, string>>({});

	async function load() {
		loading = true;
		error = '';
		try {
			status = await api.get<SystemStatus>('/system/status');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load system status';
		} finally {
			loading = false;
		}
	}

	load();

	async function control(target: string, action: 'start' | 'stop' | 'restart') {
		const key = `${target}:${action}`;
		busy = key;
		controlError = { ...controlError, [target]: '' };
		try {
			await api.post('/system/control', { target, action });
			await load();
		} catch (err) {
			controlError = { ...controlError, [target]: err instanceof ApiError ? err.message : 'Action failed' };
		} finally {
			busy = null;
		}
	}

	const LOG_TABS: { key: string; label: string }[] = [
		{ key: 'panel-events', label: 'Panel events' },
		{ key: 'panel-errors', label: 'Panel errors' },
		{ key: 'panel-out', label: 'Panel stdout' },
		{ key: 'panel-err', label: 'Panel stderr' },
		{ key: 'hive-events', label: 'MCP events' },
		{ key: 'hive-errors', label: 'MCP errors' },
		{ key: 'hive-out', label: 'MCP stdout' },
		{ key: 'hive-err', label: 'MCP stderr' },
		{ key: 'tunnel-out', label: 'Tunnel stdout' },
		{ key: 'tunnel-err', label: 'Tunnel stderr' }
	];
	let activeLog = $state(LOG_TABS[0].key);
	let logLines = $state<string[]>([]);
	let logLoading = $state(false);
	let logError = $state('');

	async function loadLog(which: string) {
		activeLog = which;
		logLoading = true;
		logError = '';
		try {
			const res = await api.get<{ lines: string[]; error?: string }>(`/system/logs?which=${which}`);
			logLines = res.lines;
			if (res.error) logError = res.error;
		} catch (err) {
			logError = err instanceof ApiError ? err.message : 'Failed to load log';
			logLines = [];
		} finally {
			logLoading = false;
		}
	}

	loadLog(LOG_TABS[0].key);

	// --- Maintenance mode ---------------------------------------------------
	type MaintenanceStatus = { enabled: boolean; message: string; updatedBy: string | null; updatedAt: string | null };
	let maintenance = $state<MaintenanceStatus | null>(null);
	let maintenanceLoading = $state(true);
	let maintenanceSaving = $state(false);
	let maintenanceError = $state('');
	let maintenanceMessage = $state('');

	async function loadMaintenance() {
		maintenanceLoading = true;
		maintenanceError = '';
		try {
			maintenance = await api.get<MaintenanceStatus>('/maintenance-status');
			maintenanceMessage = maintenance.message;
		} catch (err) {
			maintenanceError = err instanceof ApiError ? err.message : 'Failed to load maintenance status';
		} finally {
			maintenanceLoading = false;
		}
	}
	loadMaintenance();

	async function setMaintenance(enabled: boolean) {
		maintenanceSaving = true;
		maintenanceError = '';
		try {
			maintenance = await api.patch<MaintenanceStatus>('/system/maintenance', {
				enabled,
				message: maintenanceMessage
			});
		} catch (err) {
			maintenanceError = err instanceof ApiError ? err.message : 'Save failed';
		} finally {
			maintenanceSaving = false;
		}
	}

	// --- Trash ----------------------------------------------------------------
	let retentionDays = $state<number | null>(null);
	let trashLoading = $state(true);
	let trashSaving = $state(false);
	let trashError = $state('');
	let emptying = $state(false);
	let emptyConfirm = $state(false);
	let emptyResult = $state('');

	async function loadTrash() {
		trashLoading = true;
		trashError = '';
		try {
			const res = await api.get<{ retentionDays: number }>('/system/trash-config');
			retentionDays = res.retentionDays;
		} catch (err) {
			trashError = err instanceof ApiError ? err.message : 'Failed to load trash settings';
		} finally {
			trashLoading = false;
		}
	}
	loadTrash();

	async function saveTrash(e: Event) {
		e.preventDefault();
		if (retentionDays == null) return;
		trashSaving = true;
		trashError = '';
		try {
			const res = await api.post<{ retentionDays: number }>('/system/trash-config', { retentionDays });
			retentionDays = res.retentionDays;
		} catch (err) {
			trashError = err instanceof ApiError ? err.message : 'Save failed';
		} finally {
			trashSaving = false;
		}
	}

	async function emptyTrash() {
		emptying = true;
		emptyConfirm = false;
		emptyResult = '';
		try {
			await api.post('/trash/empty');
			emptyResult = 'Main trash emptied.';
		} catch (err) {
			emptyResult = err instanceof ApiError ? err.message : 'Failed to empty trash';
		} finally {
			emptying = false;
		}
	}

	// --- Hard stop --------------------------------------------------------
	// Mirrors the backend's own two-factor guard exactly (typed phrase + a
	// separate password that only lives server-side) rather than adding any
	// extra client-side gate — the server is the actual authority here.
	type HardstopStatus = { ready: boolean; scriptExists: boolean; passwordConfigured: boolean; cloudMode: boolean };
	let hardstopStatus = $state<HardstopStatus | null>(null);
	let hardstopExpanded = $state(false);
	let confirmText = $state('');
	let hardstopPassword = $state('');
	let hardstopBusy = $state(false);
	let hardstopError = $state('');
	let hardstopResult = $state('');

	async function loadHardstopStatus() {
		try {
			hardstopStatus = await api.get<HardstopStatus>('/system/hardstop-status');
		} catch {
			hardstopStatus = null;
		}
	}
	loadHardstopStatus();

	async function runHardstop() {
		hardstopBusy = true;
		hardstopError = '';
		hardstopResult = '';
		try {
			await api.post('/system/hardstop', { confirmText, password: hardstopPassword });
			hardstopResult = 'Hard stop executed.';
			confirmText = '';
			hardstopPassword = '';
		} catch (err) {
			hardstopError = err instanceof ApiError ? err.message : 'Hard stop failed';
		} finally {
			hardstopBusy = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<Activity class="size-5 text-muted-foreground" />
				System
			</h1>
			<p class="text-sm text-muted-foreground">Service health, control, and logs.</p>
		</div>
		<Button variant="outline" size="sm" onclick={load} disabled={loading}>
			{#if loading}<LoaderCircle class="size-4 animate-spin" />{:else}Refresh{/if}
		</Button>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
			<LoaderCircle class="size-5 animate-spin" />
			Loading&hellip;
		</div>
	{:else if status}
		{#if status.disk}
			<Card>
				<CardHeader>
					<CardTitle>Disk (C:)</CardTitle>
					<CardDescription>
						{status.disk.usedGB ?? '?'} GB used of {status.disk.totalGB ?? '?'} GB &middot;
						{status.disk.freeGB ?? '?'} GB free
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full bg-primary"
							style="width: {status.disk.totalGB ? Math.min(100, ((status.disk.usedGB ?? 0) / status.disk.totalGB) * 100) : 0}%"
						></div>
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if !maintenanceLoading && maintenance}
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<CardTitle class="flex items-center gap-2">
							<TriangleAlert class="size-4 text-muted-foreground" />
							Maintenance mode
						</CardTitle>
						<Badge variant={maintenance.enabled ? 'warning' : 'secondary'}>
							{maintenance.enabled ? 'Active' : 'Off'}
						</Badge>
					</div>
					<CardDescription>
						Shows a warning banner panel-wide that files may be lost while active.
						{#if maintenance.updatedBy}Last changed by {maintenance.updatedBy}.{/if}
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-2">
					<textarea
						bind:value={maintenanceMessage}
						rows="2"
						class="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
					></textarea>
					{#if maintenanceError}<p class="text-sm text-destructive">{maintenanceError}</p>{/if}
					<div class="flex gap-2">
						{#if maintenance.enabled}
							<Button size="sm" variant="outline" disabled={maintenanceSaving} onclick={() => setMaintenance(false)}>
								{#if maintenanceSaving}<LoaderCircle class="size-4 animate-spin" />{/if}
								Turn off
							</Button>
						{:else}
							<Button size="sm" variant="outline" disabled={maintenanceSaving} onclick={() => setMaintenance(true)}>
								{#if maintenanceSaving}<LoaderCircle class="size-4 animate-spin" />{/if}
								Turn on
							</Button>
						{/if}
						<Button size="sm" variant="ghost" disabled={maintenanceSaving} onclick={() => setMaintenance(maintenance!.enabled)}>
							<Save class="size-4" />Save message
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			{#each SERVICES as svc (svc.key)}
				{@const st = statusOf(status[svc.key])}
				<Card>
					<CardHeader>
						<div class="flex items-center justify-between">
							<CardTitle class="flex items-center gap-2">
								<svc.icon class="size-4 text-muted-foreground" />
								{svc.label}
							</CardTitle>
							<Badge variant={st.variant}>{st.text}</Badge>
						</div>
					</CardHeader>
					<CardContent class="space-y-2">
						{#if controlError[svc.key]}
							<p class="text-sm text-destructive">{controlError[svc.key]}</p>
						{/if}
						<div class="flex gap-1.5">
							{#if !svc.restartOnly}
								<Button
									size="sm"
									variant="outline"
									disabled={busy === `${svc.key}:start`}
									onclick={() => control(svc.key, 'start')}
								>
									{#if busy === `${svc.key}:start`}<LoaderCircle class="size-4 animate-spin" />{:else}<Play class="size-4" />{/if}
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={busy === `${svc.key}:stop`}
									onclick={() => control(svc.key, 'stop')}
								>
									{#if busy === `${svc.key}:stop`}<LoaderCircle class="size-4 animate-spin" />{:else}<Square class="size-4" />{/if}
								</Button>
							{/if}
							<Button
								size="sm"
								variant="outline"
								disabled={busy === `${svc.key}:restart`}
								onclick={() => control(svc.key, 'restart')}
							>
								{#if busy === `${svc.key}:restart`}<LoaderCircle class="size-4 animate-spin" />{:else}<RotateCw class="size-4" />{/if}
								Restart
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>

		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Trash2 class="size-4 text-muted-foreground" />
					Trash
				</CardTitle>
				<CardDescription>Retention period for the main workspace trash, and manual purge.</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				{#if trashLoading}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderCircle class="size-4 animate-spin" />
						Loading&hellip;
					</div>
				{:else}
					<form class="flex flex-wrap items-end gap-2" onsubmit={saveTrash}>
						<div class="space-y-1.5">
							<label for="retention" class="text-sm font-medium">Retention (days)</label>
							<Input id="retention" type="number" min="1" class="w-28" bind:value={retentionDays} />
						</div>
						<Button type="submit" size="sm" disabled={trashSaving}>
							{#if trashSaving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save />{/if}
							Save
						</Button>
					</form>
					{#if trashError}<p class="text-sm text-destructive">{trashError}</p>{/if}

					<div class="border-t border-border pt-3">
						{#if emptyConfirm}
							<div class="flex items-center gap-2">
								<Button size="sm" variant="destructive" onclick={emptyTrash} disabled={emptying}>
									{#if emptying}<LoaderCircle class="size-4 animate-spin" />{/if}
									Confirm empty trash
								</Button>
								<Button size="sm" variant="ghost" onclick={() => (emptyConfirm = false)}>Cancel</Button>
							</div>
						{:else}
							<Button size="sm" variant="outline" onclick={() => (emptyConfirm = true)}>Empty main trash</Button>
						{/if}
						{#if emptyResult}<p class="mt-2 text-sm text-muted-foreground">{emptyResult}</p>{/if}
					</div>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Terminal class="size-4 text-muted-foreground" />
					Logs
				</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<div class="flex flex-wrap gap-1.5">
					{#each LOG_TABS as tab (tab.key)}
						<button
							class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors {activeLog === tab.key
								? 'border-primary bg-primary/15 text-primary'
								: 'border-border text-muted-foreground hover:bg-accent'}"
							onclick={() => loadLog(tab.key)}
						>
							{tab.label}
						</button>
					{/each}
				</div>
				<div class="h-80 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
					{#if logLoading}
						<div class="flex items-center gap-2 text-muted-foreground">
							<LoaderCircle class="size-4 animate-spin" />
							Loading&hellip;
						</div>
					{:else if logError}
						<p class="text-destructive">{logError}</p>
					{:else if logLines.length === 0}
						<p class="text-muted-foreground">No log lines.</p>
					{:else}
						{#each logLines as line, i (i)}
							<div class="whitespace-pre-wrap break-all text-muted-foreground">{line}</div>
						{/each}
					{/if}
				</div>
			</CardContent>
		</Card>

		{#if hardstopStatus}
			<Card class="border-destructive/40">
				<CardHeader>
					<button
						class="flex w-full items-center justify-between text-left"
						onclick={() => (hardstopExpanded = !hardstopExpanded)}
					>
						<CardTitle class="flex items-center gap-2 text-destructive">
							<ShieldAlert class="size-4" />
							Hard stop
						</CardTitle>
						<Badge variant={hardstopStatus.ready ? 'destructive' : 'secondary'}>
							{hardstopStatus.ready ? 'Ready' : 'Not configured'}
						</Badge>
					</button>
					<CardDescription>
						Runs the server's guarded hard-stop script. Destructive and hard to reverse — only use this
						if you know exactly what it does on this machine.
					</CardDescription>
				</CardHeader>
				{#if hardstopExpanded}
					<CardContent class="space-y-3">
						{#if !hardstopStatus.ready}
							<p class="text-sm text-muted-foreground">
								{#if !hardstopStatus.scriptExists}The hard-stop script isn't present on this server.{/if}
								{#if !hardstopStatus.passwordConfigured}The hard-stop password isn't configured on this server.{/if}
							</p>
						{:else}
							<div class="space-y-1.5">
								<label for="hardstop-confirm" class="text-sm font-medium">
									Type <code class="rounded bg-secondary px-1">RUN HARDSTOP</code> to confirm
								</label>
								<Input id="hardstop-confirm" bind:value={confirmText} autocomplete="off" />
							</div>
							<div class="space-y-1.5">
								<label for="hardstop-password" class="text-sm font-medium">Hard-stop password</label>
								<Input id="hardstop-password" type="password" bind:value={hardstopPassword} autocomplete="off" />
							</div>
							{#if hardstopError}<p class="text-sm text-destructive">{hardstopError}</p>{/if}
							{#if hardstopResult}<p class="text-sm text-success">{hardstopResult}</p>{/if}
							<Button
								variant="destructive"
								size="sm"
								disabled={hardstopBusy || confirmText !== 'RUN HARDSTOP' || !hardstopPassword}
								onclick={runHardstop}
							>
								{#if hardstopBusy}<LoaderCircle class="size-4 animate-spin" />{/if}
								Execute hard stop
							</Button>
						{/if}
					</CardContent>
				{/if}
			</Card>
		{/if}
	{/if}
</div>
