<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { addons as addonsStore } from '$lib/addons.svelte';
	import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { Puzzle, LoaderCircle, Upload, RefreshCw, HardDriveDownload, Wrench, ShieldCheck, Trash2, PlugZap, Settings2 } from '@lucide/svelte';

	type AdminAddon = {
		id: string;
		name: string;
		description: string;
		installed: boolean;
		attached: boolean;
		parked: boolean;
		status: 'registered' | 'uninstalled' | 'unlicensed' | 'detached' | 'attached' | 'install-error';
		licensed: boolean;
		activatable?: boolean;
		licenseState?: string;
		licenseReason?: string;
		online?: boolean;
		available?: boolean;
		configured?: boolean;
		setupComplete?: boolean;
		needsSetup?: boolean;
		installStatus?: string | null;
		repairRequired?: boolean;
		installContract?: {
			ok?: boolean;
			installed?: boolean;
			status?: string | null;
			reason?: string | null;
			file?: string | null;
			schemaVersion?: number | null;
			installMethod?: string | null;
			setupComplete?: boolean;
		} | null;
		version?: string | null;
		frontend?: {
			primaryNavigation?: Array<{ label: string; href: string }>;
			routes?: Array<{ path: string }>;
		} | null;
		installError?: string | null;
		supports?: string[];
		service?: { serviceName?: string; defaultPort?: number; healthPath?: string; connectorPath?: string } | null;
		installMethod?: 'windows-exe' | 'package' | 'panel' | 'unknown' | string;
		packageManaged?: boolean;
		panelManaged?: boolean;
		sourceRoot?: string | null;
		healthUrl?: string | null;
		wiring?: {
			package?: boolean;
			panel?: boolean;
			backend?: boolean;
			frontend?: boolean;
			engine?: boolean;
			service?: boolean;
		};
	};

	type AddonPackageFile = {
		filename: string;
		path: string;
		size: number;
		modifiedAt: string | null;
	};

	type AddonPackageLibrary = {
		packageRoot: string;
		packages: AddonPackageFile[];
	};

	type SchemaField = {
		title?: string;
		description?: string;
		type?: string;
		default?: unknown;
		enum?: string[];
		format?: string;
		writeOnly?: boolean;
	};

	type PackagePreview = {
		token: string;
		filename: string;
		sha256: string;
		manifest: {
			id: string;
			name: string;
			version: string;
			description?: string;
			licenseComponent: string;
			minimumCoreVersion?: string;
			installer?: { supports?: string[] };
			engine?: { serviceName?: string; defaultPort?: number; connectorPath?: string };
		};
		menuItems: number;
		routes: number;
		schema?: { properties?: Record<string, SchemaField> };
	};

	type AddonDetails = {
		manifest: {
			id: string;
			name: string;
			version: string;
			description?: string;
			installer?: { supports?: string[] };
			engine?: { serviceName?: string; defaultPort?: number; connectorPath?: string; healthPath?: string };
			backend?: { apiPrefix?: string };
		};
		registration?: {
			primaryNavigation?: Array<{ label: string; href: string }>;
			routes?: Array<{ path: string }>;
			adminGroups?: Array<{ label: string; items?: Array<{ label: string; href: string }> }>;
		};
		schema?: { properties?: Record<string, SchemaField> };
		install?: { installedAt?: string; version?: string; sha256?: string; schemaVersion?: number; installMethod?: string; setupComplete?: boolean; integrity?: { files?: Record<string, string> } };
		config?: Record<string, unknown>;
		meta?: AdminAddon;
	};

	type AddonRuntime = {
		online?: boolean;
		mode?: string;
		workspaceIntegration?: boolean;
		serviceName?: string;
		port?: number;
		connectorPath?: string;
		controlTokenConfigured?: boolean;
		licensed?: boolean;
		attached?: boolean;
		publicBaseUrl?: string;
		health?: {
			online?: boolean;
			running?: boolean;
			service?: string;
		} | null;
		oauth?: {
			issuer?: string;
			resource?: string;
			authorizationServerDiscovery?: string;
		} | null;
	};

	type AddonConnection = {
		mode?: string;
		resource?: string;
		connectorPath?: string;
		issuer?: string;
		oauth?: {
			issuer?: string;
			resource?: string;
			authorizationServerDiscovery?: string;
		};
	};

	let addons = $state<AdminAddon[]>([]);
	let packages = $state<AddonPackageFile[]>([]);
	let loading = $state(true);
	let error = $state('');
	let busyId = $state<string | null>(null);
	let confirmingDetach = $state<string | null>(null);
	let actionError = $state<Record<string, string>>({});

	let packagePreview = $state<PackagePreview | null>(null);
	let packageConfig = $state<Record<string, unknown>>({});
	let packageBusy = $state(false);
	let packageError = $state('');
	let packageProgress = $state(0);
	let packageSourceLabel = $state('');
	let packageRoot = $state('');

	let selectedAddonId = $state<string | null>(null);
	let addonDetails = $state<AddonDetails | null>(null);
	let detailConfig = $state<Record<string, unknown>>({});
	let detailLoading = $state(false);
	let detailSaving = $state(false);
	let detailError = $state('');
	let detailSaved = $state(false);
	let addonRuntime = $state<AddonRuntime | null>(null);
	let addonConnection = $state<AddonConnection | null>(null);
	let integrationLoading = $state(false);
	let integrationError = $state('');
	let controlTokenBusy = $state(false);

	const selectedAddon = $derived(addons.find((addon) => addon.id === selectedAddonId) ?? null);
	const packageInstalledMatch = $derived.by(() => {
		const preview = packagePreview;
		if (!preview) return null;
		return addons.find((addon) => addon.id === preview.manifest.id) ?? null;
	});

	function formatBytes(bytes: number) {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit += 1;
		}
		return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
	}

	function formatDate(value: string | null) {
		return value ? new Date(value).toLocaleString() : 'Unknown';
	}

	function resetPackagePreview() {
		packagePreview = null;
		packageConfig = {};
		packageSourceLabel = '';
	}

	function defaultConfigFromSchema(schema?: { properties?: Record<string, SchemaField> }, current: Record<string, unknown> = {}) {
		return Object.fromEntries(
			Object.entries(schema?.properties ?? {}).map(([key, field]) => [
				key,
				current[key] ?? field.default ?? (field.type === 'boolean' ? false : '')
			])
		);
	}

	function setConfigValue(target: 'package' | 'detail', key: string, value: unknown) {
		if (target === 'package') packageConfig = { ...packageConfig, [key]: value };
		else detailConfig = { ...detailConfig, [key]: value };
	}

	function statusTone(addon: AdminAddon) {
		if (!addon.installed && addon.panelManaged) return 'secondary';
		if (!addon.installed) return 'warning';
		if (addon.installError) return 'destructive';
		if (addon.repairRequired || addon.installStatus === 'repair_required' || addon.installStatus === 'legacy_repair_required') return 'destructive';
		if (addon.needsSetup || addon.installStatus === 'setup_required') return 'warning';
		if (!addon.licensed) return 'destructive';
		if (addon.attached && addon.online === false) return 'warning';
		if (addon.attached) return 'success';
		return 'secondary';
	}

	function statusLabel(addon: AdminAddon) {
		if (!addon.installed && addon.panelManaged) return 'Panel registered';
		if (!addon.installed) return 'Not installed';
		if (addon.installError) return 'Install error';
		if (addon.installStatus === 'legacy_repair_required') return 'Legacy install - repair required';
		if (addon.repairRequired || addon.installStatus === 'repair_required') return 'Repair required';
		if (addon.needsSetup || addon.installStatus === 'setup_required') return 'Setup required';
		if (!addon.licensed) return 'Blocked by licence';
		if (addon.attached && addon.online === false) return 'Attached, engine offline';
		if (addon.attached) return 'Attached';
		return 'Installed, detached';
	}

	function addonKind(addon: AdminAddon) {
		if (addon.installContract?.installMethod === 'windows-exe-migrated') return 'Windows EXE';
		if (addon.installMethod === 'windows-exe') return 'Windows EXE';
		if (addon.packageManaged && addon.panelManaged) return 'Hybrid';
		if (addon.packageManaged) return 'Package';
		if (addon.panelManaged) return 'Panel';
		return 'Unknown';
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const [addonRes, packageRes] = await Promise.all([
				api.get<{ addons: AdminAddon[] }>('/addons'),
				api.get<AddonPackageLibrary>('/addons/packages')
			]);
			addons = addonRes.addons;
			packages = packageRes.packages;
			packageRoot = packageRes.packageRoot;
			if (packagePreview) {
				const previewStillPresent = packageSourceLabel
					? packages.some((pkg) => pkg.filename === packageSourceLabel)
					: false;
				if (!previewStillPresent) resetPackagePreview();
			}
			if (selectedAddonId && !addons.some((addon) => addon.id === selectedAddonId)) {
				selectedAddonId = null;
				addonDetails = null;
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load add-on manager';
		} finally {
			loading = false;
		}
	}

	load();

	async function refreshAll() {
		await load();
		await addonsStore.load();
		if (selectedAddonId) await selectAddon(selectedAddonId, true);
	}

	async function inspectPackageFile(filename: string) {
		packageBusy = true;
		packageError = '';
		resetPackagePreview();
		try {
			packagePreview = await api.post<PackagePreview>('/addons/packages/inspect', { filename });
			packageConfig = defaultConfigFromSchema(packagePreview.schema);
			packageSourceLabel = filename;
		} catch (err) {
			packageError = err instanceof ApiError ? err.message : 'Package inspection failed';
		} finally {
			packageBusy = false;
		}
	}

	async function inspectUploadedPackage(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		packageBusy = true;
		packageError = '';
		packageProgress = 0;
		resetPackagePreview();
		try {
			packagePreview = await api.uploadResult<PackagePreview>(
				'/addons/package/inspect',
				file,
				{ 'X-File-Name': file.name },
				(value) => (packageProgress = value)
			);
			packageConfig = defaultConfigFromSchema(packagePreview.schema);
			packageSourceLabel = `${file.name} (manual upload)`;
		} catch (err) {
			packageError = err instanceof ApiError ? err.message : 'Package validation failed';
		} finally {
			packageBusy = false;
			input.value = '';
		}
	}

	async function installPackage() {
		if (!packagePreview) return;
		packageBusy = true;
		packageError = '';
		try {
			const result = await api.post<{ frontendRebuild?: { refreshRequired?: boolean } }>(
				'/addons/package/install',
				{ token: packagePreview.token, config: packageConfig }
			);
			resetPackagePreview();
			await load();
			await addonsStore.load();
			if (result.frontendRebuild?.refreshRequired) {
				window.location.reload();
				return;
			}
		} catch (err) {
			packageError = err instanceof ApiError ? err.message : 'Install failed';
		} finally {
			packageBusy = false;
		}
	}

	async function selectAddon(id: string, force = false) {
		if (!force && selectedAddonId === id && addonDetails) return;
		selectedAddonId = id;
		detailLoading = true;
		detailError = '';
		detailSaved = false;
		addonRuntime = null;
		addonConnection = null;
		integrationError = '';
		try {
			const result = await api.get<AddonDetails>(`/addons/${id}/details`);
			addonDetails = result;
			detailConfig = defaultConfigFromSchema(result.schema, result.config ?? {});
			await loadAddonIntegration(id);
		} catch (err) {
			addonDetails = null;
			detailConfig = {};
			detailError = err instanceof ApiError ? err.message : 'Failed to load add-on details';
		} finally {
			detailLoading = false;
		}
	}

	async function saveAddonConfig() {
		if (!selectedAddonId) return;
		detailSaving = true;
		detailError = '';
		detailSaved = false;
		try {
			await api.patch(`/addons/${selectedAddonId}/config`, detailConfig);
			detailSaved = true;
			await refreshAll();
		} catch (err) {
			detailError = err instanceof ApiError ? err.message : 'Configuration save failed';
		} finally {
			detailSaving = false;
		}
	}

	async function lifecycleAction(id: string, action: 'test' | 'repair') {
		busyId = id;
		actionError = { ...actionError, [id]: '' };
		try {
			await api.post(`/addons/${id}/${action}`);
			await refreshAll();
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : `${action} failed` };
		} finally {
			busyId = null;
		}
	}

	async function attach(id: string) {
		busyId = id;
		actionError = { ...actionError, [id]: '' };
		try {
			const result = await api.post<{ frontendRebuild?: { refreshRequired?: boolean } }>(`/addons/${id}/attach`);
			await refreshAll();
			if (result.frontendRebuild?.refreshRequired) {
				window.location.reload();
				return;
			}
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : 'Attach failed' };
		} finally {
			busyId = null;
		}
	}

	async function detach(id: string) {
		busyId = id;
		confirmingDetach = null;
		actionError = { ...actionError, [id]: '' };
		try {
			await api.post(`/addons/${id}/detach`);
			await refreshAll();
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : 'Detach failed' };
		} finally {
			busyId = null;
		}
	}

	async function removeAddon(id: string) {
		if (!confirm(`Uninstall ${id}? The add-on data stays preserved.`)) return;
		busyId = id;
		actionError = { ...actionError, [id]: '' };
		try {
			await api.delete(`/addons/${id}`);
			if (selectedAddonId === id) {
				selectedAddonId = null;
				addonDetails = null;
			}
			await refreshAll();
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : 'Uninstall failed' };
		} finally {
			busyId = null;
		}
	}

	async function loadAddonIntegration(id: string) {
		addonRuntime = null;
		addonConnection = null;
		integrationError = '';
		integrationLoading = true;
		try {
			const [runtimeResult, connectionResult] = await Promise.allSettled([
				api.get<AddonRuntime>(`/addons/${id}/runtime`),
				api.get<AddonConnection>(`/addons/${id}/connection`)
			]);
			if (runtimeResult.status === 'fulfilled') addonRuntime = runtimeResult.value;
			else if (runtimeResult.reason instanceof ApiError && ![404, 409].includes(runtimeResult.reason.status)) integrationError = runtimeResult.reason.message;
			if (connectionResult.status === 'fulfilled') addonConnection = connectionResult.value;
			else if (!integrationError && connectionResult.reason instanceof ApiError && ![404, 409].includes(connectionResult.reason.status)) integrationError = connectionResult.reason.message;
		} finally {
			integrationLoading = false;
		}
	}

	async function generateControlToken() {
		if (!selectedAddonId) return;
		controlTokenBusy = true;
		integrationError = '';
		try {
			await api.put(`/addons/${selectedAddonId}/runtime/control-token`, { generate: true });
			await refreshAll();
			await loadAddonIntegration(selectedAddonId);
		} catch (err) {
			integrationError = err instanceof ApiError ? err.message : 'Failed to rotate control token';
		} finally {
			controlTokenBusy = false;
		}
	}
</script>

<div class="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<Puzzle class="size-5 text-muted-foreground" />
				Add-on Manager
			</h1>
			<p class="text-sm text-muted-foreground">
				Install add-ons, manage package lifecycle, and verify how each add-on is wired into the panel,
				backend, frontend, and runtime.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={refreshAll} disabled={loading || packageBusy || detailSaving}>
			<RefreshCw class={loading ? 'size-4 animate-spin' : 'size-4'} />
			Refresh
		</Button>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
		<div class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<HardDriveDownload class="size-4 text-muted-foreground" />
						Package Library
					</CardTitle>
					<CardDescription>
						These are the `.ofsaddon` files currently available to the live panel. Inspect a package here,
						then install it into the panel when you are ready.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
						Live package root:
						<code class="ml-1">{packageRoot || 'Not configured'}</code>
					</div>

					{#if packages.length === 0}
						<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							No `.ofsaddon` files are available in the live package root.
						</p>
					{:else}
						<div class="space-y-3">
							{#each packages as pkg (pkg.filename)}
								<div class="rounded-xl border border-border bg-card/60 p-4">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<strong class="break-all">{pkg.filename}</strong>
												<Badge variant="outline">Package</Badge>
											</div>
											<p class="mt-1 text-xs text-muted-foreground">
												{formatBytes(pkg.size)} · updated {formatDate(pkg.modifiedAt)}
											</p>
										</div>
										<Button size="sm" variant="outline" onclick={() => inspectPackageFile(pkg.filename)} disabled={packageBusy}>
											{#if packageBusy && packageSourceLabel === pkg.filename}
												<LoaderCircle class="size-4 animate-spin" />
											{/if}
											Inspect
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<div class="border-t border-border pt-4">
						<p class="mb-3 text-sm font-medium">Fallback upload</p>
						<label class="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-4 text-sm hover:bg-muted/40">
							{#if packageBusy && packageSourceLabel.includes('manual upload')}
								<LoaderCircle class="size-4 animate-spin" />
							{:else}
								<Upload class="size-4" />
							{/if}
							{packageBusy && packageSourceLabel.includes('manual upload')
								? `Validating ${packageProgress}%`
								: 'Choose .ofsaddon manually'}
							<input
								class="hidden"
								type="file"
								accept=".ofsaddon,application/zip"
								onchange={inspectUploadedPackage}
								disabled={packageBusy}
							/>
						</label>
					</div>

					{#if packageError}
						<p class="text-sm text-destructive">{packageError}</p>
					{/if}

					{#if packagePreview}
						<div class="rounded-2xl border border-primary/30 bg-primary/5 p-4">
							<div class="flex flex-wrap items-center gap-2">
								<strong>{packagePreview.manifest.name}</strong>
								<Badge variant="secondary">v{packagePreview.manifest.version}</Badge>
								<Badge variant="outline">{packagePreview.manifest.licenseComponent}</Badge>
								{#if packageInstalledMatch}
									<Badge variant="warning">
										{packageInstalledMatch.version === packagePreview.manifest.version ? 'Reinstall candidate' : `Upgrade over ${packageInstalledMatch.version ?? 'installed build'}`}
									</Badge>
								{:else}
									<Badge variant="success">Ready to install</Badge>
								{/if}
							</div>
							<p class="mt-2 text-sm text-muted-foreground">
								{packagePreview.manifest.description ?? 'No description provided.'}
							</p>
							<div class="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
								<div>Package source: <code>{packageSourceLabel}</code></div>
								<div>Minimum core: <code>{packagePreview.manifest.minimumCoreVersion ?? 'unspecified'}</code></div>
								<div>Frontend registrations: {packagePreview.menuItems} menu item(s), {packagePreview.routes} route(s)</div>
								<div>SHA-256: <code>{packagePreview.sha256.slice(0, 24)}…</code></div>
							</div>

							{#if Object.keys(packagePreview.schema?.properties ?? {}).length > 0}
								<div class="mt-4 grid gap-3 sm:grid-cols-2">
									{#each Object.entries(packagePreview.schema?.properties ?? {}) as [key, field]}
										<div class="space-y-1.5">
											<p class="text-xs font-medium">{field.title ?? key}</p>
											{#if field.type === 'boolean'}
												<label class="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
													<input
														type="checkbox"
														checked={Boolean(packageConfig[key])}
														onchange={(event) => setConfigValue('package', key, (event.currentTarget as HTMLInputElement).checked)}
													/>
													<span>{Boolean(packageConfig[key]) ? 'Enabled' : 'Disabled'}</span>
												</label>
											{:else if field.enum?.length}
												<select
													class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
													value={String(packageConfig[key] ?? '')}
													onchange={(event) => setConfigValue('package', key, (event.currentTarget as HTMLSelectElement).value)}
												>
													{#each field.enum as option}
														<option value={option}>{option}</option>
													{/each}
												</select>
											{:else}
												<Input
													type={field.type === 'integer' ? 'number' : field.writeOnly || field.format === 'password' ? 'password' : 'text'}
													value={String(packageConfig[key] ?? '')}
													oninput={(event) =>
														setConfigValue(
															'package',
															key,
															field.type === 'integer'
																? Number((event.currentTarget as HTMLInputElement).value || 0)
																: (event.currentTarget as HTMLInputElement).value
														)}
												/>
											{/if}
											{#if field.description}
												<p class="text-xs text-muted-foreground">{field.description}</p>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							<div class="mt-4 flex flex-wrap gap-2">
								<Button size="sm" onclick={installPackage} disabled={packageBusy}>
									{#if packageBusy}<LoaderCircle class="size-4 animate-spin" />{/if}
									{packageInstalledMatch ? 'Install / replace' : 'Install package'}
								</Button>
								<Button size="sm" variant="ghost" onclick={resetPackagePreview}>Close preview</Button>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Add-on Inventory</CardTitle>
					<CardDescription>
						Live lifecycle state for installed add-ons and panel-managed integrations.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					{#if loading}
						<div class="flex items-center gap-2 text-muted-foreground">
							<LoaderCircle class="size-4 animate-spin" />
							Loading installed add-ons…
						</div>
					{:else if addons.length === 0}
						<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							No add-ons are installed right now. Use the package library above to inspect and install one.
						</p>
					{:else}
						<div class="space-y-3">
							{#each addons as addon (addon.id)}
								<div
									class="rounded-2xl border p-4 text-left transition-colors {selectedAddonId === addon.id
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-accent/30'}"
									role="button"
									tabindex="0"
									onclick={() => selectAddon(addon.id)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											selectAddon(addon.id);
										}
									}}
								>
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<strong>{addon.name}</strong>
												{#if addon.version}<Badge variant="secondary">v{addon.version}</Badge>{/if}
												<Badge variant={statusTone(addon)}>{statusLabel(addon)}</Badge>
												<Badge variant="outline">{addonKind(addon)}</Badge>
											</div>
											<p class="mt-1 text-sm text-muted-foreground">{addon.description}</p>
											<div class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
												<span>Configured: {addon.configured ? 'yes' : 'no'}</span>
												<span>Setup: {addon.setupComplete ? 'complete' : addon.needsSetup ? 'required' : 'unknown'}</span>
												<span>Attached: {addon.attached ? 'yes' : 'no'}</span>
												<span>Online: {addon.online ? 'yes' : 'no'}</span>
												<span>Licensed: {addon.licensed ? 'yes' : 'no'}</span>
												<span>Package: {addon.wiring?.package ? 'yes' : 'no'}</span>
												<span>Panel: {addon.wiring?.panel ? 'yes' : 'no'}</span>
												{#if addon.installContract?.schemaVersion}<span>Contract: v{addon.installContract.schemaVersion}</span>{/if}
											</div>
											{#if addon.installContract?.reason}
												<p class="mt-2 break-words text-xs text-destructive">
													{addon.installContract.reason}{addon.installContract.file ? `: ${addon.installContract.file}` : ''}
												</p>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											{#if addon.installed && addon.licensed && !addon.attached && !addon.needsSetup && !addon.repairRequired}
												<Button size="sm" onclick={() => attach(addon.id)} disabled={busyId === addon.id}>
													{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
													<PlugZap class="size-4" />Attach
												</Button>
											{:else if addon.installed && addon.needsSetup}
												<Button size="sm" variant="outline" onclick={() => lifecycleAction(addon.id, 'repair')} disabled={busyId === addon.id}>
													{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
													<Wrench class="size-4" />Setup
												</Button>
											{:else if addon.installed && addon.repairRequired}
												<Button size="sm" variant="outline" onclick={() => lifecycleAction(addon.id, 'repair')} disabled={busyId === addon.id}>
													{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
													<Wrench class="size-4" />Repair
												</Button>
											{:else if addon.attached}
												{#if confirmingDetach === addon.id}
													<Button size="sm" variant="destructive" onclick={() => detach(addon.id)} disabled={busyId === addon.id}>
														{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
														Detach now
													</Button>
													<Button size="sm" variant="ghost" onclick={() => (confirmingDetach = null)}>Cancel</Button>
												{:else}
													<Button size="sm" variant="outline" onclick={() => (confirmingDetach = addon.id)}>Detach</Button>
												{/if}
											{/if}
										</div>
									</div>

									{#if addon.installError}
										<p class="mt-3 text-sm text-destructive">{addon.installError}</p>
									{/if}
									{#if actionError[addon.id]}
										<p class="mt-3 text-sm text-destructive">{actionError[addon.id]}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<div class="space-y-6">
			<Card class="min-h-[24rem]">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Settings2 class="size-4 text-muted-foreground" />
						Selected Add-on
					</CardTitle>
					<CardDescription>
						Configuration, lifecycle, wiring, and live runtime details for the selected add-on.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					{#if !selectedAddonId}
						<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							Select an installed add-on to inspect package state, configuration, and runtime wiring.
						</p>
					{:else if detailLoading}
						<div class="flex items-center gap-2 text-muted-foreground">
							<LoaderCircle class="size-4 animate-spin" />
							Loading add-on details…
						</div>
					{:else if detailError}
						<p class="text-sm text-destructive">{detailError}</p>
					{:else if selectedAddon && addonDetails}
						<div class="space-y-4">
							<div class="space-y-2">
								<div class="flex flex-wrap items-center gap-2">
									<strong>{selectedAddon.name}</strong>
									{#if selectedAddon.version}<Badge variant="secondary">v{selectedAddon.version}</Badge>{/if}
									<Badge variant={statusTone(selectedAddon)}>{statusLabel(selectedAddon)}</Badge>
								</div>
								<p class="text-sm text-muted-foreground">{selectedAddon.description}</p>
							</div>

							<div class="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
								<div>Supports: {(selectedAddon.supports ?? []).join(', ') || 'none declared'}</div>
								<div>Installer: <code>{selectedAddon.installMethod ?? addonKind(selectedAddon)}</code></div>
								<div>Installed: {formatDate(addonDetails.install?.installedAt ?? null)}</div>
								<div>Install contract: <code>{selectedAddon.installStatus ?? 'unknown'}</code></div>
								<div>Setup complete: {selectedAddon.setupComplete ? 'yes' : 'no'}</div>
								<div>Contract schema: <code>{addonDetails.install?.schemaVersion ?? selectedAddon.installContract?.schemaVersion ?? 'legacy'}</code></div>
								<div>Integrity files: <code>{Object.keys(addonDetails.install?.integrity?.files ?? {}).length || 'n/a'}</code></div>
								<div>API prefix: <code>{addonDetails.manifest.backend?.apiPrefix ?? 'none'}</code></div>
								<div>Service: <code>{addonDetails.manifest.engine?.serviceName ?? selectedAddon.service?.serviceName ?? 'none'}</code></div>
								<div>Default port: <code>{addonDetails.manifest.engine?.defaultPort ?? selectedAddon.service?.defaultPort ?? 'n/a'}</code></div>
								<div>Connector path: <code>{addonDetails.manifest.engine?.connectorPath ?? selectedAddon.service?.connectorPath ?? 'n/a'}</code></div>
							</div>

							{#if selectedAddon.installContract?.reason}
								<div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
									{selectedAddon.installContract.reason}{selectedAddon.installContract.file ? `: ${selectedAddon.installContract.file}` : ''}
								</div>
							{/if}

							<div class="space-y-3 rounded-xl border border-border bg-card/50 p-4">
								<div>
									<p class="text-sm font-medium">Wiring status</p>
									<p class="text-xs text-muted-foreground">
										These flags show which parts of the stack this add-on currently plugs into.
									</p>
								</div>
								<div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
									<div>Package: {selectedAddon.wiring?.package ? 'connected' : 'missing'}</div>
									<div>Panel registry: {selectedAddon.wiring?.panel ? 'connected' : 'missing'}</div>
									<div>Backend routes: {selectedAddon.wiring?.backend ? 'connected' : 'missing'}</div>
									<div>Frontend routes: {selectedAddon.wiring?.frontend ? 'connected' : 'missing'}</div>
									<div>Engine: {selectedAddon.wiring?.engine ? 'connected' : 'missing'}</div>
									<div>Service host: {selectedAddon.wiring?.service ? 'connected' : 'missing'}</div>
								</div>
								{#if selectedAddon.sourceRoot || selectedAddon.healthUrl}
									<div class="grid gap-2 text-xs text-muted-foreground">
										{#if selectedAddon.sourceRoot}<div>Source root: <code>{selectedAddon.sourceRoot}</code></div>{/if}
										{#if selectedAddon.healthUrl}<div>Health URL: <code>{selectedAddon.healthUrl}</code></div>{/if}
									</div>
								{/if}
							</div>

							<div class="flex flex-wrap gap-2 border-t border-border pt-3">
								<Button size="sm" variant="outline" onclick={() => lifecycleAction(selectedAddon.id, 'test')} disabled={busyId === selectedAddon.id}>
									<ShieldCheck class="size-4" />Validate
								</Button>
								<Button size="sm" variant="outline" onclick={() => lifecycleAction(selectedAddon.id, 'repair')} disabled={busyId === selectedAddon.id}>
									<Wrench class="size-4" />Repair
								</Button>
								{#if selectedAddon.installed && selectedAddon.licensed && !selectedAddon.attached && !selectedAddon.needsSetup && !selectedAddon.repairRequired}
									<Button size="sm" onclick={() => attach(selectedAddon.id)} disabled={busyId === selectedAddon.id}>
										<PlugZap class="size-4" />Attach
									</Button>
								{/if}
								<Button size="sm" variant="ghost" class="text-destructive" onclick={() => removeAddon(selectedAddon.id)} disabled={busyId === selectedAddon.id || selectedAddon.attached}>
									<Trash2 class="size-4" />Uninstall
								</Button>
							</div>

							{#if Object.keys(addonDetails.schema?.properties ?? {}).length > 0}
								<div class="space-y-3 border-t border-border pt-4">
									<div>
										<p class="text-sm font-medium">Runtime configuration</p>
										<p class="text-xs text-muted-foreground">
											This writes the add-on config the lifecycle uses to set up its engine and service.
										</p>
									</div>
									<div class="grid gap-3">
										{#each Object.entries(addonDetails.schema?.properties ?? {}) as [key, field]}
											<div class="space-y-1.5">
												<p class="text-xs font-medium">{field.title ?? key}</p>
												{#if field.type === 'boolean'}
													<label class="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
														<input
															type="checkbox"
															checked={Boolean(detailConfig[key])}
															onchange={(event) => setConfigValue('detail', key, (event.currentTarget as HTMLInputElement).checked)}
														/>
														<span>{Boolean(detailConfig[key]) ? 'Enabled' : 'Disabled'}</span>
													</label>
												{:else if field.enum?.length}
													<select
														class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
														value={String(detailConfig[key] ?? '')}
														onchange={(event) => setConfigValue('detail', key, (event.currentTarget as HTMLSelectElement).value)}
													>
														{#each field.enum as option}
															<option value={option}>{option}</option>
														{/each}
													</select>
												{:else}
													<Input
														type={field.type === 'integer' ? 'number' : field.writeOnly || field.format === 'password' ? 'password' : 'text'}
														value={String(detailConfig[key] ?? '')}
														oninput={(event) =>
															setConfigValue(
																'detail',
																key,
																field.type === 'integer'
																	? Number((event.currentTarget as HTMLInputElement).value || 0)
																	: (event.currentTarget as HTMLInputElement).value
															)}
													/>
												{/if}
												{#if field.description}
													<p class="text-xs text-muted-foreground">{field.description}</p>
												{/if}
											</div>
										{/each}
									</div>

									{#if detailError}
										<p class="text-sm text-destructive">{detailError}</p>
									{/if}
									{#if detailSaved}
										<p class="text-sm text-emerald-400">Configuration saved and lifecycle rerun.</p>
									{/if}

									<Button size="sm" onclick={saveAddonConfig} disabled={detailSaving}>
										{#if detailSaving}<LoaderCircle class="size-4 animate-spin" />{/if}
										Save configuration
									</Button>
								</div>
							{/if}

							<div class="space-y-3 border-t border-border pt-4">
								<div>
									<p class="text-sm font-medium">Live runtime state</p>
									<p class="text-xs text-muted-foreground">
										Shows runtime and connection data when the add-on exposes live endpoints.
									</p>
								</div>
								{#if integrationLoading}
									<div class="flex items-center gap-2 text-xs text-muted-foreground">
										<LoaderCircle class="size-4 animate-spin" />
										Loading runtime details…
									</div>
								{:else if integrationError}
									<p class="text-sm text-destructive">{integrationError}</p>
								{:else if addonRuntime || addonConnection}
									<div class="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
										<div>Mode: <code>{addonRuntime?.mode ?? addonConnection?.mode ?? 'n/a'}</code></div>
										<div>Attached: {(addonRuntime?.attached ?? selectedAddon.attached) ? 'yes' : 'no'}</div>
										<div>Online: {(addonRuntime?.online ?? selectedAddon.online) ? 'yes' : 'no'}</div>
										<div>Licensed: {(addonRuntime?.licensed ?? selectedAddon.licensed) ? 'yes' : 'no'}</div>
										<div>Workspace integration: {addonRuntime?.workspaceIntegration ? 'enabled' : 'off'}</div>
										<div>Control token: {addonRuntime?.controlTokenConfigured ? 'configured' : 'not reported'}</div>
										{#if addonRuntime?.serviceName}<div>Runtime service: <code>{addonRuntime.serviceName}</code></div>{/if}
										{#if addonRuntime?.port}<div>Runtime port: <code>{addonRuntime.port}</code></div>{/if}
										{#if addonConnection?.resource || addonRuntime?.publicBaseUrl}
											<div class="sm:col-span-2">Resource: <code>{addonConnection?.resource ?? addonRuntime?.publicBaseUrl}</code></div>
										{/if}
										{#if addonConnection?.issuer || addonRuntime?.oauth?.issuer}
											<div class="sm:col-span-2">Issuer: <code>{addonConnection?.issuer ?? addonRuntime?.oauth?.issuer}</code></div>
										{/if}
									</div>
									{#if addonRuntime?.health}
										<div class="rounded-md border p-3 text-xs text-muted-foreground">
											Health:
											service <code>{addonRuntime.health.service ?? 'n/a'}</code>,
											running {addonRuntime.health.running ? 'yes' : 'no'},
											online {addonRuntime.health.online ? 'yes' : 'no'}
										</div>
									{/if}
									{#if addonRuntime?.controlTokenConfigured !== undefined}
										<Button size="sm" variant="outline" onclick={generateControlToken} disabled={controlTokenBusy}>
											{#if controlTokenBusy}<LoaderCircle class="size-4 animate-spin" />{/if}
											Rotate control token
										</Button>
									{/if}
								{:else}
									<p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
										No live runtime endpoint is exposed for this add-on, or the add-on is detached.
									</p>
								{/if}
							</div>

							<div class="space-y-2 border-t border-border pt-4">
								<p class="text-sm font-medium">Frontend registrations</p>
								<p class="text-xs text-muted-foreground">
									Menu items: {addonDetails.registration?.primaryNavigation?.length ?? 0} · Routes:
									{addonDetails.registration?.routes?.length ?? 0}
								</p>
								{#if addonDetails.registration?.routes?.length}
									<div class="rounded-md border p-3 text-xs text-muted-foreground">
										{#each addonDetails.registration?.routes ?? [] as route (route.path)}
											<div><code>{route.path}</code></div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>
