<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui';
	import { FilePlus2, LoaderCircle, X } from '@lucide/svelte';

	let {
		currentPath = '',
		canWrite = false,
		onSaved = async () => {}
	} = $props<{
		currentPath?: string;
		canWrite?: boolean;
		onSaved?: () => void | Promise<void>;
	}>();

	type EditorMode = 'text' | 'code' | 'fancy';
	let open = $state(false);
	let filename = $state('untitled.txt');
	let mode = $state<EditorMode>('text');
	let content = $state('');
	let saving = $state(false);
	let error = $state('');
	let dialog = $state<HTMLElement | null>(null);
	let filenameInput = $state<HTMLInputElement | null>(null);
	let returnFocus: HTMLElement | null = null;

	const modeHelp = $derived(
		mode === 'code'
			? 'Code editor mode. Use a code extension such as .js, .ts, .py, .json or .html.'
			: mode === 'fancy'
				? 'Fancy editor mode saves Markdown formatting such as headings, lists and links.'
				: 'Plain text editor mode.'
	);

	function cleanName(value: string) {
		return value.trim().replace(/[\\/]/g, '');
	}

	function applyMode(next: EditorMode) {
		mode = next;
		const base = cleanName(filename).replace(/\.[^.]+$/, '') || 'untitled';
		if (next === 'text') filename = base + '.txt';
		if (next === 'code' && !/\.(js|ts|py|json|html|css|md|jsx|tsx|sql|sh)$/i.test(filename))
			filename = base + '.js';
		if (next === 'fancy') filename = base + '.md';
	}

	async function openEditor() {
		returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		open = true;
		await tick();
		filenameInput?.focus();
		filenameInput?.select();
	}

	async function close() {
		if (saving) return;
		open = false;
		error = '';
		await tick();
		returnFocus?.focus();
		returnFocus = null;
	}

	function handleDialogKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

	async function save() {
		const name = cleanName(filename);
		if (!name) {
			error = 'Enter a file name.';
			return;
		}
		saving = true;
		error = '';
		try {
			const path = currentPath ? currentPath + '/' + name : name;
			await api.put('/file', { path, content });
			await onSaved();
			saving = false;
			content = '';
			filename = mode === 'fancy' ? 'untitled.md' : mode === 'code' ? 'untitled.js' : 'untitled.txt';
			await close();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not save file';
		} finally {
			saving = false;
		}
	}
</script>

<Button
	class="shrink-0"
	variant="outline"
	size="sm"
	disabled={!canWrite}
	onclick={openEditor}
	title="Create and edit a text, code or Markdown file"
>
	<FilePlus2 class="size-4" /><span class="hidden xs:inline">New file</span>
</Button>

{#if open}
	<button type="button" class="fixed inset-0 z-[90] bg-black/60" aria-label="Close editor" onclick={close}></button>
	<div
		bind:this={dialog}
		class="fixed inset-x-3 top-3 bottom-3 z-[100] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl md:inset-x-8 md:top-8 md:bottom-8"
		role="dialog"
		aria-modal="true"
		aria-label="Create file editor"
		tabindex="-1"
		onkeydown={handleDialogKey}
	>
		<header class="flex flex-wrap items-center gap-2 border-b border-border p-3">
			<FilePlus2 class="size-5 text-primary" />
			<h2 class="font-semibold">Create file</h2>
			<span class="text-xs text-muted-foreground">/{currentPath || 'workspace root'}</span>
			<button class="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent" onclick={close} aria-label="Close">
				<X class="size-4" />
			</button>
		</header>

		<div class="grid gap-3 border-b border-border p-3 md:grid-cols-[minmax(0,1fr)_11rem]">
			<label class="space-y-1 text-xs font-medium">
				File name
				<input
					bind:this={filenameInput}
					bind:value={filename}
					class="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring"
					placeholder="untitled.txt"
				/>
			</label>
			<label class="space-y-1 text-xs font-medium">
				Editor type
				<select
					value={mode}
					onchange={(event) => applyMode(event.currentTarget.value as EditorMode)}
					class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
				>
					<option value="text">Text</option>
					<option value="code">Code</option>
					<option value="fancy">Fancy / Markdown</option>
				</select>
			</label>
		</div>
		<p class="border-b border-border px-3 py-2 text-xs text-muted-foreground">{modeHelp}</p>
		<textarea
			bind:value={content}
			class="min-h-0 flex-1 resize-none bg-background/40 p-4 text-sm leading-6 outline-none {mode === 'code'
				? 'font-mono'
				: mode === 'fancy'
					? 'font-serif'
					: ''}"
			placeholder={mode === 'fancy'
				? '# Heading\n\nWrite formatted Markdown here...'
				: mode === 'code'
					? '// Start coding...'
					: 'Start writing...'}
			spellcheck={mode !== 'code'}
		></textarea>

		<footer class="flex items-center gap-3 border-t border-border p-3">
			{#if error}<p class="min-w-0 flex-1 text-sm text-destructive">{error}</p>{:else}<span class="flex-1"></span>{/if}
			<Button variant="outline" onclick={close} disabled={saving}>Cancel</Button>
			<Button onclick={save} disabled={saving || !canWrite}>
				{#if saving}<LoaderCircle class="size-4 animate-spin" />{/if}
				Save to workspace
			</Button>
		</footer>
	</div>
{/if}
