// Keyword search (BM25) over corpus passages, with each section's hidden search words. ChatHallulu fuses
// it with embeddings in worker.js; the terminal's grep uses it alone, so it works without the model.
import stem from './porter2.js';

const STOP = new Set("he him his she her we our me my use used using a an and are as at be by did do does for from has have how i in is it its of on or that the their them they this to was what when where which who why with you your dang dang's tran quang thien".split(' '));
export const toks = s => s.toLowerCase().split(/[^a-z0-9+#.-]+/).map(w => w.replace(/^[.-]+|[.-]+$/g, '')).filter(w => w && !STOP.has(w)).map(stem);

// Returns a function that ranks every passage for a query, best first, as { i, s } with s the score.
export function bm25Index(C, k1 = 1.2, b = 0.75) {
    const docs = C.passages.map(c => toks([c.section, c.title, c.text, C.keys[c.section] || '', C.titleKeys[c.title] || ''].join(' ')));
    const avgdl = docs.reduce((n, d) => n + d.length, 0) / docs.length;
    const df = {};
    docs.forEach(d => new Set(d).forEach(t => df[t] = (df[t] || 0) + 1));
    return query => {
        const q = toks(query), N = docs.length;
        return docs.map((d, i) => {
            let s = 0;
            for (const t of new Set(q)) {
                const f = d.filter(x => x === t).length;
                if (!f) continue;
                const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
                s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.length / avgdl));
            }
            return { i, s };
        }).sort((a, b) => b.s - a.s);
    };
}
