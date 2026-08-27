<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	type Workspace = { id: string; name: string; permission: string };
	type Profile = {
		id: string;
		name: string;
		type: string;
		status: string;
		classification: string;
		restricted?: boolean;
		srestricted?: boolean;
		sections?: ProfileSection[];
		fields?: Record<string, any>;
	};
	type Relationship = {
		id: string;
		profileId: string;
		profileName: string;
		category?: string;
		presetId?: string;
		fromLabel: string;
		toLabel: string;
		fromDate?: string;
		toDate?: string;
		status: string;
		notes: string;
		autoSync: boolean;
		syncedFromProfileId?: string;
		syncedFromRelationshipId?: string;
	};
	type TimelineEntry = {
		id: string;
		date: string;
		title: string;
		linkedFile: string;
		notes: string;
	};
	type ProfileSection = {
		id: string;
		title: string;
		kind?: string;
		content?: string;
		removed?: boolean;
		locked?: boolean;
		generated?: boolean;
		canRead?: boolean;
		loadIntoMcp?: boolean;
		detailLevel?: string;
		sourcePath?: string;
		relationships?: Relationship[];
		entries?: TimelineEntry[];
		labels?: { primary?: string[]; context?: string[]; system?: string[]; sensitive?: string[] };
	};
	type ProfileBundle = { id: string; name: string; description?: string; profileIds: string[]; updatedAt?: string };
	type Tab = 'profiles' | 'bundles' | 'requests' | 'slots' | 'loading' | 'advanced';
	type ProfileEditRequest = {
		id: string;
		profileId: string;
		profileName: string;
		requestedBy: string;
		requestedAt: string;
		status: string;
		summary: string;
		patch: any;
		resolutionNote?: string;
		resolvedBy?: string;
		resolvedAt?: string;
	};

	let activeTab = $state<Tab>('profiles');
	let workspaces = $state<Workspace[]>([]);
	let workspaceId = $state('');
	let profiles = $state<Profile[]>([]);
	let profileBundles = $state<ProfileBundle[]>([]);
	let bundleName = $state('');
	let bundleDescription = $state('');
	let bundleProfileIds = $state<string[]>([]);
	let editingBundleId = $state<string | null>(null);
	let enabled = $state(false);
	let systemEnabled = $state(true);
	let canManageSystem = $state(false);
	let permissions = $state<Record<string, boolean>>({});
	let slots = $state<{ master: string | null; additional: string | null }>({
		master: null,
		additional: null
	});
	let settings = $state({
		startupMode: 'summary',
		loadUserSlots: true,
		loadWorkspaceProfiles: [] as string[]
	});
	let modulePreview = $state<any>(null);
	let selectedProfile = $state<any>(null);
	let viewingProfile = $state<any>(null);
	let newSectionTitle = $state('');
	let name = $state('');
	let type = $state('person-master');
	let restricted = $state(false);
	let srestricted = $state(false);
	let importText = $state('');
	let exportText = $state('');
	let replaceAll = $state(false);
	let importFilename = $state('');
	let importFiles = $state<File[]>([]);
	let importResult = $state<any>(null);
	let profileEditRequests = $state<ProfileEditRequest[]>([]);
	let requestMessage = $state('');
	let busy = $state(false);
	let error = $state('');
	let relationshipSearch = $state('');
	let relationshipCategory = $state('all');
	let relationshipStatus = $state('all');
	let viewerTab = $state('overview');
	let editorGroup = $state('identity');
	let labelDraft = $state<Record<string, string>>({ primary: '', context: '', system: '', sensitive: '' });
	let profileSearch = $state('');
	let profileTypeFilter = $state('all');

	const relationshipCategories = ['Family', 'Partner / former partner', 'Social', 'Professional / service', 'Legal / incident', 'Conflict', 'Other'];
	const relationshipChoices = [
		{ id: 'daughter', label: 'Daughter', reverse: 'Father', reverseFemale: 'Mother', category: 'Family' },
		{ id: 'son', label: 'Son', reverse: 'Father', reverseFemale: 'Mother', category: 'Family' },
		{ id: 'father', label: 'Father', reverse: 'Son', reverseFemale: 'Daughter', category: 'Family' },
		{ id: 'mother', label: 'Mother', reverse: 'Son', reverseFemale: 'Daughter', category: 'Family' },
		{ id: 'brother', label: 'Brother', reverse: 'Brother', reverseFemale: 'Sister', category: 'Family' },
		{ id: 'sister', label: 'Sister', reverse: 'Brother', reverseFemale: 'Sister', category: 'Family' },
		{ id: 'girlfriend', label: 'Girlfriend', reverse: 'Boyfriend', reverseFemale: 'Girlfriend', category: 'Partner / former partner' },
		{ id: 'boyfriend', label: 'Boyfriend', reverse: 'Boyfriend', reverseFemale: 'Girlfriend', category: 'Partner / former partner' },
		{ id: 'ex-girlfriend', label: 'Ex Girlfriend', reverse: 'Ex Boyfriend', reverseFemale: 'Ex Girlfriend', category: 'Partner / former partner' },
		{ id: 'ex-boyfriend', label: 'Ex Boyfriend', reverse: 'Ex Boyfriend', reverseFemale: 'Ex Girlfriend', category: 'Partner / former partner' },
		{ id: 'wife', label: 'Wife', reverse: 'Husband', reverseFemale: 'Wife', category: 'Partner / former partner' },
		{ id: 'husband', label: 'Husband', reverse: 'Husband', reverseFemale: 'Wife', category: 'Partner / former partner' },
		{ id: 'partner', label: 'Partner', reverse: 'Partner', category: 'Partner / former partner' },
		{ id: 'ex-partner', label: 'Ex Partner', reverse: 'Ex Partner', category: 'Partner / former partner' },
		{ id: 'friend', label: 'Friend', reverse: 'Friend', category: 'Social' },
		{ id: 'support-person', label: 'Support Person', reverse: 'Supported By', category: 'Professional / service' },
		{ id: 'supported-by', label: 'Supported By', reverse: 'Support Person', category: 'Professional / service' },
		{ id: 'case-worker', label: 'Case Worker', reverse: 'Client', category: 'Professional / service' },
		{ id: 'client', label: 'Client', reverse: 'Case Worker', category: 'Professional / service' },
		{ id: 'employer', label: 'Employer', reverse: 'Employee', category: 'Professional / service' },
		{ id: 'employee', label: 'Employee', reverse: 'Employer', category: 'Professional / service' },
		{ id: 'witness', label: 'Witness', reverse: 'Witness', category: 'Legal / incident' },
		{ id: 'conflict', label: 'Conflict With', reverse: 'Conflict With', category: 'Conflict' },
		{ id: 'connected', label: 'Connected To', reverse: 'Connected To', category: 'Other' }
	];
	const sectionGroups: Record<string, string[]> = {
		overview: ['core-information', 'who-they-are', 'background', 'current-status', 'labels'],
		relationships: ['relationships'],
		history: ['timeline', 'key-events'],
		records: ['connected-files', 'legal', 'wellbeing'],
		private: ['private-notes'],
		system: ['profile-settings', 'mcp-load-rules']
	};


	const editorTabs = [['identity','Identity'],['labels','Labels'],['relationships','Relationships'],['history','History'],['records','Records'],['private','Private'],['access','Access & MCP']];
	const editorSectionGroups: Record<string,string[]> = { identity:['core-information','who-they-are','background','current-status'], labels:['labels'], relationships:['relationships'], history:['timeline','key-events'], records:['connected-files','legal','wellbeing'], private:['private-notes'], access:['profile-settings','mcp-load-rules'] };
	function editorSectionVisible(section:any){ const known=Object.values(editorSectionGroups).flat(); if(editorGroup==='private' && !known.includes(section.id)) return true; return (editorSectionGroups[editorGroup]||[]).includes(section.id); }
	function parseEditorLabels(section:any){ const groups:any={primary:[],context:[],system:[],sensitive:[]}; if(section?.labels) for(const key of Object.keys(groups)) groups[key]=Array.isArray(section.labels[key])?[...section.labels[key]]:[]; if(Object.values(groups).some((v:any)=>v.length)) return groups; const map:any={'main labels':'primary','primary labels':'primary','associate labels':'context','context labels':'context','system labels':'system','sensitive labels':'sensitive'}; let bucket='primary'; for(const raw of String(section?.content||'').split(/\n/)){const line=raw.trim(); const head=line.replace(/:$/,'').toLowerCase(); if(map[head]) bucket=map[head]; else if(/^[-*]\s+/.test(line)){const value=line.replace(/^[-*]\s+/,'').trim(); if(value) groups[bucket].push(value);}} return groups; }
	function labelContent(groups:any){ const block=(title:string,key:string)=>title+':\n'+(groups[key].length?groups[key].map((v:string)=>'- '+v).join('\n'):'- '); return [block('Primary labels','primary'),block('Context labels','context'),block('System labels','system'),block('Sensitive labels','sensitive')].join('\n\n')+'\n'; }
	function setLabelGroups(index:number,groups:any){ updateSection(index,{labels:groups,content:labelContent(groups)}); }
	function addEditorLabel(index:number,key:string){const value=(labelDraft[key]||'').trim(); if(!value)return; const groups=parseEditorLabels(selectedProfile.sections[index]); if(!groups[key].some((v:string)=>v.toLowerCase()===value.toLowerCase())) groups[key]=[...groups[key],value]; setLabelGroups(index,groups); labelDraft={...labelDraft,[key]:''};}
	function removeEditorLabel(index:number,key:string,label:string){const groups=parseEditorLabels(selectedProfile.sections[index]); groups[key]=groups[key].filter((v:string)=>v!==label); setLabelGroups(index,groups);}
	function canEditLabelGroup(key:string){ if(key==='system') return Boolean(permissions.manage_fields); if(key==='sensitive') return Boolean(permissions.edit_restricted); return true; }
	function canViewLabelGroup(key:string){ return key!=='sensitive' || Boolean(permissions.view_restricted); }

	const sectionInfo: Record<string, string> = {
		'core-information': 'Name, type, status, classification, restricted state, and one-line read.',
		labels: 'Main labels, associate labels, system labels, and sensitive labels.',
		relationships:
			'Choose who they are to this profile. OrbitFS maintains the inverse relationship on the linked profile automatically.',
		background: 'Short background and wider record context.',
		'who-they-are': 'General description, patterns, strengths, concerns, and contradictions.',
		timeline: 'Brief only: date, title, linked file, notes.',
		'current-status': 'Current situation, contact status, unresolved issues, and next known dates.',
		'key-events': 'Major events or incidents. Full detail can live here or in linked files.',
		'private-notes': 'Internal read, emotional significance, cautions, and assumptions to avoid.',
		legal: 'Legal/court reference where relevant.',
		wellbeing: 'Mental health/wellbeing reference where relevant.',
		'connected-files': 'Files, folders, source links, and evidence notes.',
		'mcp-load-rules': 'What MCP can read and how this profile loads.',
		custom: 'Custom section.'
	};

	function sectionTemplate(
		id: string,
		title: string,
		kind = 'text',
		content = '',
		patch: any = {}
	): ProfileSection {
		return {
			id,
			title,
			kind,
			content,
			canRead: true,
			loadIntoMcp: true,
			detailLevel: 'summary',
			generated: true,
			locked: false,
			sourcePath: '',
			...patch
		};
	}

	function baseSections(): ProfileSection[] {
		return [
			sectionTemplate(
				'profile-settings',
				'START / profile settings',
				'settings',
				'Profile type:\nStatus:\nClassification:\nRelationship type:\nRestricted:\nOne-line read:\n',
				{ detailLevel: 'full', locked: true }
			),
			sectionTemplate(
				'mcp-load-rules',
				'MCP / startup load rules',
				'text',
				'Can MCP read this profile:\nDefault load:\nSections allowed:\nSections blocked unless explicitly loaded:\nSpecial instructions:\n',
				{ locked: false }
			),
			sectionTemplate(
				'core-information',
				'Core information',
				'core',
				'Name:\nDate of birth:\nAge:\nCurrent location:\n',
				{ detailLevel: 'full', locked: true }
			),
			sectionTemplate(
				'labels',
				'Labels',
				'labels',
				'Main labels:\n- \n\nAssociate labels:\n- \n\nSystem labels:\n- \n\nSensitive labels:\n- \n',
				{ locked: true }
			),
			sectionTemplate(
				'relationships',
				'Relationships with others',
				'relationships',
				'Connected profile:\nRelationship:\nFrom date:\nTo date:\nStatus:\nNotes:\n',
				{ locked: false, relationships: [] }
			),
			sectionTemplate(
				'background',
				'Background',
				'text',
				'Relationship To Self:\n\nRole In The Collapse:\n',
				{ locked: false }
			),
			sectionTemplate('who-they-are', 'Who they are', 'text', 'Who They Are:\n', { locked: false }),
			sectionTemplate('timeline', 'Timeline', 'timeline', 'Timeline Of Key Events:\n', {
				locked: false,
				entries: []
			}),
			sectionTemplate(
				'current-status',
				'Current status',
				'text',
				'Current Status:\nCurrent situation:\nCurrent contact status:\nCurrent legal / safety / support status:\nUnresolved issues:\nNext known dates:\n',
				{ locked: false }
			),
			sectionTemplate(
				'key-events',
				'Key events / incidents',
				'text',
				'Event title:\nDate / period:\nPeople involved:\nWhat happened:\nWhy it matters:\nLinked files:\n',
				{ locked: false }
			),
			sectionTemplate(
				'private-notes',
				'Private notes',
				'text',
				'Internal notes:\nInternal read:\nEmotional significance:\nThings to be careful with:\nThings not to assume:\n',
				{ locked: false, loadIntoMcp: false }
			),
			sectionTemplate(
				'legal',
				'Legal / court reference',
				'text',
				'Legal status:\nOrders / charges / matters:\nCourt dates:\nRestrictions:\nEvidence:\n',
				{ locked: false, loadIntoMcp: false }
			),
			sectionTemplate(
				'wellbeing',
				'Mental health / wellbeing reference',
				'text',
				'Mental health flags:\nPsychological Profile:\nCore fears:\nCore needs:\n',
				{ locked: false, loadIntoMcp: false }
			),
			sectionTemplate(
				'connected-files',
				'Connected files',
				'text',
				'Connected Files:\nAdditional source sections retained:\nRecent Context:\nAdditional Context:\n',
				{ locked: false }
			)
		];
	}
	function mergeBaseSections(existing: ProfileSection[] = []) {
		const current = new Map(existing.map((section) => [section.id, section]));
		return baseSections()
			.map((base) => ({ ...base, ...(current.get(base.id) ?? {}) }))
			.concat(existing.filter((section) => !baseSections().some((base) => base.id === section.id)));
	}

	function relationshipSelfGender(profile: any) {
		const fields = profile?.fields ?? {};
		const labels = visibleSections(profile).find((section:any) => section.id === 'labels');
		const core = visibleSections(profile).find((section:any) => section.id === 'core-information');
		const roleHints = profileRelationships(profile).map((rel:any) => rel.toLabel || '').join(' ');
		const text = [fields.gender, fields.sex, fields.genderIdentity, fields.gender_identity, fields.pronouns, core?.content, labels?.content, roleHints].filter(Boolean).join(' ').toLowerCase();
		if (/\b(female|woman|girl|she\/?her|mother|mum|mom|daughter|sister|wife|girlfriend|ex girlfriend)\b/.test(text)) return 'female';
		if (/\b(male|man|boy|he\/?him|father|dad|son|brother|husband|boyfriend|ex boyfriend)\b/.test(text)) return 'male';
		return 'unknown';
	}
	function relationshipReverse(choice:any) { return relationshipSelfGender(selectedProfile) === 'female' && choice.reverseFemale ? choice.reverseFemale : choice.reverse; }
	function relationshipChoiceId(rel: Relationship) {
		if (rel.presetId && relationshipChoices.some((choice) => choice.id === rel.presetId)) return rel.presetId;
		const match = relationshipChoices.find((choice:any) => choice.label === rel.fromLabel && [choice.reverse,choice.reverseFemale].filter(Boolean).includes(rel.toLabel));
		return match?.id ?? 'custom';
	}
	function applyRelationshipChoice(sectionIndex: number, relIndex: number, choiceId: string) {
		if (choiceId === 'custom') { updateRelationship(sectionIndex, relIndex, { presetId: 'custom' }); return; }
		const choice = relationshipChoices.find((item) => item.id === choiceId); if (!choice) return;
		updateRelationship(sectionIndex, relIndex, { presetId: choice.id, category: choice.category, fromLabel: choice.label, toLabel: relationshipReverse(choice), autoSync: true });
	}
	function isGeneratedRelationship(rel: Relationship) { return Boolean(rel.syncedFromProfileId); }
	async function loadWorkspaces() {
		const data = await api.get<{
			workspaces: Workspace[];
			profileSystem?: { enabled: boolean; canManage: boolean };
		}>('/workspaces');
		workspaces = data.workspaces ?? [];
		systemEnabled = data.profileSystem?.enabled !== false;
		canManageSystem = Boolean(data.profileSystem?.canManage);
		if (!workspaceId && workspaces.length) workspaceId = workspaces[0].id;
		if (workspaceId && systemEnabled) await loadProfiles();
		if (!systemEnabled) {
			profiles = [];
			modulePreview = null;
		}
	}

	async function loadProfiles() {
		if (!workspaceId) return;
		error = '';
		try {
			const data = await api.get<any>(`/profiles/${workspaceId}`);
			enabled = Boolean(data.enabled);
			permissions = data.permissions ?? {};
			profiles = data.profiles ?? [];
			profileBundles = data.profileBundles ?? [];
			slots = data.slots ?? { master: null, additional: null };
			settings = {
				startupMode: data.settings?.startupMode ?? 'summary',
				loadUserSlots: data.settings?.loadUserSlots ?? true,
				loadWorkspaceProfiles: data.settings?.loadWorkspaceProfiles ?? []
			};
			await loadPreview();
			await loadProfileEditRequests();
		} catch (e: any) {
			error = e.message;
		}
	}

	function canReviewProfileRequests() {
		return Boolean(permissions.approve_edits);
	}

	async function loadProfileEditRequests() {
		if (!workspaceId || !canReviewProfileRequests()) {
			profileEditRequests = [];
			return;
		}
		try {
			const data = await api.get<any>(`/profiles/${workspaceId}/edit-requests`);
			profileEditRequests = data.requests ?? [];
		} catch {
			profileEditRequests = [];
		}
	}

	async function loadPreview() {
		if (!enabled || !workspaceId) {
			modulePreview = null;
			return;
		}
		try {
			modulePreview = await api.get<any>(`/profiles/${workspaceId}/module`);
		} catch {
			modulePreview = null;
		}
	}

	async function toggleEnabled() {
		busy = true;
		error = '';
		try {
			await api.patch(`/profiles/${workspaceId}/settings`, { enabled: !enabled });
			await loadProfiles();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	async function toggleSystemEnabled() {
		busy = true;
		error = '';
		try {
			const data = await api.patch<{ enabled: boolean }>(`/workspaces/profile-system`, {
				enabled: !systemEnabled
			});
			systemEnabled = data.enabled;
			if (systemEnabled) await loadProfiles();
			else {
				profiles = [];
				modulePreview = null;
				selectedProfile = null;
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}
	function defaultClassificationForType(profileType: string) {
		if (profileType === 'child-dependent') return 'child-sensitive';
		if (profileType === 'legal-court') return 'legal-sensitive';
		if (profileType === 'mental-health-wellbeing' || profileType === 'medical-care')
			return 'health-sensitive';
		if (profileType === 'evidence-document-set' || profileType === 'incident-event')
			return 'evidence-record';
		if (profileType === 'project-workspace') return 'system-technical';
		if (profileType === 'family-household' || profileType === 'relationship-connection')
			return 'family-context';
		return 'personal-record';
	}

	async function createProfile() {
		if (!name.trim()) return;
		busy = true;
		error = '';
		try {
			const classification = defaultClassificationForType(type);
			await api.post(`/profiles/${workspaceId}`, {
				name,
				type,
				restricted,
				srestricted,
				classification,
				fields: {},
				sections: baseSections()
			});
			name = '';
			restricted = false;
			srestricted = false;
			await loadProfiles();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	async function removeProfile(id: string) {
		if (!confirm('Delete this profile?')) return;
		busy = true;
		try {
			await api.delete(`/profiles/${workspaceId}/${id}`);
			await loadProfiles();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	function resetBundleEditor() {
		editingBundleId = null;
		bundleName = '';
		bundleDescription = '';
		bundleProfileIds = [];
	}
	function toggleBundleProfile(id: string) {
		const ids = new Set(bundleProfileIds);
		ids.has(id) ? ids.delete(id) : ids.add(id);
		bundleProfileIds = [...ids];
	}
	function editBundle(bundle: ProfileBundle) {
		editingBundleId = bundle.id;
		bundleName = bundle.name;
		bundleDescription = bundle.description || '';
		bundleProfileIds = [...(bundle.profileIds || [])];
	}
	async function saveBundle() {
		if (!bundleName.trim()) return;
		busy = true; error = '';
		try {
			const body = { name: bundleName.trim(), description: bundleDescription.trim(), profileIds: bundleProfileIds };
			if (editingBundleId) await api.put(`/profiles/${workspaceId}/bundles/${editingBundleId}`, body);
			else await api.post(`/profiles/${workspaceId}/bundles`, body);
			resetBundleEditor();
			await loadProfiles();
		} catch (e: any) { error = e.message; } finally { busy = false; }
	}
	async function removeBundle(id: string) {
		if (!confirm('Delete this profile bundle? The profiles themselves will not be deleted.')) return;
		busy = true; error = '';
		try { await api.delete(`/profiles/${workspaceId}/bundles/${id}`); if (editingBundleId === id) resetBundleEditor(); await loadProfiles(); }
		catch (e: any) { error = e.message; } finally { busy = false; }
	}
	function bundleProfiles(bundle: ProfileBundle) { return profiles.filter((profile) => (bundle.profileIds || []).includes(profile.id)); }

	async function saveSlots() {
		busy = true;
		error = '';
		try {
			const data = await api.put<any>(`/profiles/${workspaceId}/slots`, slots);
			slots = data.slots;
			await loadPreview();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}
	function toggleAlwaysLoad(id: string) {
		const current = new Set(settings.loadWorkspaceProfiles);
		current.has(id) ? current.delete(id) : current.add(id);
		settings = { ...settings, loadWorkspaceProfiles: [...current] };
	}

	async function saveLoadingRules() {
		busy = true;
		error = '';
		try {
			const data = await api.put<any>(`/profiles/${workspaceId}/module-settings`, settings);
			settings = data.settings;
			await loadPreview();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	async function loadTemplate() {
		try {
			const data = await api.get<any>(`/profiles/${workspaceId}/template`);
			importFiles = [];
			importFilename = '';
			importText = JSON.stringify(data.template, null, 2);
		} catch (e: any) {
			error = e.message;
		}
	}

	function crc32(bytes: Uint8Array) {
		let crc = 0xffffffff;
		for (const byte of bytes) {
			crc ^= byte;
			for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
		return (crc ^ 0xffffffff) >>> 0;
	}

	function profileExportZip(content: string) {
		const encoder = new TextEncoder();
		const name = encoder.encode('profiles-export.json');
		const data = encoder.encode(content);
		const checksum = crc32(data);
		const local = new Uint8Array(30); const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
		lv.setUint32(14, checksum, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
		const central = new Uint8Array(46); const cv = new DataView(central.buffer);
		cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
		cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, 0, true);
		const centralOffset = local.length + name.length + data.length;
		const end = new Uint8Array(22); const ev = new DataView(end.buffer);
		ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length + name.length, true); ev.setUint32(16, centralOffset, true);
		return new Blob([local, name, data, central, name, end], { type: 'application/zip' });
	}

	async function exportProfiles() {
		try {
			const data = await api.get<any>('/profiles/' + workspaceId + '/export');
			const content = JSON.stringify(data.export, null, 2);
			exportText = content;
			const workspaceName = workspaces.find((workspace) => workspace.id === workspaceId)?.name || 'workspace';
			const safeName = workspaceName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'workspace';
			const blob = profileExportZip(content);
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeName + '-profiles-export.zip';
			document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
		} catch (e: any) { error = e.message; }
	}
	function simpleId(value: string) {
		return (
			value
				.toLowerCase()
				.split('')
				.map((char) => (/[a-z0-9]/.test(char) ? char : '-'))
				.join('')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '') || crypto.randomUUID()
		);
	}

	function textToProfile(text: string, filename: string) {
		const lines = text.split('\n');
		const title =
			lines
				.find((line) => line.trim())
				?.replace(/^#+\s*/, '')
				.trim() ||
			filename ||
			'Imported profile';
		const sections: ProfileSection[] = [];
		let current = sectionTemplate('overview', 'Overview', 'text', '');
		for (const rawLine of lines) {
			const line = rawLine.trimEnd();
			const heading = line.match(/^#{1,6}\s+(.+)$/);
			if (heading) {
				if (String(current.content || '').trim()) sections.push(current);
				const sectionTitle = heading[1].trim();
				current = sectionTemplate(simpleId(sectionTitle), sectionTitle, 'text', '');
			} else current.content = `${current.content ?? ''}${line}\n`;
		}
		if (String(current.content || '').trim() || sections.length === 0) sections.push(current);
		return {
			profile: {
				name: title,
				type: 'person-master',
				status: 'active',
				classification: 'personal-record',
				restricted: false,
				fields: { source_file: filename },
				sections: mergeBaseSections(sections)
			}
		};
	}

	async function chooseImportFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		importFiles = files;
		importFilename = files.length === 1 ? files[0].name : `${files.length} files selected`;
		importResult = null;
		error = '';
		importText = '';
		if (files.length === 1) {
			const file = files[0];
			const lower = file.name.toLowerCase();
			if (
				lower.endsWith('.json') ||
				lower.endsWith('.md') ||
				lower.endsWith('.markdown') ||
				lower.endsWith('.txt')
			) {
				try {
					const text = await file.text();
					const parsed = lower.endsWith('.json') ? JSON.parse(text) : textToProfile(text, file.name);
					importText = JSON.stringify(parsed, null, 2);
					importFiles = [];
				} catch (e: any) {
					error = `Could not read ${file.name}: ${e.message}`;
				}
			}
		}
		input.value = '';
	}

	async function importOneFile(file: File, replaceExisting: boolean) {
		const lower = file.name.toLowerCase();
		if (
			lower.endsWith('.json') ||
			lower.endsWith('.md') ||
			lower.endsWith('.markdown') ||
			lower.endsWith('.txt')
		) {
			const text = await file.text();
			const parsed = lower.endsWith('.json') ? JSON.parse(text) : textToProfile(text, file.name);
			const payload = Array.isArray(parsed) ? { profiles: parsed } : parsed;
			return await api.post<any>(`/profiles/${workspaceId}/import`, {
				...payload,
				replaceAll: replaceExisting
			});
		}
		return await api.uploadResult<any>(`/profiles/${workspaceId}/import-file`, file, {
			'X-Filename': encodeURIComponent(file.name),
			'X-Replace-All': String(replaceExisting)
		});
	}

	async function importProfiles() {
		busy = true;
		error = '';
		importResult = null;
		try {
			if (importFiles.length) {
				let imported = 0;
				let failed = 0;
				let replacePending = replaceAll;
				const files: Array<{ name: string; imported: number; failed: number; error?: string }> = [];
				for (const file of importFiles) {
					try {
						const result = await importOneFile(file, replacePending);
						const fileImported = Number(result?.imported ?? 0);
						const fileFailed = Number(result?.failed ?? 0);
						imported += fileImported;
						failed += fileFailed;
						files.push({ name: file.name, imported: fileImported, failed: fileFailed });
						if (replacePending && fileImported > 0) replacePending = false;
					} catch (e: any) {
						failed += 1;
						files.push({ name: file.name, imported: 0, failed: 1, error: e.message });
					}
				}
				importResult = { imported, failed, files };
				importFiles = [];
				importFilename = '';
				importText = '';
			} else {
				const parsed = JSON.parse(importText);
				const payload = Array.isArray(parsed) ? { profiles: parsed } : parsed;
				importResult = await api.post<any>(`/profiles/${workspaceId}/import`, {
					...payload,
					replaceAll
				});
			}
			await loadProfiles();
			activeTab = 'profiles';
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	function profileCopy(profile: any) {
		const plain = JSON.parse(JSON.stringify(profile));
		return {
			...plain,
			fields: plain.fields ?? {},
			sections: mergeBaseSections(plain.sections ?? []).filter(
				(section) => section.removed !== true
			)
		};
	}

	function openViewer(profile: any) {
		error = '';
		viewingProfile = profileCopy(profile);
	}

	function closeViewer() {
		viewingProfile = null;
	}

	function openEditor(profile: any) {
		error = '';
		editorGroup = 'identity';
		selectedProfile = profileCopy(profile);
	}

	function closeEditor() {
		selectedProfile = null;
		newSectionTitle = '';
	}
	function updateSection(index: number, patch: any) {
		const next = [...(selectedProfile.sections ?? [])];
		next[index] = { ...next[index], ...patch };
		selectedProfile = { ...selectedProfile, sections: next };
	}

	function addSection() {
		if (!selectedProfile || !newSectionTitle.trim()) return;
		const section = sectionTemplate(crypto.randomUUID(), newSectionTitle.trim(), 'custom', '', {
			generated: false,
			detailLevel: 'full'
		});
		selectedProfile = {
			...selectedProfile,
			sections: [...(selectedProfile.sections ?? []), section]
		};
		newSectionTitle = '';
	}

	function removeSection(index: number) {
		const next = [...(selectedProfile.sections ?? [])];
		const section = next[index];
		if (!section || section.locked) return;
		next[index] = { ...section, removed: true, canRead: false, loadIntoMcp: false };
		selectedProfile = { ...selectedProfile, sections: next };
	}

	function moveSection(index: number, direction: number) {
		const next = [...(selectedProfile.sections ?? [])];
		const target = index + direction;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		selectedProfile = { ...selectedProfile, sections: next };
	}

	function addRelationship(sectionIndex: number) {
		const section = selectedProfile.sections[sectionIndex];
		const relationships = [
			...(section.relationships ?? []),
			{
				id: crypto.randomUUID(),
				profileId: '',
				profileName: '',
				category: 'Other',
				presetId: '',
				fromLabel: '',
				toLabel: '',
				fromDate: '',
				toDate: '',
				status: 'current',
				notes: '',
				autoSync: true
			}
		];
		updateSection(sectionIndex, { relationships });
	}

	function updateRelationship(sectionIndex: number, relIndex: number, patch: any) {
		const section = selectedProfile.sections[sectionIndex];
		const relationships = [...(section.relationships ?? [])];
		relationships[relIndex] = { ...relationships[relIndex], ...patch };
		updateSection(sectionIndex, { relationships });
	}

	function removeRelationship(sectionIndex: number, relIndex: number) {
		const section = selectedProfile.sections[sectionIndex];
		updateSection(sectionIndex, {
			relationships: (section.relationships ?? []).filter((_: any, i: number) => i !== relIndex)
		});
	}
	function addTimelineEntry(sectionIndex: number) {
		const section = selectedProfile.sections[sectionIndex];
		const entries = [
			...(section.entries ?? []),
			{ id: crypto.randomUUID(), date: '', title: '', linkedFile: '', notes: '' }
		];
		updateSection(sectionIndex, { entries });
	}

	function updateTimelineEntry(sectionIndex: number, entryIndex: number, patch: any) {
		const section = selectedProfile.sections[sectionIndex];
		const entries = [...(section.entries ?? [])];
		entries[entryIndex] = { ...entries[entryIndex], ...patch };
		updateSection(sectionIndex, { entries });
	}

	function removeTimelineEntry(sectionIndex: number, entryIndex: number) {
		const section = selectedProfile.sections[sectionIndex];
		updateSection(sectionIndex, {
			entries: (section.entries ?? []).filter((_: any, i: number) => i !== entryIndex)
		});
	}

	function firstContentLine(content: any) {
		return (
			String(content ?? '')
				.split(/\n+/)
				.map((line) => line.trim())
				.find(Boolean) ?? ''
		);
	}

	function visibleSections(profile: any) {
		return (profile?.sections ?? []).filter((section: any) => section?.removed !== true);
	}

	function filteredProfileList() {
		const needle = profileSearch.trim().toLowerCase();
		return profiles.filter((profile) => {
			const matchesType = profileTypeFilter === 'all' || profile.type === profileTypeFilter;
			const haystack = [profile.name, profile.type, profile.status, profile.classification].join(' ').toLowerCase();
			return matchesType && (!needle || haystack.includes(needle));
		});
	}

	function relationshipCount(profile: any) { return profileRelationships(profile).length; }
	function timelineCount(profile: any) { return visibleSections(profile).find((section: any) => section.kind === 'timeline')?.entries?.length ?? 0; }

	function sectionsForGroup(profile: any, group: string) {
		const ids = sectionGroups[group] ?? [];
		const base = visibleSections(profile).filter((section: any) => ids.includes(section.id));
		if (group === 'overview') return base.concat(visibleSections(profile).filter((section: any) => !Object.values(sectionGroups).flat().includes(section.id)));
		return base;
	}

	function profileRelationships(profile: any) {
		return (visibleSections(profile).find((section: any) => section.kind === 'relationships')?.relationships ?? []) as Relationship[];
	}

	function filteredRelationships(profile: any) {
		const needle = relationshipSearch.trim().toLowerCase();
		return profileRelationships(profile).filter((rel) =>
			(relationshipCategory === 'all' || (rel.category || 'Other') === relationshipCategory) &&
			(relationshipStatus === 'all' || (rel.status || 'current') === relationshipStatus) &&
			(!needle || `${rel.profileName} ${rel.fromLabel} ${rel.toLabel} ${rel.notes}`.toLowerCase().includes(needle))
		);
	}

	function backlinksTo(profileId: string) {
		return profiles.flatMap((profile) => profileRelationships(profile)
			.filter((rel) => rel.profileId === profileId)
			.map((rel) => ({ profile, rel })));
	}

	function sharedEvents(profileId: string) {
		return profiles.filter((profile) => profile.type === 'incident-event' && profileRelationships(profile).some((rel) => rel.profileId === profileId));
	}

	function possibleMentions(profile: any) {
		const needle = String(profile?.name || '').trim().toLowerCase();
		if (!needle) return [];
		return profiles.filter((candidate) => candidate.id !== profile.id && !profileRelationships(candidate).some((rel) => rel.profileId === profile.id) && visibleSections(candidate).some((section: any) => String(section.content || '').toLowerCase().includes(needle)));
	}

	function sectionText(section: any) {
		return String(section?.content ?? '').trim();
	}

	function labelGroups(section: any) {
		const groups = [
			{ key: 'main', title: 'Main labels', items: [] as string[] },
			{ key: 'associate', title: 'Associate labels', items: [] as string[] },
			{ key: 'system', title: 'System labels', items: [] as string[] },
			{ key: 'sensitive', title: 'Sensitive labels', items: [] as string[] }
		];
		let current = groups[0];
		for (const raw of sectionText(section).split('\n')) {
			const line = raw.trim();
			if (/^main labels?/i.test(line)) current = groups[0];
			else if (/^associate labels?/i.test(line)) current = groups[1];
			else if (/^system labels?/i.test(line)) current = groups[2];
			else if (/^sensitive labels?/i.test(line)) current = groups[3];
			else if (/^[-*]\s+/.test(line)) current.items.push(line.replace(/^[-*]\s+/, '').trim());
		}
		return groups.filter((group) => group.items.length);
	}

	function sectionMarkdown(section: any) {
		if (section.kind === 'relationships')
			return (
				(section.relationships ?? [])
					.map(
						(rel: any) =>
							`- ${rel.profileName || rel.profileId || 'Linked profile'}: ${rel.fromLabel || 'relationship'}${rel.fromDate ? ` | from ${rel.fromDate}` : ''}${rel.toDate ? ` | to ${rel.toDate}` : ''}${rel.status ? ` | ${rel.status}` : ''}${rel.notes ? ` — ${rel.notes}` : ''}`
					)
					.join('\n') || '_No relationships yet_'
			);
		if (section.kind === 'timeline')
			return (
				(section.entries ?? [])
					.map(
						(entry: any) =>
							`- ${entry.date || 'No date'} — ${entry.title || 'Untitled'}${entry.linkedFile ? ` — ${entry.linkedFile}` : ''}${entry.notes ? ` — ${entry.notes}` : ''}`
					)
					.join('\n') || '_No timeline entries yet_'
			);
		return String(section.content ?? '').trim() || '_No content_';
	}
	function markdownPreview() {
		if (!selectedProfile) return '';
		const lines = [
			`# MASTER PROFILE — ${selectedProfile.name || 'Untitled profile'}`,
			'',
			'Private / Internal / Eyes Only',
			''
		];
		for (const section of selectedProfile.sections ?? []) {
			if (section.canRead === false || section.loadIntoMcp === false) continue;
			lines.push('', `## ${section.title || 'Section'}`, '', sectionMarkdown(section));
		}
		return lines.join('\n').trim();
	}

	function formatRequestDate(value: string) {
		if (!value) return '';
		try {
			return new Date(value).toLocaleString();
		} catch {
			return value;
		}
	}

	function patchPreview(value: any) {
		try {
			return JSON.stringify(value ?? {}, null, 2);
		} catch {
			return String(value ?? '');
		}
	}

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function resolveProfileEditRequest(requestId: string, approved: boolean) {
		busy = true;
		error = '';
		requestMessage = approved ? 'Applying approved profile edit...' : 'Rejecting profile edit...';
		try {
			const result = await api.patch<any>(`/profiles/${workspaceId}/edit-requests/${requestId}`, {
				approved
			});
			await wait(150);
			await loadProfiles();
			await loadProfileEditRequests();
			const changed = result?.applied?.changed?.length
				? result.applied.changed.join(', ')
				: 'none reported';
			requestMessage = approved
				? `Profile edit approved, applied, and ${result?.applied?.verified ? 'verified' : 'saved'}. Changed: ${changed}.`
				: 'Profile edit rejected.';
			activeTab = 'requests';
		} catch (e: any) {
			error = e.message;
			requestMessage = '';
			await loadProfileEditRequests();
		} finally {
			busy = false;
		}
	}

	async function saveProfileEditor() {
		if (!selectedProfile) return;
		busy = true;
		error = '';
		try {
			await api.put(`/profiles/${workspaceId}/${selectedProfile.id}`, {
				name: selectedProfile.name,
				type: selectedProfile.type,
				status: selectedProfile.status,
				classification: selectedProfile.classification,
				restricted: Boolean(selectedProfile.restricted),
				srestricted: Boolean(selectedProfile.srestricted),
				fields: selectedProfile.fields ?? {},
				sections: selectedProfile.sections ?? []
			});
			await loadProfiles();
			closeEditor();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}
	async function refreshProfiles() {
		busy = true;
		error = '';
		try {
			await loadProfiles();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}

	onMount(loadWorkspaces);
</script>

<svelte:head><title>Profiles | OrbitFS</title></svelte:head>

<div class="mx-auto w-full max-w-6xl min-w-0 space-y-4 overflow-x-hidden p-4 md:p-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold">Profiles</h1>
			<p class="text-sm text-muted-foreground">
				People, relationships, history, references and MCP context — organised in one place.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded-md border px-3 py-2 text-sm"
				onclick={refreshProfiles}
				disabled={!workspaceId || busy || !systemEnabled}>Refresh profiles</button
			>
			<button
				type="button"
				class="rounded-md border px-3 py-2 text-sm"
				onclick={toggleEnabled}
				disabled={!workspaceId || busy || !systemEnabled}
				>{enabled ? 'Turn profiles off' : 'Turn profiles on'}</button
			>
			{#if canManageSystem}<button
					type="button"
					class="rounded-md border px-3 py-2 text-sm"
					onclick={toggleSystemEnabled}
					disabled={busy}>{systemEnabled ? 'Emergency disable' : 'Enable profile system'}</button
				>{/if}
		</div>
	</div>
	<div class="rounded-xl border p-4">
		<label for="workspace" class="mb-2 block text-sm font-medium">Workspace</label>
		<select
			id="workspace"
			class="w-full rounded-md border bg-background p-2"
			bind:value={workspaceId}
			onchange={loadProfiles}
		>
			{#each workspaces as workspace}<option value={workspace.id}>{workspace.name}</option>{/each}
		</select>
	</div>

	{#if systemEnabled && enabled}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Profiles</div><div class="mt-2 text-2xl font-semibold">{profiles.length}</div><div class="mt-1 text-xs text-muted-foreground">Available in this workspace</div></div>
			<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">My main profile</div><div class="mt-2 truncate text-base font-semibold">{profiles.find((profile) => profile.id === slots.master)?.name || 'Not set'}</div><div class="mt-1 text-xs text-muted-foreground">Personal to your user</div></div>
			<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Relationships</div><div class="mt-2 text-2xl font-semibold">{profiles.reduce((sum, profile) => sum + relationshipCount(profile), 0)}</div><div class="mt-1 text-xs text-muted-foreground">Linked across profiles</div></div>
			<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending edits</div><div class="mt-2 text-2xl font-semibold">{profileEditRequests.filter((request) => request.status === 'pending').length}</div><div class="mt-1 text-xs text-muted-foreground">Approval requests</div></div>
		</div>
	{/if}

	{#if error}<div class="rounded-md border border-destructive p-3 text-sm text-destructive">
			{error}
		</div>{/if}

	{#if systemEnabled && enabled}
		<div class="flex gap-2 overflow-x-auto rounded-xl border p-2">
			{#each [['profiles', 'Profiles'], ['bundles', `Bundles${profileBundles.length ? ` (${profileBundles.length})` : ''}`], ...(canReviewProfileRequests() ? [['requests', `Edit requests${profileEditRequests.filter((request) => request.status === 'pending').length ? ` (${profileEditRequests.filter((request) => request.status === 'pending').length})` : ''}`]] : []), ['slots', 'My profile'], ['loading', 'MCP & loading'], ['advanced', 'Import / export']] as tab}
				<button
					type="button"
					class="rounded-md px-3 py-2 text-sm whitespace-nowrap {activeTab === tab[0]
						? 'bg-primary text-primary-foreground'
						: 'hover:bg-muted'}"
					onclick={() => (activeTab = tab[0] as Tab)}>{tab[1]}</button
				>
			{/each}
		</div>

		{#if activeTab === 'profiles'}
			<section class="space-y-4 rounded-xl border p-4">
				<div>
					<h2 class="font-semibold">Workspace profiles</h2>
					<p class="text-sm text-muted-foreground">
						New profiles start with the blank base template.
					</p>
				</div>
				{#if permissions.create}
					<div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
						<input
							class="rounded-md border bg-background p-2"
							placeholder="Profile name"
							bind:value={name}
						/>
						<select class="rounded-md border bg-background p-2" bind:value={type}>
							<option value="person-master">Person / master</option><option value="child-dependent"
								>Child / dependent</option
							><option value="family-household">Family / household</option><option
								value="relationship-connection">Relationship / connection</option
							><option value="legal-court">Legal / court</option><option
								value="mental-health-wellbeing">Mental health / wellbeing</option
							><option value="medical-care">Medical / care</option><option value="incident-event"
								>Incident / event</option
							><option value="evidence-document-set">Evidence / document set</option><option
								value="project-workspace">Project / workspace</option
							><option value="organisation-service">Organisation / service</option><option
								value="location-place">Location / place</option
							><option value="custom">Custom</option>
						</select>
						<button
							type="button"
							class="rounded-md bg-primary px-3 py-2 text-primary-foreground"
							onclick={createProfile}
							disabled={busy}>Create</button
						>
					</div>
					<div class="flex flex-wrap gap-4 text-sm">
						<label class="flex items-center gap-2"
							><input type="checkbox" bind:checked={restricted} /> Restricted</label
						><label class="flex items-center gap-2"
							><input type="checkbox" bind:checked={srestricted} /> SRestricted</label
						>
					</div>
					<p class="text-xs text-muted-foreground">
						Restricted uses normal profile permissions. SRestricted is workspace owner plus system
						admin/owner only.
					</p>
				{/if}
				<div class="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
					<input class="rounded-md border bg-background p-2 text-sm" placeholder="Search profiles by name, type or classification" bind:value={profileSearch} />
					<select class="rounded-md border bg-background p-2 text-sm" bind:value={profileTypeFilter}>
						<option value="all">All profile types</option><option value="person-master">People</option><option value="child-dependent">Children / dependants</option><option value="family-household">Family / household</option><option value="relationship-connection">Relationships</option><option value="incident-event">Incidents / events</option><option value="legal-court">Legal / court</option><option value="mental-health-wellbeing">Mental health / wellbeing</option><option value="medical-care">Medical / care</option><option value="evidence-document-set">Evidence / document sets</option><option value="organisation-service">Organisations / services</option><option value="location-place">Locations / places</option><option value="custom">Custom</option>
					</select>
				</div>
				<div class="grid gap-3 lg:grid-cols-2">
					{#each filteredProfileList() as profile}
						<article class="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><strong class="truncate text-base">{profile.name}</strong>{#if slots.master === profile.id}<span class="rounded-full border px-2 py-0.5 text-[11px] font-medium">Me / main</span>{/if}{#if profile.restricted}<span class="rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive">Restricted</span>{/if}{#if profile.srestricted}<span class="rounded-full border border-destructive/60 px-2 py-0.5 text-[11px] text-destructive">SRestricted</span>{/if}</div>
									<p class="mt-1 text-xs text-muted-foreground">{profile.type} · {profile.status} · {profile.classification}</p></div>
							</div>
							<div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
								<div class="rounded-lg bg-muted/40 p-2"><div class="text-base font-semibold">{relationshipCount(profile)}</div><div class="text-muted-foreground">Links</div></div>
								<div class="rounded-lg bg-muted/40 p-2"><div class="text-base font-semibold">{timelineCount(profile)}</div><div class="text-muted-foreground">Timeline</div></div>
								<div class="rounded-lg bg-muted/40 p-2"><div class="text-base font-semibold">{sharedEvents(profile.id).length}</div><div class="text-muted-foreground">Events</div></div>
							</div>
							<div class="mt-4 flex flex-wrap gap-2"><button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onclick={() => openViewer(profile)}>Open</button><button type="button" class="rounded-md border px-3 py-1.5 text-sm" onclick={() => openEditor(profile)}>Edit</button>{#if permissions.delete}<button type="button" class="rounded-md border px-3 py-1.5 text-sm" onclick={() => removeProfile(profile.id)}>Delete</button>{/if}</div>
						</article>
					{:else}<div class="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground lg:col-span-2">No profiles match your search.</div>{/each}
				</div>
			</section>
		{:else if activeTab === 'bundles'}
			<section class="space-y-4">
				<div><h2 class="text-lg font-semibold">Profile bundles</h2><p class="text-sm text-muted-foreground">Attach profiles together without changing the profiles themselves. A profile can be in more than one bundle.</p></div>
				<div class="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
					<div class="rounded-xl border bg-card p-4 shadow-sm">
						<div class="flex items-center justify-between gap-3"><div><h3 class="font-medium">{editingBundleId ? 'Edit bundle' : 'Create bundle'}</h3><p class="text-xs text-muted-foreground">Choose any profiles that belong together.</p></div>{#if editingBundleId}<button type="button" class="rounded-md border px-3 py-1.5 text-xs" onclick={resetBundleEditor}>Cancel</button>{/if}</div>
						<input class="mt-4 w-full rounded-md border bg-background p-2" placeholder="Bundle name — e.g. Family" bind:value={bundleName} />
						<textarea class="mt-2 min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Optional note" bind:value={bundleDescription}></textarea>
						<div class="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">{#each profiles as profile}<label class="flex items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/30"><input type="checkbox" checked={bundleProfileIds.includes(profile.id)} onchange={() => toggleBundleProfile(profile.id)} /><span class="min-w-0"><span class="block truncate font-medium">{profile.name}</span><span class="block truncate text-[11px] text-muted-foreground">{profile.type}</span></span></label>{/each}</div>
						<button type="button" class="mt-4 w-full rounded-md bg-primary px-3 py-2 text-primary-foreground" onclick={saveBundle} disabled={!permissions.create || busy || !bundleName.trim()}>{editingBundleId ? 'Save bundle' : 'Create bundle'} · {bundleProfileIds.length} profiles</button>
					</div>
					<div class="grid content-start gap-3 lg:grid-cols-2">
						{#each profileBundles as bundle}<article class="rounded-xl border bg-card p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><h3 class="truncate font-semibold">{bundle.name}</h3><p class="mt-1 text-xs text-muted-foreground">{bundle.description || 'No note'}</p></div><span class="rounded-full border px-2 py-1 text-xs">{bundle.profileIds?.length || 0}</span></div><div class="mt-3 flex flex-wrap gap-1.5">{#each bundleProfiles(bundle) as profile}<span class="rounded-full border bg-muted/30 px-2 py-1 text-xs">{profile.name}</span>{:else}<span class="text-xs text-muted-foreground">No profiles selected.</span>{/each}</div><div class="mt-4 flex gap-2"><button type="button" class="rounded-md border px-3 py-1.5 text-sm" onclick={() => editBundle(bundle)}>Edit</button>{#if permissions.create}<button type="button" class="rounded-md border px-3 py-1.5 text-sm" onclick={() => removeBundle(bundle.id)}>Delete</button>{/if}</div></article>{:else}<div class="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground lg:col-span-2">No bundles yet. Create one and tick the profiles you want attached together.</div>{/each}
					</div>
				</div>
			</section>
		{:else if activeTab === 'requests'}
			<section class="space-y-4 rounded-xl border p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="font-semibold">ChatGPT profile edit requests</h2>
						<p class="text-sm text-muted-foreground">
							ChatGPT can request edits only. Workspace editors or owners approve before anything
							changes.
						</p>
					</div>
					<button
						type="button"
						class="rounded-md border px-3 py-2 text-sm"
						onclick={loadProfileEditRequests}
						disabled={busy}>Refresh requests</button
					>
				</div>
				{#if requestMessage}<div class="rounded-md border p-3 text-sm">{requestMessage}</div>{/if}
				<div class="space-y-3">
					{#each profileEditRequests as request}
						<article class="rounded-lg border p-3">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<strong class="block break-words"
										>{request.profileName || request.profileId}</strong
									>
									<p class="text-xs text-muted-foreground">
										Requested by {request.requestedBy || 'ChatGPT'} · {formatRequestDate(
											request.requestedAt
										)}
									</p>
								</div>
								<span class="rounded-full border px-2 py-1 text-xs">{request.status}</span>
							</div>
							<p class="mt-2 text-sm">{request.summary || 'No summary supplied.'}</p>
							<details class="mt-2">
								<summary class="cursor-pointer text-xs text-muted-foreground"
									>View proposed patch</summary
								>
								<pre
									class="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{patchPreview(
										request.patch
									)}</pre>
							</details>
							{#if request.status === 'pending'}
								<div class="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
										onclick={() => resolveProfileEditRequest(request.id, true)}
										disabled={busy}>Approve and apply</button
									>
									<button
										type="button"
										class="rounded-md border px-3 py-2 text-sm"
										onclick={() => resolveProfileEditRequest(request.id, false)}
										disabled={busy}>Reject</button
									>
								</div>
							{:else if request.resolvedBy}
								<p class="mt-2 text-xs text-muted-foreground">
									Resolved by {request.resolvedBy} · {formatRequestDate(request.resolvedAt || '')}
								</p>
							{/if}
						</article>
					{:else}<p class="py-8 text-center text-sm text-muted-foreground">
							No profile edit requests.
						</p>{/each}
				</div>
			</section>
		{:else if activeTab === 'slots'}
			<section class="space-y-4">
				<div><h2 class="text-lg font-semibold">My profile</h2><p class="text-sm text-muted-foreground">Choose the profile that represents you, plus one optional personal context profile. These choices belong to your user only.</p></div>
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="mb-3"><div class="font-medium">Main profile</div><div class="text-xs text-muted-foreground">Me / myself, if a profile for you exists.</div></div><select class="w-full rounded-md border bg-background p-2" bind:value={slots.master}><option value={null}>Not set</option>{#each profiles as profile}<option value={profile.id}>{profile.name}</option>{/each}</select>{#if slots.master}<div class="mt-3 rounded-lg bg-muted/40 p-3 text-sm">This profile is marked <strong>Me / main</strong> throughout Profiles.</div>{/if}</div>
					<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="mb-3"><div class="font-medium">Additional personal context</div><div class="text-xs text-muted-foreground">Optional second profile to include with your personal defaults.</div></div><select class="w-full rounded-md border bg-background p-2" bind:value={slots.additional}><option value={null}>Off</option>{#each profiles as profile}<option value={profile.id}>{profile.name}</option>{/each}</select></div>
				</div>
				<div class="flex justify-end"><button type="button" class="rounded-md bg-primary px-4 py-2 text-primary-foreground" onclick={saveSlots} disabled={!permissions.load_context || busy}>Save my profile settings</button></div>
			</section>
		{:else if activeTab === 'loading'}
			<section class="space-y-4">
				<div><h2 class="text-lg font-semibold">MCP & loading</h2><p class="text-sm text-muted-foreground">Control how Profiles feeds context into MCP. Profile restrictions, section read rules and per-section MCP switches still apply.</p></div>
				<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
					<div class="space-y-4">
						<div class="rounded-xl border bg-card p-4 shadow-sm"><h3 class="font-medium">Context detail</h3><p class="mt-1 text-xs text-muted-foreground">Choose the default amount of profile detail MCP receives.</p><select class="mt-3 w-full rounded-md border bg-background p-2" bind:value={settings.startupMode}><option value="summary">Summary — compact essentials</option><option value="standard">Standard — balanced context</option><option value="full">Full — all allowed detail</option></select></div>
						<div class="rounded-xl border bg-card p-4 shadow-sm"><h3 class="font-medium">Personal profile loading</h3><label class="mt-3 flex items-start gap-3 rounded-lg border p-3 text-sm"><input class="mt-0.5" type="checkbox" bind:checked={settings.loadUserSlots} /><span><strong>Load each member's personal profile choices</strong><span class="mt-1 block text-xs text-muted-foreground">Uses each user's Main profile and optional additional personal context profile.</span></span></label></div>
						<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="flex items-center justify-between gap-3"><div><h3 class="font-medium">Workspace defaults</h3><p class="mt-1 text-xs text-muted-foreground">Profiles selected here are included for everyone when profile loading is used.</p></div><span class="rounded-full border px-2 py-1 text-xs">{settings.loadWorkspaceProfiles.length} selected</span></div><div class="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{#each profiles as profile}<label class="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/30"><input type="checkbox" checked={settings.loadWorkspaceProfiles.includes(profile.id)} onchange={() => toggleAlwaysLoad(profile.id)} /><span class="min-w-0"><span class="block truncate font-medium">{profile.name}</span><span class="block truncate text-[11px] text-muted-foreground">{profile.type}</span></span></label>{/each}</div></div>
					</div>
					<div class="space-y-4"><div class="rounded-xl border bg-card p-4 shadow-sm xl:sticky xl:top-4"><div class="flex items-center justify-between gap-3"><h3 class="font-medium">MCP preview</h3><span class="rounded-full border px-2 py-1 text-[11px]">{settings.startupMode}</span></div><div class="mt-3 min-h-32 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs">{modulePreview?.module?.summary || 'No profiles currently load.'}</div><div class="mt-3 space-y-1 text-xs text-muted-foreground"><div>Personal choices: {settings.loadUserSlots ? 'Enabled' : 'Disabled'}</div><div>Workspace defaults: {settings.loadWorkspaceProfiles.length}</div><div>Restricted/SRestricted access is still enforced.</div></div></div></div>
				</div>
				<div class="flex justify-end"><button type="button" class="rounded-md bg-primary px-4 py-2 text-primary-foreground" onclick={saveLoadingRules} disabled={!permissions.manage_startup || busy}>Save MCP loading settings</button></div>
			</section>
		{:else}
			<section class="space-y-4">
				<div><h2 class="text-lg font-semibold">Import / export</h2><p class="text-sm text-muted-foreground">Move profiles between workspaces, restore bundles, or start from the blank OrbitFS profile template.</p></div>
				<div class="grid gap-4 xl:grid-cols-2">
					<div class="rounded-xl border bg-card p-4 shadow-sm"><div class="mb-3"><h3 class="font-medium">Import profiles</h3><p class="text-xs text-muted-foreground">Supports ZIP, JSON, Markdown, text, PDF and DOCX profile sources.</p></div><label class="inline-flex cursor-pointer rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Choose files<input class="hidden" type="file" multiple accept=".zip,application/zip,.json,.md,.markdown,.txt,.pdf,.docx,application/json,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onchange={chooseImportFile}/></label>{#if importFilename}<div class="mt-3 rounded-lg bg-muted/40 p-3 text-xs"><strong>Selected:</strong> {importFilename}{#if importFiles.length > 1}<div class="mt-1 break-words text-muted-foreground">{importFiles.map((file) => file.name).join(', ')}</div>{/if}</div>{/if}<textarea class="mt-3 min-h-44 w-full rounded-md border bg-background p-3 font-mono text-xs" bind:value={importText} placeholder={importFiles.length ? 'Selected files are ready to import' : 'Or paste profile JSON here'}></textarea><label class="mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm"><input class="mt-0.5" type="checkbox" bind:checked={replaceAll}/><span><strong>Replace existing profiles</strong><span class="block text-xs text-muted-foreground">Only replaces after at least one valid profile successfully imports.</span></span></label><button type="button" class="mt-3 w-full rounded-md bg-primary px-3 py-2 text-primary-foreground" onclick={importProfiles} disabled={!permissions.import || busy || (!importFiles.length && !importText.trim())}>Apply import</button></div>
					<div class="space-y-4"><div class="rounded-xl border bg-card p-4 shadow-sm"><h3 class="font-medium">Export workspace profiles</h3><p class="mt-1 text-xs text-muted-foreground">Download the current workspace profile system as a portable ZIP bundle.</p><button type="button" class="mt-4 w-full rounded-md bg-primary px-3 py-2 text-primary-foreground" onclick={exportProfiles} disabled={!permissions.export || busy}>Export workspace</button></div><div class="rounded-xl border bg-card p-4 shadow-sm"><h3 class="font-medium">Blank profile template</h3><p class="mt-1 text-xs text-muted-foreground">Load the current blank template into the editor for manual preparation or copying.</p><button type="button" class="mt-4 w-full rounded-md border px-3 py-2 text-sm" onclick={loadTemplate}>Load blank template</button></div>{#if exportText}<div class="rounded-xl border bg-card p-4 shadow-sm"><h3 class="font-medium">Template / export preview</h3><textarea class="mt-3 min-h-48 w-full rounded-md border bg-background p-3 font-mono text-xs" readonly value={exportText}></textarea></div>{/if}</div>
				</div>
			</section>
		{/if}
	{:else}
		<div class="rounded-xl border p-8 text-center">
			<h2 class="font-semibold">
				{systemEnabled
					? 'Profiles are off for this workspace'
					: 'Workspace Profiles is emergency-disabled'}
			</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				{systemEnabled
					? 'Turn them on to create profiles.'
					: 'A system administrator disabled the profile subsystem.'}
			</p>
		</div>
	{/if}

	{#if importResult}
		<div class="rounded-lg border bg-background p-3 text-sm shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<strong>Import finished</strong>
					<p class="text-xs text-muted-foreground">
						Imported {importResult.imported ?? 0}. Skipped or repaired {importResult.failed ?? 0}.
					</p>
					{#if importResult.files?.length}
						<div class="mt-2 space-y-1 text-xs">
							{#each importResult.files as file}
								<div class={file.error ? 'text-destructive' : 'text-muted-foreground'}>
									{file.name}: {file.error ? file.error : `${file.imported} imported${file.failed ? `, ${file.failed} failed` : ''}`}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="rounded-md border px-2 py-1 text-xs"
					onclick={() => (importResult = null)}>Close</button
				>
			</div>
		</div>
	{/if}
	{#if viewingProfile}
		<div
			class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-2 py-3 sm:px-4 sm:py-6"
			role="presentation"
		>
			<div
				class="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-xl border bg-background shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
				role="dialog"
				aria-modal="true"
				aria-label="View profile"
			>
				<div class="sticky top-0 z-20 border-b bg-background/95 p-3 backdrop-blur sm:p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="mb-2 flex flex-wrap gap-2 text-xs">
								<span class="rounded-full border px-2 py-1">{viewingProfile.type || 'Profile'}</span
								>
								<span class="rounded-full border px-2 py-1"
									>{viewingProfile.status || 'No status'}</span
								>
								{#if viewingProfile.restricted}<span
										class="rounded-full border border-destructive/40 px-2 py-1 text-destructive"
										>Restricted</span
									>{/if}
							</div>
							<h2 class="text-lg font-semibold break-words sm:text-2xl">{viewingProfile.name}</h2>
							<p class="mt-1 text-sm text-muted-foreground">{viewingProfile.classification}</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<button
								type="button"
								class="rounded-md border px-3 py-2 text-sm"
								onclick={() => {
									const copy = viewingProfile;
									closeViewer();
									openEditor(copy);
								}}>Edit</button
							>
							<button
								type="button"
								class="rounded-md border px-3 py-2 text-sm"
								onclick={closeViewer}>Close</button
							>
						</div>
					</div>
				</div>
				<div class="space-y-3 p-3 sm:space-y-4 sm:p-4">
					<div class="grid gap-3 md:grid-cols-4">
						<div class="rounded-xl border bg-muted/30 p-3">
							<div class="text-xs text-muted-foreground">Type</div>
							<div class="font-medium">{viewingProfile.type || '—'}</div>
						</div>
						<div class="rounded-xl border bg-muted/30 p-3">
							<div class="text-xs text-muted-foreground">Status</div>
							<div class="font-medium">{viewingProfile.status || '—'}</div>
						</div>
						<div class="rounded-xl border bg-muted/30 p-3">
							<div class="text-xs text-muted-foreground">Classification</div>
							<div class="font-medium">{viewingProfile.classification || '—'}</div>
						</div>
						<div class="rounded-xl border bg-muted/30 p-3">
							<div class="text-xs text-muted-foreground">Sections</div>
							<div class="font-medium">{visibleSections(viewingProfile).length}</div>
						</div>
					</div>

					<div class="flex gap-2 overflow-x-auto rounded-lg border p-2">
						{#each [['overview','Overview'],['relationships','Relationships'],['history','History'],['records','Records'],['references','References'],['private','Private'],['system','System']] as item}
							<button type="button" class="rounded-md px-3 py-2 text-sm whitespace-nowrap {viewerTab === item[0] ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}" onclick={() => (viewerTab = item[0])}>{item[1]}</button>
						{/each}
					</div>
					{#if viewerTab === 'relationships'}
						<div class="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
							<input class="rounded-md border bg-background p-2 text-sm" placeholder="Search relationships" bind:value={relationshipSearch} />
							<select class="rounded-md border bg-background p-2 text-sm" bind:value={relationshipCategory}><option value="all">All groups</option>{#each relationshipCategories as category}<option value={category}>{category}</option>{/each}</select>
							<select class="rounded-md border bg-background p-2 text-sm" bind:value={relationshipStatus}><option value="all">All statuses</option><option value="current">Current</option><option value="historical">Historical</option><option value="inactive">Inactive</option></select>
						</div>
					{/if}
					{#if viewerTab === 'references'}
						<div class="grid gap-3 lg:grid-cols-3">
							<div class="rounded-xl border p-4"><h3 class="font-semibold">Referenced by</h3><div class="mt-2 space-y-2">{#each backlinksTo(viewingProfile.id) as item}<button type="button" class="block w-full rounded-md border p-2 text-left text-sm hover:bg-muted" onclick={() => openViewer(item.profile)}><strong>{item.profile.name}</strong><div class="text-xs text-muted-foreground">{item.rel.fromLabel || 'Linked'} → {item.rel.toLabel || 'linked profile'}</div></button>{:else}<p class="text-sm text-muted-foreground">No profile backlinks yet.</p>{/each}</div></div>
							<div class="rounded-xl border p-4"><h3 class="font-semibold">Shared events</h3><div class="mt-2 space-y-2">{#each sharedEvents(viewingProfile.id) as event}<button type="button" class="block w-full rounded-md border p-2 text-left text-sm hover:bg-muted" onclick={() => openViewer(event)}>{event.name}</button>{:else}<p class="text-sm text-muted-foreground">No linked incident/event profiles yet.</p>{/each}</div></div>
							<div class="rounded-xl border p-4"><h3 class="font-semibold">Possible mentions</h3><p class="mt-1 text-xs text-muted-foreground">Other profiles containing this profile name but not yet explicitly linked.</p><div class="mt-2 space-y-2">{#each possibleMentions(viewingProfile) as candidate}<button type="button" class="block w-full rounded-md border p-2 text-left text-sm hover:bg-muted" onclick={() => openViewer(candidate)}>{candidate.name}</button>{:else}<p class="text-sm text-muted-foreground">No unlinked profile mentions found.</p>{/each}</div></div>
						</div>
					{/if}
					<div class="grid gap-3 lg:grid-cols-2">
						{#each sectionsForGroup(viewingProfile, viewerTab) as section}
							<article
								class="rounded-xl border bg-card p-4 shadow-sm {[
									'timeline',
									'relationships',
									'key-events',
									'current-status'
								].includes(section.id)
									? 'lg:col-span-2'
									: ''}"
							>
								<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
									<h3 class="font-semibold">{section.title}</h3>
									<div class="flex gap-1 text-[11px] text-muted-foreground">
										{#if section.canRead === false}<span class="rounded-full border px-2 py-0.5"
												>Blocked</span
											>{/if}
										{#if section.loadIntoMcp === false}<span class="rounded-full border px-2 py-0.5"
												>No MCP</span
											>{/if}
									</div>
								</div>
								{#if section.kind === 'labels'}
									<div class="grid gap-2 sm:grid-cols-2">
										{#each labelGroups(section) as group}
											<div class="rounded-lg border bg-muted/20 p-3">
												<div class="mb-2 text-xs font-medium text-muted-foreground">
													{group.title}
												</div>
												<div class="flex flex-wrap gap-1.5">
													{#each group.items as item}<span
															class="rounded-full border px-2 py-1 text-xs">{item}</span
														>{/each}
												</div>
											</div>
										{:else}<p class="text-sm text-muted-foreground">No labels recorded.</p>{/each}
									</div>
								{:else if section.kind === 'relationships'}
									<div class="grid gap-3 md:grid-cols-2">
										{#each filteredRelationships(viewingProfile) as rel}
											<div class="rounded-xl border bg-muted/20 p-3">
												<div class="flex flex-wrap items-start justify-between gap-2"><div><div class="font-medium">{rel.profileName || rel.profileId || 'External relationship'}</div><div class="mt-1 text-sm font-medium">{rel.fromLabel || 'Relationship'}</div></div><div class="flex flex-wrap gap-1">{#if rel.status}<span class="rounded-full border px-2 py-1 text-[10px]">{rel.status === 'active' ? 'current' : rel.status}</span>{/if}{#if isGeneratedRelationship(rel)}<span class="rounded-full border px-2 py-1 text-[10px]">Auto linked</span>{/if}</div></div>
												<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{#if rel.fromDate}<span>From {rel.fromDate}</span>{/if}{#if rel.toDate}<span>To {rel.toDate}</span>{/if}</div>
												{#if rel.notes}<p class="mt-2 text-sm">{rel.notes}</p>{/if}
											</div>
										{:else}<p class="text-sm text-muted-foreground">No relationships recorded.</p>{/each}
									</div>
								{:else if section.kind === 'timeline'}
									<div class="space-y-2">
										{#each section.entries ?? [] as entry}
											<div class="rounded-lg border bg-muted/20 p-3">
												<div class="text-xs text-muted-foreground">{entry.date || 'No date'}</div>
												<div class="font-medium">{entry.title || 'Untitled'}</div>
												{#if entry.linkedFile}<div class="mt-1 text-xs text-muted-foreground">
														Linked: {entry.linkedFile}
													</div>{/if}{#if entry.notes}<p class="mt-2 text-sm">{entry.notes}</p>{/if}
											</div>
										{:else}<p class="text-sm text-muted-foreground">
												No timeline entries recorded.
											</p>{/each}
									</div>
								{:else}
									<div class="text-sm leading-6 break-words whitespace-pre-wrap">
										{sectionText(section) || 'No content recorded.'}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
	{#if selectedProfile}
		<div
			class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-2 py-3 sm:px-4 sm:py-6"
			role="presentation"
		>
			<div
				class="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl overflow-y-auto rounded-xl border bg-background shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
				role="dialog"
				aria-modal="true"
				aria-label="Edit profile"
			>
				<div
					class="sticky top-0 z-20 mb-3 flex items-start justify-between gap-3 border-b bg-background/95 p-3 backdrop-blur sm:mb-4 sm:p-4"
				>
					<div>
						<div class="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span class="rounded-full border px-2 py-1">{selectedProfile.type}</span><span class="rounded-full border px-2 py-1">{selectedProfile.status}</span>{#if selectedProfile.restricted}<span class="rounded-full border border-destructive/40 px-2 py-1 text-destructive">Restricted</span>{/if}</div>
						<h2 class="text-xl font-semibold sm:text-2xl">{selectedProfile.name || 'Edit profile'}</h2>
						<p class="text-sm text-muted-foreground">Edit the record by category instead of scrolling through every field.</p>
					</div>
					<button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={closeEditor}
						>Close</button
					>
				</div>

				<div class="mx-3 mb-4 flex gap-2 overflow-x-auto rounded-xl border bg-muted/20 p-2 sm:mx-4">
					{#each editorTabs as tab}<button type="button" class="rounded-lg px-3 py-2 text-sm whitespace-nowrap {editorGroup === tab[0] ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-background'}" onclick={() => (editorGroup = tab[0])}>{tab[1]}</button>{/each}
				</div>
				{#if editorGroup === 'identity'}
				<div class="grid gap-3 px-3 sm:px-4 md:grid-cols-2">
					<label class="block text-sm"
						>Profile name<input
							class="mt-1 w-full rounded-md border bg-background p-2"
							bind:value={selectedProfile.name}
						/></label
					>
					<label class="block text-sm"
						>Profile type<select
							class="mt-1 w-full rounded-md border bg-background p-2"
							bind:value={selectedProfile.type}
							><option value="person-master">Person / master</option><option value="child-dependent"
								>Child / dependent</option
							><option value="family-household">Family / household</option><option
								value="relationship-connection">Relationship / connection</option
							><option value="legal-court">Legal / court</option><option
								value="mental-health-wellbeing">Mental health / wellbeing</option
							><option value="medical-care">Medical / care</option><option value="incident-event"
								>Incident / event</option
							><option value="evidence-document-set">Evidence / document set</option><option
								value="project-workspace">Project / workspace</option
							><option value="organisation-service">Organisation / service</option><option
								value="location-place">Location / place</option
							><option value="custom">Custom</option></select
						></label
					>
					<label class="block text-sm"
						>Status<select
							class="mt-1 w-full rounded-md border bg-background p-2"
							bind:value={selectedProfile.status}
							><option value="active">Active</option><option value="inactive">Inactive</option
							><option value="archived">Archived</option></select
						></label
					>
					<label class="block text-sm"
						>Classification<select
							class="mt-1 w-full rounded-md border bg-background p-2"
							bind:value={selectedProfile.classification}
							><option value="personal-record">Personal record</option><option
								value="core-identity-record">Core identity record</option
							><option value="family-context">Family context</option><option value="legal-sensitive"
								>Legal-sensitive</option
							><option value="child-sensitive">Child-sensitive</option><option
								value="health-sensitive">Health-sensitive</option
							><option value="evidence-record">Evidence record</option><option
								value="system-technical">System / technical</option
							><option value="private-internal">Private internal</option><option
								value="restricted-eyes-only">Restricted / eyes only</option
							></select
						>
						<p class="mt-1 text-xs text-muted-foreground">
							Classification controls sensitivity, access hints, and MCP loading behaviour.
						</p></label
					>
				</div>
				{/if}
				{#if editorGroup === 'access'}
				<div class="mx-3 mt-3 grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:mx-4">
					<label class="flex items-center gap-2"
						><input type="checkbox" bind:checked={selectedProfile.restricted} /> Restricted</label
					><label class="flex items-center gap-2"
						><input type="checkbox" bind:checked={selectedProfile.srestricted} /> SRestricted</label
					>
					<p class="text-xs text-muted-foreground">
						Restricted uses normal profile permissions. SRestricted is only visible/editable to
						workspace owner and system admin/owner.
					</p>
				</div>
				{/if}

				<div class="mt-4 space-y-2 px-3 sm:space-y-3 sm:px-4">
					{#if editorGroup === 'private'}
					<div class="flex flex-wrap gap-2 rounded-lg border p-3">
						<input
							class="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm"
							placeholder="Add custom section"
							bind:value={newSectionTitle}
						/>
						<button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={addSection}
							>Add custom section</button
						>
					</div>
					{/if}

					{#each selectedProfile.sections ?? [] as section, index}
						{#if editorSectionVisible(section)}
						<article class="rounded-lg border p-3">
							<div class="mb-3 flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									{#if section.locked}<h3 class="font-semibold">{section.title}</h3>{:else}<input class="w-full rounded-md border bg-background p-2 text-sm font-medium" value={section.title ?? ''} oninput={(event) => updateSection(index,{title:(event.currentTarget as HTMLInputElement).value})} />{/if}
									<p class="mt-1 text-xs text-muted-foreground">{sectionInfo[section.id] ?? sectionInfo[section.kind ?? 'custom'] ?? 'Custom section.'}</p>
								</div>
							</div>

							{#if section.kind === 'labels'}
								<div class="grid gap-3 lg:grid-cols-2">
									{#each [['primary','Primary','Identity and role labels'],['context','Context','Search and descriptive labels'],['system','System','OrbitFS and workflow labels'],['sensitive','Sensitive','Restricted metadata']] as group}
										{#if canViewLabelGroup(group[0])}<div class="rounded-xl border bg-muted/20 p-3">
											<div class="flex items-start justify-between gap-2"><div><h4 class="font-medium">{group[1]}</h4><p class="text-xs text-muted-foreground">{group[2]}</p></div>{#if !canEditLabelGroup(group[0])}<span class="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">Read only</span>{/if}</div>
											<div class="mt-3 flex min-h-9 flex-wrap gap-2">{#each parseEditorLabels(section)[group[0]] as label}<span class="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs">{label}{#if canEditLabelGroup(group[0])}<button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => removeEditorLabel(index,group[0],label)}>×</button>{/if}</span>{:else}<span class="text-xs text-muted-foreground">No labels</span>{/each}</div>
											{#if canEditLabelGroup(group[0])}<div class="mt-3 flex gap-2"><input class="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm" placeholder="Add label" value={labelDraft[group[0]] || ''} oninput={(event) => (labelDraft={...labelDraft,[group[0]]:(event.currentTarget as HTMLInputElement).value})} onkeydown={(event) => { if(event.key==='Enter'){event.preventDefault();addEditorLabel(index,group[0]);} }} /><button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={() => addEditorLabel(index,group[0])}>Add</button></div>{/if}
										</div>{:else}<div class="rounded-xl border border-dashed p-4"><h4 class="font-medium">Sensitive</h4><p class="mt-1 text-xs text-muted-foreground">Hidden — restricted profile permission required.</p></div>{/if}
									{/each}
								</div>
										{:else if section.kind === 'relationships'}
				<div class="space-y-3">
					<div class="rounded-xl border bg-muted/20 p-3"><div class="font-medium">Relationships</div><p class="mt-1 text-xs text-muted-foreground">Choose who the linked person is to this profile. OrbitFS automatically adds the inverse relationship to their profile.</p></div>
					{#each section.relationships ?? [] as rel, relIndex}
						{#if isGeneratedRelationship(rel)}
							<div class="rounded-xl border bg-muted/20 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><div><div class="font-medium">{rel.profileName || 'Linked profile'}</div><div class="text-sm">{rel.fromLabel || 'Relationship'}</div></div><span class="rounded-full border px-2 py-1 text-[11px]">Auto linked</span></div><div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{#if rel.fromDate}<span>From {rel.fromDate}</span>{/if}{#if rel.toDate}<span>To {rel.toDate}</span>{/if}{#if rel.status}<span>{rel.status}</span>{/if}</div>{#if rel.notes}<p class="mt-2 text-sm">{rel.notes}</p>{/if}</div>
						{:else}
							<div class="rounded-xl border p-3 sm:p-4"><div class="mb-3 flex items-center justify-between gap-2"><div class="font-medium">Relationship {relIndex + 1}</div><button type="button" class="rounded-md border px-2 py-1 text-xs" onclick={() => removeRelationship(index, relIndex)}>Remove</button></div>
								<div class="grid gap-3 md:grid-cols-2"><label class="space-y-1 text-xs"><span class="font-medium">Person</span><select class="w-full rounded-md border bg-background p-2 text-sm" value={rel.profileId ?? ''} onchange={(event) => { const el=event.currentTarget as HTMLSelectElement; const option=el.selectedOptions[0]; updateRelationship(index, relIndex, { profileId: el.value, profileName: el.value ? (option?.textContent ?? '') : rel.profileName, autoSync: Boolean(el.value) }); }}><option value="">External / not a profile</option>{#each profiles.filter((profile) => profile.id !== selectedProfile.id) as profile}<option value={profile.id}>{profile.name}</option>{/each}</select></label><label class="space-y-1 text-xs"><span class="font-medium">They are my...</span><select class="w-full rounded-md border bg-background p-2 text-sm" value={relationshipChoiceId(rel)} onchange={(event) => applyRelationshipChoice(index, relIndex, (event.currentTarget as HTMLSelectElement).value)}><option value="custom">Custom</option>{#each relationshipChoices as choice}<option value={choice.id}>{choice.label}</option>{/each}</select></label></div>
								{#if !rel.profileId}<label class="mt-3 block space-y-1 text-xs"><span class="font-medium">Name</span><input class="w-full rounded-md border bg-background p-2 text-sm" placeholder="Name or reference" value={rel.profileName ?? ''} oninput={(event) => updateRelationship(index, relIndex, { profileName: (event.currentTarget as HTMLInputElement).value })}/></label>{/if}
								{#if relationshipChoiceId(rel) === 'custom'}<div class="mt-3 grid gap-2 md:grid-cols-2"><label class="space-y-1 text-xs"><span class="font-medium">They are my...</span><input class="w-full rounded-md border bg-background p-2 text-sm" value={rel.fromLabel ?? ''} oninput={(event) => updateRelationship(index, relIndex, { fromLabel: (event.currentTarget as HTMLInputElement).value, presetId: 'custom' })}/></label><label class="space-y-1 text-xs"><span class="font-medium">I am their...</span><input class="w-full rounded-md border bg-background p-2 text-sm" value={rel.toLabel ?? ''} oninput={(event) => updateRelationship(index, relIndex, { toLabel: (event.currentTarget as HTMLInputElement).value, presetId: 'custom' })}/></label></div>{/if}
								<div class="mt-3 grid gap-2 md:grid-cols-3"><label class="space-y-1 text-xs"><span class="font-medium">From</span><input type="date" class="w-full rounded-md border bg-background p-2 text-sm" value={rel.fromDate ?? ''} oninput={(event) => updateRelationship(index, relIndex, { fromDate: (event.currentTarget as HTMLInputElement).value })}/></label><label class="space-y-1 text-xs"><span class="font-medium">To</span><input type="date" class="w-full rounded-md border bg-background p-2 text-sm" value={rel.toDate ?? ''} oninput={(event) => updateRelationship(index, relIndex, { toDate: (event.currentTarget as HTMLInputElement).value })}/></label><label class="space-y-1 text-xs"><span class="font-medium">Status</span><select class="w-full rounded-md border bg-background p-2 text-sm" value={rel.status === 'active' ? 'current' : (rel.status || 'current')} onchange={(event) => updateRelationship(index, relIndex, { status: (event.currentTarget as HTMLSelectElement).value })}><option value="current">Current</option><option value="historical">Historical</option><option value="inactive">Inactive</option></select></label></div>
								<label class="mt-3 block space-y-1 text-xs"><span class="font-medium">Notes</span><textarea class="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Optional context" value={rel.notes ?? ''} oninput={(event) => updateRelationship(index, relIndex, { notes: (event.currentTarget as HTMLTextAreaElement).value })}></textarea></label>
								{#if rel.profileId && rel.toLabel}<p class="mt-2 text-xs text-muted-foreground">Auto adds <strong>{rel.toLabel}</strong> on {rel.profileName || 'the linked profile'}.</p>{/if}</div>
						{/if}
					{:else}<p class="text-xs text-muted-foreground">No relationships yet.</p>{/each}
					<button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={() => addRelationship(index)}>Add relationship</button>
				</div>{:else if section.kind === 'timeline'}
								<div class="space-y-2">
									{#each section.entries ?? [] as entry, entryIndex}
										<div
											class="grid gap-2 rounded-md border p-2 md:grid-cols-[130px_1fr_1fr_1fr_auto]"
										>
											<input
												class="rounded-md border bg-background p-2 text-sm"
												placeholder="Date"
												value={entry.date ?? ''}
												oninput={(event) =>
													updateTimelineEntry(index, entryIndex, {
														date: (event.currentTarget as HTMLInputElement).value
													})}
											/>
											<input
												class="rounded-md border bg-background p-2 text-sm"
												placeholder="Title"
												value={entry.title ?? ''}
												oninput={(event) =>
													updateTimelineEntry(index, entryIndex, {
														title: (event.currentTarget as HTMLInputElement).value
													})}
											/>
											<input
												class="rounded-md border bg-background p-2 text-sm"
												placeholder="Linked file"
												value={entry.linkedFile ?? ''}
												oninput={(event) =>
													updateTimelineEntry(index, entryIndex, {
														linkedFile: (event.currentTarget as HTMLInputElement).value
													})}
											/>
											<input
												class="rounded-md border bg-background p-2 text-sm"
												placeholder="Brief notes"
												value={entry.notes ?? ''}
												oninput={(event) =>
													updateTimelineEntry(index, entryIndex, {
														notes: (event.currentTarget as HTMLInputElement).value
													})}
											/>
											<button
												type="button"
												class="rounded-md border px-2 py-1 text-xs"
												onclick={() => removeTimelineEntry(index, entryIndex)}>Remove</button
											>
										</div>
									{:else}<p class="text-xs text-muted-foreground">
											No timeline entries yet.
										</p>{/each}
									<button
										type="button"
										class="rounded-md border px-3 py-2 text-sm"
										onclick={() => addTimelineEntry(index)}>Add timeline entry</button
									>
								</div>
							{:else}
								<textarea
									class="min-h-32 w-full rounded-md border bg-background p-2 text-sm"
									value={section.content ?? ''}
									oninput={(event) =>
										updateSection(index, {
											content: (event.currentTarget as HTMLTextAreaElement).value
										})}></textarea>
							{/if}

							<details class="mt-4 rounded-lg border bg-muted/10 p-3"><summary class="cursor-pointer text-xs font-medium text-muted-foreground">Advanced section settings</summary><div class="mt-3 flex flex-wrap gap-2">
								<button type="button" class="rounded border px-2 py-1 text-xs" onclick={() => moveSection(index,-1)} disabled={index===0}>Move up</button><button type="button" class="rounded border px-2 py-1 text-xs" onclick={() => moveSection(index,1)} disabled={index===selectedProfile.sections.length-1}>Move down</button>{#if !section.locked}<button type="button" class="rounded border px-2 py-1 text-xs" onclick={() => removeSection(index)}>Remove section</button>{/if}
							</div>
							<div class="mt-3 grid gap-2 text-xs sm:grid-cols-3">
								<label class="flex items-center gap-2 rounded-md border p-2"
									><input
										type="checkbox"
										checked={section.canRead !== false}
										onchange={(event) =>
											updateSection(index, {
												canRead: (event.currentTarget as HTMLInputElement).checked
											})}
									/> Can be read</label
								>
								<label class="flex items-center gap-2 rounded-md border p-2"
									><input
										type="checkbox"
										checked={section.loadIntoMcp !== false}
										onchange={(event) =>
											updateSection(index, {
												loadIntoMcp: (event.currentTarget as HTMLInputElement).checked
											})}
									/> Load into MCP</label
								>
								<select
									class="rounded-md border bg-background p-2"
									value={section.detailLevel ?? 'summary'}
									onchange={(event) =>
										updateSection(index, {
											detailLevel: (event.currentTarget as HTMLSelectElement).value
										})}
									><option value="summary">Summary</option><option value="full">Full</option
									></select
								>
							</div>
							<label class="mt-2 block text-xs"
								>Linked source file / note
								<input
									class="mt-1 w-full rounded-md border bg-background p-2"
									value={section.sourcePath ?? ''}
									placeholder="Optional source path"
									oninput={(event) =>
										updateSection(index, {
											sourcePath: (event.currentTarget as HTMLInputElement).value
										})}
								/>
							</label>
							</details>
						</article>
						{/if}
					{/each}
				</div>

				<div class="mx-3 mt-4 rounded-lg border p-3 sm:mx-4">
					<div class="mb-2">
						<h3 class="font-semibold">Export / MCP preview</h3>
						<p class="text-xs text-muted-foreground">Same template shape used for export.</p>
					</div>
					<pre
						class="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{markdownPreview()}</pre>
				</div>
				<div
					class="sticky bottom-0 z-20 mt-4 flex justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur sm:p-4"
				>
					<button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={closeEditor}
						>Cancel</button
					><button
						type="button"
						class="rounded-md bg-primary px-4 py-2 text-primary-foreground"
						onclick={saveProfileEditor}
						disabled={busy}>Save profile</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>
