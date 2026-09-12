import { MIME } from '../src/brain.ts';
import { classifyByContent } from '../src/structure.ts';
import { createLLMClassifier } from '../src/classifier.ts';
import { classifierCorpus } from './classifier-corpus.ts';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--llm' && arg !== '--strict')) throw new Error('Usage: node examples/evaluate-classifier.ts [--llm] [--strict]');
const live = args.includes('--llm');
const classify = live ? createLLMClassifier({ apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_MODEL }) : classifyByContent;
let correct = 0;
let unsafe = 0;
console.log(live ? 'Live LLM evaluation (sends synthetic text to OpenAI; API charges apply).' : 'Offline keyword baseline. This does not measure LLM quality.');
for (const sample of classifierCorpus) {
  const result = await classify({ file: { id: sample.id, name: sample.name, mimeType: MIME.doc }, text: sample.text });
  const match = result.categoryId === sample.expected;
  if (match) correct++;
  if (!match && result.categoryId !== null) unsafe++;
  console.log(`${match ? 'PASS' : 'MISS'} ${sample.id}: expected=${sample.expected ?? 'review'} actual=${result.categoryId ?? 'review'}`);
}
console.log(`${correct}/${classifierCorpus.length} correct; ${unsafe} incorrect non-review assignments. Review every proposed move.`);
if (args.includes('--strict') && correct !== classifierCorpus.length) process.exitCode = 1;
