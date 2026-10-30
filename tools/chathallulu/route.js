// Checks where each question in cases.txt goes, without loading any model. Instant.
//   node route.js                 every case; exits 1 if any goes to the wrong place
//   node route.js "question" ...  just prints where these go
// Reads the site names from the running site (SITE, default http://127.0.0.1:4000), or from _site/.
const fs = require('fs');
const path = require('path');
const cases = require('./cases');

const root = path.join(__dirname, '..', '..');
const site = process.env.SITE || 'http://127.0.0.1:4000';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function loadRouter() {
    const corpus = await fetch(`${site}/assets/chathallulu/corpus.json`).then(r => r.json())
        .catch(() => JSON.parse(fs.readFileSync(path.join(root, '_site/assets/chathallulu/corpus.json'), 'utf8')));
    const terms = new RegExp(`\\b(${corpus.siteTerms.map(s => s.trim()).filter(Boolean).map(esc).join('|')})\\b`, 'i');
    // The routing section of worker.js, run as is.
    const src = fs.readFileSync(path.join(root, 'assets/chathallulu/worker.js'), 'utf8');
    const block = src.slice(src.indexOf('// ---- Routing ----'), src.indexOf('// ---- Prompts ----'))
        .replace('let SITE_TERMS;', 'let SITE_TERMS = TERMS;');
    const { route, restate } = new Function('TERMS', `${block}; return { route, restate };`)(terms);
    return q => route(restate(q));
}

(async () => {
    const where = await loadRouter();
    const args = process.argv.slice(2);
    if (args.length) {
        for (const q of args) console.log(where(q).padEnd(12), q);
        return;
    }
    const all = cases();
    const wrong = all.filter(c => where(c.q) !== c.route);
    for (const c of wrong) console.log(`WRONG  ${c.q}\n       expected ${c.route}, got ${where(c.q)}`);
    console.log(`${all.length - wrong.length} of ${all.length} questions go where they should.`);
    process.exit(wrong.length ? 1 : 0);
})();
