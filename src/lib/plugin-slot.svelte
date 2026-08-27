<script lang="ts">
	import { addons } from '$lib/addons.svelte';
	let { slot, ...slotProps } = $props<{ slot: string; [key: string]: unknown }>();
	const modules = import.meta.glob('../../../plugins/*/frontend/lib/*.svelte', { eager: true });
	const matches = $derived(
		Object.entries(modules)
			.map(([path, module]) => {
				const match = path.match(/\/plugins\/([^/]+)\/frontend\/lib\/([^/]+)\.svelte$/);
				return match && match[2] === slot ? { addonId: match[1], Component: (module as any).default } : null;
			})
			.filter((item): item is { addonId: string; Component: any } => Boolean(item))
			.filter((item) => addons.available(item.addonId) && addons.attached(item.addonId))
	);
</script>

{#each matches as item (item.addonId)}
	<item.Component {...slotProps} />
{/each}
