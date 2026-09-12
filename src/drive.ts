import { MIME } from './brain.ts';
import type { DriveFile, DriveReader } from './brain.ts';
import { categories } from './structure.ts';
import type { CategoryId } from './structure.ts';

export interface Metadata extends DriveFile {
  parents?: string[];
  version: string;
  trashed?: boolean;
  driveId?: string;
}

export interface OrganizingDrive extends DriveReader {
  metadata(id: string): Promise<Metadata>;
  ensureCategory(root: string, category: CategoryId): Promise<string>;
  move(id: string, destination: string, oldParent: string): Promise<void>;
}

const fields = 'id,name,mimeType,parents,version,trashed,driveId,appProperties';
const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function createDrive(options: {
  accessToken: () => string | Promise<string>;
  fetch?: typeof fetch;
}): OrganizingDrive {
  const transport = options.fetch ?? fetch;
  async function request(path: string, params: Record<string, string> = {}, method = 'GET', body?: unknown, text = false) {
    const base = path.startsWith('sheets/') ? 'https://sheets.googleapis.com/v4/' : 'https://www.googleapis.com/drive/v3/';
    const url = new URL(path.replace(/^sheets\//, ''), base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const token = await options.accessToken();
    if (!token.trim()) throw new Error('Google access token is missing');
    // No automatic write retry: an ambiguous response may already have changed Drive.
    const response = await transport(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Google API ${method} failed (${response.status}). Check token, scopes and file permissions.`);
    return text ? response.text() : response.status === 204 ? undefined : response.json();
  }
  const metadata = async (id: string): Promise<Metadata> => {
    const result = await request(`files/${encodeURIComponent(id)}`, { fields });
    if (!result.id || !result.version || result.trashed || result.driveId) {
      throw new Error('File unavailable, missing version, or in an unsupported shared drive');
    }
    return result;
  };
  async function listChildren(id: string): Promise<Metadata[]> {
    const files: Metadata[] = [];
    let pageToken = '';
    const seenTokens = new Set<string>();
    do {
      const page = await request('files', { q: `'${quote(id)}' in parents and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${fields})`, pageSize: '100',
        ...(pageToken ? { pageToken } : {}) });
      if (page.incompleteSearch) throw new Error('Drive returned an incomplete file listing');
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken ?? '';
      if (pageToken && seenTokens.has(pageToken)) throw new Error('Drive pagination repeated a token');
      seenTokens.add(pageToken);
    } while (pageToken);
    return files;
  }
  async function readText(file: DriveFile): Promise<string> {
    if (file.mimeType === MIME.doc) {
      return request(`files/${encodeURIComponent(file.id)}/export`, { mimeType: 'text/plain' }, 'GET', undefined, true);
    }
    if (file.mimeType !== MIME.sheet) throw new Error('Unsupported source format');
    const sheet = await request(`sheets/spreadsheets/${encodeURIComponent(file.id)}`, { fields: 'sheets(properties(title,sheetType))' });
    const parts: string[] = [];
    for (const tab of sheet.sheets ?? []) {
      if (tab.properties.sheetType !== 'GRID') throw new Error('Non-grid worksheet requires a dedicated reader');
      const range = `'${tab.properties.title.replace(/'/g, "''")}'`;
      const values = await request(`sheets/spreadsheets/${encodeURIComponent(file.id)}/values/${encodeURIComponent(range)}`, {
        valueRenderOption: 'FORMATTED_VALUE',
      });
      // JSON rows keep embedded newlines and cell boundaries unambiguous.
      const rows = (values.values ?? []).map((row: unknown[]) => JSON.stringify(row));
      if (rows.length) parts.push(`Worksheet: ${tab.properties.title}\n${rows.join('\n')}`);
    }
    return parts.join('\n\n');
  }
  return {
    metadata, listChildren, readText,
    async ensureCategory(root, category) {
      const definition = categories.find(c => c.id === category);
      if (!definition) throw new Error('Unknown category');
      const matches = (await listChildren(root)).filter(f => f.mimeType === MIME.folder &&
        f.appProperties?.brainoCategory === category && f.appProperties?.brainoSourceFolder === root);
      if (matches.length > 1) throw new Error('Duplicate category folders; reconcile before applying');
      if (matches.length === 1) return matches[0].id;
      const created = await request('files', { fields: 'id' }, 'POST', {
        name: definition.name, mimeType: MIME.folder, parents: [root],
        appProperties: { brainoCategory: category, brainoSourceFolder: root },
      });
      const verified = await metadata(created.id);
      if (verified.mimeType !== MIME.folder || !verified.parents?.includes(root) ||
          verified.appProperties?.brainoCategory !== category || verified.appProperties?.brainoSourceFolder !== root) {
        throw new Error('Created folder could not be verified');
      }
      return verified.id;
    },
    async move(id, destination, oldParent) {
      await request(`files/${encodeURIComponent(id)}`, {
        addParents: destination, removeParents: oldParent, fields: 'id,parents',
      }, 'PATCH', {});
      const verified = await metadata(id);
      if (verified.parents?.length !== 1 || verified.parents[0] !== destination) throw new Error('Move readback failed');
    },
  };
}
