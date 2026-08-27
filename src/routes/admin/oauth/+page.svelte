<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '$lib/components/ui';
	import { Plug, Unlink, LoaderCircle } from '@lucide/svelte';

	type OAuthState = {
		clients: { id: string; redirectUris: string[] }[];
		refreshTokens: { email: string }[];
	};

	let oauth = $state<OAuthState | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busyEmail = $state<string | null>(null);
	let confirmingEmail = $state<string | null>(null);

	async function load() {
		loading = true;
		error = '';
		try {
			oauth = await api.get<OAuthState>('/system/oauth');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load connections';
		} finally {
			loading = false;
		}
	}
	load();

	async function disconnect(email: string) {
		busyEmail = email;
		confirmingEmail = null;
		try {
			await api.post('/system/oauth/disconnect', { email });
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Disconnect failed';
		} finally {
			busyEmail = null;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div>
		<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
			<Plug class="size-5 text-muted-foreground" />
			OAuth management
		</h1>
		<p class="text-sm text-muted-foreground">Registered OAuth clients and connected accounts.</p>
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
	{:else if oauth}
		<Card>
			<CardHeader>
				<CardTitle>Connected accounts</CardTitle>
				<CardDescription>Accounts with an active MCP refresh token. Disconnecting revokes it.</CardDescription>
			</CardHeader>
			<CardContent class="p-0">
				{#if oauth.refreshTokens.length === 0}
					<p class="px-4 pb-4 text-sm text-muted-foreground">No connected accounts.</p>
				{:else}
					<table class="w-full text-sm">
						<tbody>
							{#each oauth.refreshTokens as rt (rt.email)}
								<tr class="border-t border-border">
									<td class="px-4 py-2">{rt.email}</td>
									<td class="px-4 py-2 text-right">
										{#if confirmingEmail === rt.email}
											<Button size="sm" variant="destructive" onclick={() => disconnect(rt.email)} disabled={busyEmail === rt.email}>
												{#if busyEmail === rt.email}<LoaderCircle class="size-4 animate-spin" />{/if}
												Confirm
											</Button>
											<Button size="sm" variant="ghost" onclick={() => (confirmingEmail = null)}>Cancel</Button>
										{:else}
											<Button size="sm" variant="outline" onclick={() => (confirmingEmail = rt.email)}>
												<Unlink class="size-4" />Disconnect
											</Button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>Registered OAuth clients</CardTitle>
				<CardDescription>Dynamically registered by connecting AI clients (Claude, ChatGPT, etc).</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2">
				{#if oauth.clients.length === 0}
					<p class="text-sm text-muted-foreground">No registered clients.</p>
				{:else}
					{#each oauth.clients as client (client.id)}
						<div class="rounded-md border border-border p-3 text-sm">
							<p class="font-mono text-xs">{client.id}</p>
							{#each client.redirectUris as uri (uri)}
								<p class="mt-1 truncate text-xs text-muted-foreground">{uri}</p>
							{/each}
						</div>
					{/each}
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
