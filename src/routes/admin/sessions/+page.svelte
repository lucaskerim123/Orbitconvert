<script lang="ts">
	import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui';
	import { CircleUser, Construction } from '@lucide/svelte';
</script>
<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div class="flex justify-between gap-3"><div><h1 class="flex items-center gap-2 text-xl font-semibold"><CircleUser class="size-5" />Sessions</h1><p class="text-sm text-muted-foreground">Active panel login sessions and revocation controls.</p></div><Badge variant="secondary">WIP</Badge></div>
	<Card><CardHeader><CardTitle class="flex items-center gap-2"><Construction class="size-4" />Being rebuilt</CardTitle><CardDescription>Session visibility and remote revocation are not active yet.</CardDescription></CardHeader><CardContent class="text-sm text-muted-foreground">Existing authentication continues to work normally.</CardContent></Card>
</div>
