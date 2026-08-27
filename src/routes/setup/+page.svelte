<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	onMount(() => { void goto('/register?setup=1'); });
</script>
<div class="grid min-h-dvh place-items-center bg-background text-foreground"><p class="text-sm text-muted-foreground">Opening OrbitFS setup…</p></div>
