import { randomUUID, verify } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getSupabaseAdmin } from '$lib/server/supabase';

export const PANEL_COMPONENT = 'orbitfs_panel';
const LICENSE_ID = 'primary';
const DEFAULT_PROVIDER = 'https://license.incendiarynetworks.cc';
const DEFAULT_VALIDATE_PATH = '/api/license/validate';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAqAHPTGUEd1LkTFxngD5o
CiN+YbFIei69WO3PnR7OMYdtxIBShPq3PK+80zFRvhpQzpBtc+CsIQY0WPLmnC9t
RepQctzSHQg9f3sosFkw812jPZtYvwcmNAo2X3K3vzY004VUHzTk7EAHYL3wpR5J
AojFFiAcPiT2KwygOF8C0D7Dwx1TtIxHEgKREjPxwr+aRKTGahWtxRf/7qI7YpUC
ranYzNlR9J2CnDtER1dyRRvRgxOto/TuldlCcoixhmfRcZBNuYH+GgUYQIoQled3
3XWEUKBbfqSHct0mYEqksHnbblSqvxgUpH1NYG+naqlZPmwoGjlrQhDRWBJe8AsC
ZmtoHCYXPIs8MTdq7gGF+DiwGnD+H6uBX8EdZClchQKb/A6pazt0ptIM4hZsTkbT
X3sdt4/9f09lZteC+Jf4j89SeoygUmFPE8u8a9pRgm4leZg+TkmFm2PW6pW7cAsn
CZtS8cAD3AKcR99pOxTdjUOHvwWrn8rbO0NC0gwxledrAgMBAAE=
-----END PUBLIC KEY-----`;

type LicenseRow = {
	id: string;
	license_key: string | null;
	status: string;
	plan: string | null;
	licensed_to: string | null;
	expires_at: string | null;
	metadata: Record<string, unknown> | null;
};

type EntitlementPayload = Record<string, any> & {
	iss?: string;
	aud?: string;
	exp?: number;
	graceUntil?: number;
	installationId?: string;
	valid?: boolean;
	components?: Record<string, any>;
};

export type PanelLicenseSummary = {
	valid: boolean;
	licensed: boolean;
	enforcement: true;
	reason: string | null;
	status: string;
	keyHint: string | null;
	installationId: string;
	lastCheckedAt: string | null;
	offlineGrace: boolean;
	refreshError: string | null;
	component: Record<string, any>;
	components: Record<string, any>;
	plan: string | null;
	licensedTo: string | null;
	expiresAt: string | null;
};

const nowIso = () => new Date().toISOString();
const refreshMs = () => Math.max(60_000, Number(env.ORBITFS_LICENSE_REFRESH_MINUTES || 180) * 60_000);
const signalMs = () => Math.max(60_000, Number(env.ORBITFS_LICENSE_SIGNAL_MINUTES || 1) * 60_000);
const keyHint = (value: string) => value.length > 4 ? `****${value.slice(-4)}` : '****';
const providerBase = () => String(env.ORBITFS_LICENSE_API_URL || env.ORBITFS_LICENSE_URL || DEFAULT_PROVIDER).trim().replace(/\/+$/, '');
const validateUrl = () => String(env.ORBITFS_LICENSE_VALIDATE_URL || '').trim() || `${providerBase()}${String(env.ORBITFS_LICENSE_VALIDATE_PATH || DEFAULT_VALIDATE_PATH).startsWith('/') ? '' : '/'}${String(env.ORBITFS_LICENSE_VALIDATE_PATH || DEFAULT_VALIDATE_PATH)}`;
const entitlementPublicKey = () => String(env.ORBITFS_ENTITLEMENT_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim() || PUBLIC_KEY;

async function getRow(): Promise<LicenseRow | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.from('orbitfs_license').select('id,license_key,status,plan,licensed_to,expires_at,metadata').eq('id', LICENSE_ID).maybeSingle();
	if (error) throw error;
	return data as LicenseRow | null;
}

async function saveRow(patch: Record<string, unknown>) {
	const supabase = getSupabaseAdmin();
	const row = await getRow();
	const payload = { id: LICENSE_ID, ...patch, updated_at: nowIso() };
	const result = row
		? await supabase.from('orbitfs_license').update(payload).eq('id', LICENSE_ID)
		: await supabase.from('orbitfs_license').insert({ status: 'unconfigured', metadata: {}, ...payload });
	if (result.error) throw result.error;
}

export async function ensureInstallationIdentity() {
	const row = await getRow();
	const metadata = { ...(row?.metadata || {}) } as Record<string, any>;
	if (typeof metadata.installationId === 'string' && metadata.installationId) return metadata.installationId;
	const installationId = `ofs-${randomUUID()}`;
	await saveRow({ metadata: { ...metadata, installationId, installationCreatedAt: nowIso() } });
	return installationId;
}

function verifyEntitlement(token: string, installationId: string, allowGrace = false): EntitlementPayload {
	const parts = String(token || '').split('.');
	if (parts.length !== 3) throw Object.assign(new Error('Invalid signed entitlement'), { code: 'LICENSE_SIGNATURE_INVALID' });
	const [headerPart, payloadPart, signaturePart] = parts;
	const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
	if (header.alg !== 'RS256') throw Object.assign(new Error('Unsupported entitlement algorithm'), { code: 'LICENSE_SIGNATURE_INVALID' });
	const verified = verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), entitlementPublicKey(), Buffer.from(signaturePart, 'base64url'));
	if (!verified) throw Object.assign(new Error('Entitlement signature check failed'), { code: 'LICENSE_SIGNATURE_INVALID' });
	const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as EntitlementPayload;
	const now = Math.floor(Date.now() / 1000);
	const deadline = allowGrace ? payload.graceUntil : payload.exp;
	if (payload.iss !== 'license.incendiarynetworks.cc' || payload.aud !== 'orbitfs-runtime' || !deadline || now > deadline) {
		throw Object.assign(new Error('Signed entitlement expired or invalid'), { code: 'LICENSE_ENTITLEMENT_EXPIRED' });
	}
	if (payload.installationId !== installationId) {
		throw Object.assign(new Error('Entitlement belongs to another installation'), { code: 'LICENSE_INSTALLATION_MISMATCH' });
	}
	return payload;
}

function panelComponent(payload: EntitlementPayload) {
	return payload.components?.[PANEL_COMPONENT] || { state: 'blocked', allowed: false, lockedToThisInstallation: false, reason: 'not_included' };
}

function componentLicensed(component: Record<string, any>) {
	return ['enabled', 'locked'].includes(component?.state) && component?.allowed === true && component?.lockedToThisInstallation === true;
}

function summaryFromPayload(payload: EntitlementPayload, row: LicenseRow | null, extra: Partial<PanelLicenseSummary> = {}): PanelLicenseSummary {
	const component = panelComponent(payload);
	const licensed = componentLicensed(component);
	const metadata = { ...(row?.metadata || {}) } as Record<string, any>;
	return {
		valid: payload.valid === true,
		licensed,
		enforcement: true,
		reason: licensed ? null : String(component.reason || 'LICENSE_REQUIRED'),
		status: licensed ? 'active' : 'invalid',
		keyHint: typeof metadata.keyHint === 'string' ? metadata.keyHint : null,
		installationId: String(payload.installationId || metadata.installationId || ''),
		lastCheckedAt: typeof metadata.lastCheckedAt === 'string' ? metadata.lastCheckedAt : null,
		offlineGrace: false,
		refreshError: null,
		component,
		components: payload.components && typeof payload.components === 'object' ? payload.components : { [PANEL_COMPONENT]: component },
		plan: String(payload.plan || payload.tier || row?.plan || '') || null,
		licensedTo: String(payload.licensedTo || payload.customerName || payload.sub || row?.licensed_to || '') || null,
		expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : row?.expires_at || null,
		...extra
	};
}

function unlicensedSummary(installationId: string, row: LicenseRow | null, reason: string, refreshError: string | null = null): PanelLicenseSummary {
	const metadata = { ...(row?.metadata || {}) } as Record<string, any>;
	return {
		valid: false,
		licensed: false,
		enforcement: true,
		reason,
		status: row?.status || 'unconfigured',
		keyHint: typeof metadata.keyHint === 'string' ? metadata.keyHint : null,
		installationId,
		lastCheckedAt: typeof metadata.lastCheckedAt === 'string' ? metadata.lastCheckedAt : null,
		offlineGrace: false,
		refreshError,
		component: { state: 'blocked', allowed: false, lockedToThisInstallation: false, reason },
		components: { [PANEL_COMPONENT]: { state: 'blocked', allowed: false, lockedToThisInstallation: false, reason } },
		plan: row?.plan || null,
		licensedTo: row?.licensed_to || null,
		expiresAt: row?.expires_at || null
	};
}

async function callProvider(licenseKey: string, installationId: string, activate: boolean) {
	if (!licenseKey) throw Object.assign(new Error('Licence key is required'), { code: 'LICENSE_KEY_REQUIRED', status: 400 });
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const token = String(env.ORBITFS_LICENSE_API_TOKEN || '').trim();
	if (token) headers.authorization = `Bearer ${token}`;
	const response = await fetch(validateUrl(), {
		method: 'POST',
		headers,
		body: JSON.stringify({ licenseKey, installationId, components: [PANEL_COMPONENT], activate }),
		signal: AbortSignal.timeout(Number(env.ORBITFS_LICENSE_TIMEOUT_MS || 8000))
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw Object.assign(new Error(body.error || body.message || `Licence API returned ${response.status}`), { code: body.code || 'LICENSE_PROVIDER_ERROR', status: response.status < 500 ? response.status : 503 });
	if (!body.entitlement) throw Object.assign(new Error('Licence API returned no signed entitlement'), { code: 'LICENSE_UNSIGNED_RESPONSE', status: 503 });
	return { payload: verifyEntitlement(body.entitlement, installationId, false), entitlement: String(body.entitlement) };
}

async function persistEntitlement(licenseKey: string, payload: EntitlementPayload, entitlement: string, source: string) {
	const row = await getRow();
	const metadata = { ...(row?.metadata || {}) } as Record<string, any>;
	const component = panelComponent(payload);
	const licensed = componentLicensed(component);
	const lastCheckedAt = nowIso();
	const nextMetadata = {
		...metadata,
		installationId: payload.installationId,
		entitlement,
		keyHint: keyHint(licenseKey),
		source,
		lastCheckedAt
	};
	await saveRow({
		license_key: licenseKey,
		status: licensed ? 'active' : 'invalid',
		plan: String(payload.plan || payload.tier || '') || null,
		licensed_to: String(payload.licensedTo || payload.customerName || payload.sub || '') || null,
		expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
		metadata: nextMetadata
	});
	const refreshed = await getRow();
	return summaryFromPayload(payload, refreshed);
}

async function revisionChanged(row: LicenseRow) {
	const metadata = { ...(row.metadata || {}) } as Record<string, any>;
	const lastSignalAt = typeof metadata.lastSignalAt === 'string' ? Date.parse(metadata.lastSignalAt) : 0;
	if (lastSignalAt && Date.now() - lastSignalAt < signalMs()) return false;
	try {
		const response = await fetch(`${providerBase()}/api/license/revision`, { signal: AbortSignal.timeout(Number(env.ORBITFS_LICENSE_TIMEOUT_MS || 8000)) });
		if (!response.ok) return false;
		const revision = (await response.json().catch(() => ({}))).revision;
		const changed = Boolean(metadata.lastRevision && revision && metadata.lastRevision !== revision);
		await saveRow({ metadata: { ...metadata, lastSignalAt: nowIso(), lastRevision: revision || metadata.lastRevision || null } });
		return changed;
	} catch {
		return false;
	}
}

export async function getPanelLicenseSummary(options: { refresh?: boolean } = {}): Promise<PanelLicenseSummary> {
	const installationId = await ensureInstallationIdentity();
	let row = await getRow();
	const licenseKey = String(row?.license_key || env.ORBITFS_LICENSE_KEY || '').trim();
	if (!licenseKey) return unlicensedSummary(installationId, row, 'not_activated');
	const metadata = { ...(row?.metadata || {}) } as Record<string, any>;
	const cachedToken = typeof metadata.entitlement === 'string' ? metadata.entitlement : '';
	const lastCheckedAt = typeof metadata.lastCheckedAt === 'string' ? Date.parse(metadata.lastCheckedAt) : 0;
	if (!options.refresh && cachedToken && lastCheckedAt && Date.now() - lastCheckedAt < refreshMs()) {
		try {
			const cached = verifyEntitlement(cachedToken, installationId, false);
			if (!(await revisionChanged(row!))) return summaryFromPayload(cached, await getRow());
			row = await getRow();
		} catch {
			// Refresh below.
		}
	}
	try {
		const result = await callProvider(licenseKey, installationId, false);
		return await persistEntitlement(licenseKey, result.payload, result.entitlement, 'refresh');
	} catch (error: any) {
		if (cachedToken) {
			try {
				const cached = verifyEntitlement(cachedToken, installationId, true);
				return summaryFromPayload(cached, row, { offlineGrace: true, refreshError: String(error?.message || error) });
			} catch {
				// Fail closed below.
			}
		}
		return unlicensedSummary(installationId, row, String(error?.code || 'provider_unavailable'), String(error?.message || error));
	}
}

export async function activatePanelLicense(licenseKey: string) {
	const installationId = await ensureInstallationIdentity();
	const cleanKey = String(licenseKey || '').trim();
	const result = await callProvider(cleanKey, installationId, true);
	const component = panelComponent(result.payload);
	if (!componentLicensed(component)) {
		throw Object.assign(new Error('Licence does not allow the OrbitFS Base System on this installation'), { code: component.reason || 'LICENSE_COMPONENT_DENIED', status: 403 });
	}
	return await persistEntitlement(cleanKey, result.payload, result.entitlement, 'activation');
}

export async function assertPanelLicensed() {
	const summary = await getPanelLicenseSummary();
	if (summary.licensed) return summary;
	throw Object.assign(new Error('OrbitFS Base System licence is required'), { code: 'LICENSE_REQUIRED', status: 403, license: summary });
}
