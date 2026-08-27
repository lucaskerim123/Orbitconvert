<script lang="ts">
	import { onMount } from 'svelte';
	import { baseStore, type FileEntry } from '$lib/base-store.svelte';
	import { Folder, FileText, FolderPlus, Plus, Trash2, Save, ChevronRight, HardDrive } from '@lucide/svelte';

	let currentPath = $state('');
	let folderName = $state('');
	let fileName = $state('');
	let fileContent = $state('');
	let selectedFileId = $state('');
	let editorContent = $state('');
	let error = $state('');

	onMount(() => { void baseStore.init(); });
	const entries = $derived(baseStore.entriesFor(currentPath));
	const selectedFile = $derived(baseStore.files.find((item) => item.id === selectedFileId && item.kind === 'file') ?? null);
	const crumbs = $derived(currentPath ? currentPath.split('/').filter(Boolean) : []);

	function createFolder() {
		error = '';
		try { baseStore.createFolder(currentPath, folderName); folderName = ''; }
		catch (e) { error = e instanceof Error ? e.message : 'Could not create folder'; }
	}

	function createFile() {
		error = '';
		try { baseStore.createFile(currentPath, fileName, fileContent); fileName = ''; fileContent = ''; }
		catch (e) { error = e instanceof Error ? e.message : 'Could not create file'; }
	}

	function openEntry(entry: FileEntry) {
		if (entry.kind === 'folder') { currentPath = entry.path; selectedFileId = ''; return; }
		selectedFileId = entry.id;
		editorContent = entry.content;
	}

	function saveFile() {
		if (!selectedFile) return;
		baseStore.updateFile(selectedFile.id, editorContent);
	}

	function openCrumb(index: number) {
		currentPath = crumbs.slice(0, index + 1).join('/');
		selectedFileId = '';
	}
</script>

<div class="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
	<header>
		<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Phase 1</p>
		<h1 class="text-2xl font-semibold tracking-tight">Files</h1>
		<p class="mt-1 text-sm text-muted-foreground">Database-backed workspace folders and text files.</p>
	</header>

	{#if error || baseStore.error}
		<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error || baseStore.error}</div>
	{/if}

	<div class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
		<button class="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground" onclick={() => { currentPath = ''; selectedFileId = ''; }}>
			<HardDrive class="size-4" /> {baseStore.currentWorkspace?.name || 'Workspace'}
		</button>
		{#each crumbs as crumb, index}
			<ChevronRight class="size-3.5" />
			<button class="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground" onclick={() => openCrumb(index)}>{crumb}</button>
		{/each}
	</div>

	<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
		<section class="space-y-4">
			<div class="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
				<div class="flex gap-2">
					<input class="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" bind:value={folderName} placeholder="New folder" />
					<button class="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50" onclick={createFolder} disabled={!folderName.trim()}><FolderPlus class="size-4" /> Add</button>
				</div>
				<div class="flex gap-2">
					<input class="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" bind:value={fileName} placeholder="notes.md" />
					<button class="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50" onclick={createFile} disabled={!fileName.trim()}><Plus class="size-4" /> File</button>
				</div>
				<textarea class="min-h-20 rounded-md border border-input bg-background p-3 text-sm sm:col-span-2" bind:value={fileContent} placeholder="Optional initial file content"></textarea>
			</div>

			<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
				{#if !baseStore.ready}
					<div class="p-8 text-center text-sm text-muted-foreground">Loading files...</div>
				{:else if entries.length === 0}
					<div class="p-8 text-center text-sm text-muted-foreground">This folder is empty.</div>
				{:else}
					{#each entries as entry (entry.id)}
						<div class="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
							<button class="flex min-w-0 flex-1 items-center gap-3 text-left" onclick={() => openEntry(entry)}>
								{#if entry.kind === 'folder'}<Folder class="size-5 shrink-0 text-primary" />{:else}<FileText class="size-5 shrink-0 text-muted-foreground" />{/if}
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{entry.path.split('/').pop()}</p>
									<p class="text-xs text-muted-foreground">{entry.kind === 'folder' ? 'Folder' : `${entry.size} bytes`}</p>
								</div>
							</button>
							{#if !['_trash', '_media'].includes(entry.path)}
								<button class="rounded-md border p-2 text-destructive hover:bg-destructive/10" aria-label="Delete" onclick={() => baseStore.deleteEntry(entry)}><Trash2 class="size-4" /></button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<aside class="rounded-xl border bg-card p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
			<h2 class="font-semibold">File editor</h2>
			{#if selectedFile}
				<p class="mt-1 truncate text-xs text-muted-foreground">/{selectedFile.path}</p>
				<textarea class="mt-4 min-h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm" bind:value={editorContent}></textarea>
				<button class="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" onclick={saveFile}><Save class="size-4" /> Save file</button>
			{:else}
				<div class="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Select a text file to edit it.</div>
			{/if}
		</aside>
	</div>
</div>
