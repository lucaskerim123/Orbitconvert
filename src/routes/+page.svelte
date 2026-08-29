<script lang="ts">
	import { Cloud, Plug, ShieldCheck } from '@lucide/svelte';
</script>

<svelte:head><title>OrbitFS MCP Add-on</title></svelte:head>

<div class="mx-auto flex min-h-dvh max-w-3xl items-center p-6">
	<div class="w-full space-y-5 rounded-xl border bg-card p-6 shadow-sm">
		<div class="flex items-center gap-3">
			<div class="rounded-lg bg-primary/10 p-3 text-primary"><Plug class="size-6" /></div>
			<div><h1 class="text-2xl font-semibold">OrbitFS MCP Add-on</h1><p class="text-sm text-muted-foreground">Cloud MCP runtime and UI host.</p></div>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			<div class="rounded-lg border p-4"><Cloud class="mb-2 size-5"/><strong>Vercel runtime</strong><p class="mt-1 text-xs text-muted-foreground">No VPS or Windows service dependency.</p></div>
			<div class="rounded-lg border p-4"><ShieldCheck class="mb-2 size-5"/><strong>Base managed</strong><p class="mt-1 text-xs text-muted-foreground">Install, licence and attach from OrbitFS Add-on Manager.</p></div>
			<div class="rounded-lg border p-4"><Plug class="mb-2 size-5"/><strong>MCP transport</strong><p class="mt-1 text-xs text-muted-foreground">ChatGPT and other MCP clients connect through /mcp.</p></div>
		</div>
		<div class="flex flex-wrap gap-3">
			<a class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="https://orbitconvert.vercel.app/admin/addons">Open OrbitFS Add-on Manager</a>
			<a class="rounded-md border px-4 py-2 text-sm font-medium" href="/login">Sign in to MCP UI</a>
		</div>
		<p class="text-xs text-muted-foreground">This is not a separate OrbitFS installation. Owner setup and licence entry belong to the main OrbitFS panel.</p>
	</div>
</div>
