import { MIME } from '../brain.ts';
import type { Metadata, OrganizingDrive } from '../drive.ts';
import { categories } from '../structure.ts';
import type { Repository } from './database.ts';

interface DemoFile extends Metadata { text?: string }
export function seedDemo(): DemoFile[] {
  const folder = (id: string, name: string, parents: string[] = []): DemoFile => ({ id, name, parents, mimeType: MIME.folder, version: '1' });
  const doc = (id: string, name: string, text: string): DemoFile => ({ id, name, text, parents: ['demo-folder'], mimeType: MIME.doc, version: '1' });
  return [folder('root', 'Sample Drive'), folder('demo-folder', 'Braino demo documents', ['root']),
    doc('demo-school', 'Untitled notes', 'Biology lecture notes for the spring semester. Homework assignment: explain photosynthesis before the exam.'),
    doc('demo-meeting', 'School project', 'Meeting minutes — Product team. Agenda: prepare the release. Attendees: Ada and Sam. Action items: Ada will test the release.'),
    doc('demo-finance', 'March numbers', 'Invoice INV-100: design services, 500 EUR. Payment due: 30 March. Record this expense and attach the receipt.'),
    doc('demo-business', 'Next quarter', 'Our business plan focuses on customer interviews, marketing experiments and sales. The product roadmap supports the launch plan.'),
    doc('demo-personal', 'Weekend ideas', 'Vacation travel itinerary: visit the coast. Packing list: walking shoes and a jacket. Buy items from the grocery list before leaving.'),
    doc('demo-review', 'A thought', 'The quiet morning gave me an idea. I will come back to this next week.'),
    { id: 'demo-pdf', name: 'Reference.pdf', mimeType: 'application/pdf', parents: ['demo-folder'], version: '1' },
  ];
}

export function demoDrive(repository: Repository, owner: string): OrganizingDrive {
  const initial = repository.demo(owner);
  const files = new Map((initial ? JSON.parse(initial) as DemoFile[] : seedDemo()).map(f => [f.id, f]));
  const save = () => repository.saveDemo(owner, JSON.stringify([...files.values()]));
  if (!initial) save();
  return {
    async rename(id, name) {
      const file = files.get(id); if (!file) throw new Error('Demo file not found');
      file.name = name; file.version = String(Number(file.version) + 1); save();
    },
    async metadata(id) {
      const file = files.get(id); if (!file) throw new Error('Demo file not found');
      return structuredClone(file);
    },
    async listChildren(id) { return [...files.values()].filter(f => f.parents?.includes(id)).map(f => structuredClone(f)); },
    async readText(file) { const text = files.get(file.id)?.text; if (text === undefined) throw new Error('Unsupported sample'); return text; },
    async ensureCategory(root, category) {
      const existing = [...files.values()].find(f => f.appProperties?.brainoCategory === category && f.appProperties?.brainoSourceFolder === root);
      if (existing) return existing.id;
      const id = `${root}-${category}`;
      files.set(id, { id, name: categories.find(c => c.id === category)!.name, mimeType: MIME.folder, parents: [root], version: '1',
        appProperties: { brainoCategory: category, brainoSourceFolder: root } });
      save(); return id;
    },
    async move(id, destination, oldParent) {
      const file = files.get(id);
      if (!file || file.parents?.length !== 1 || file.parents[0] !== oldParent) throw new Error('Sample changed; scan again');
      file.parents = [destination]; file.version = String(Number(file.version) + 1); save();
    },
  };
}
