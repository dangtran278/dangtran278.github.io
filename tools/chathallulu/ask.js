// Asks the questions in cases.txt in the real chat panel and checks each answer's words.
//   node ask.js                   every case (about 10 s per model answer, plus the model download)
//   node ask.js fact              only cases with that route
//   node ask.js "question" ...    just prints the answers to these
// Needs the site running (SITE, default http://127.0.0.1:4000), Chrome, and `npm install` here once.
const { chromium } = require('playwright-core');
const cases = require('./cases');

const site = process.env.SITE || 'http://127.0.0.1:4000';
const args = process.argv.slice(2);
const all = cases();
const routes = new Set(all.map(c => c.route));
const todo = !args.length ? all
    : args.length === 1 && routes.has(args[0]) ? all.filter(c => c.route === args[0])
    : args.map(q => ({ q, has: [], not: [], adhoc: true }));

(async () => {
    const browser = await chromium.launch({ channel: process.env.BROWSER || 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist'] });
    // A fresh in-memory profile each run, so the model downloads again (Chrome's disk cache is not kept).
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', e => console.log('page error:', e.message));
    await page.goto(site, { waitUntil: 'networkidle' });
    const idle = () => page.waitForFunction(() => document.getElementById('chat-spinner').hidden
        && !document.getElementById('chat-log').hasAttribute('aria-busy'), null, { timeout: 300000 });
    await page.click('.tb-chat');
    await page.fill('#chat-input', '/load');
    await page.press('#chat-input', 'Enter');
    await page.waitForSelector('.t-menu');
    await page.keyboard.press('1');
    await page.waitForFunction(() => /WebGPU/.test(document.getElementById('chat-status').textContent), null, { timeout: 900000 });
    await page.waitForTimeout(300);
    await idle();

    let failed = 0;
    for (const c of todo) {
        const t = Date.now();
        await page.fill('#chat-input', c.q);
        await page.press('#chat-input', 'Enter');
        await page.waitForTimeout(300);
        await idle();
        // Open the checker's details, so dropped sentences show too.
        await page.evaluate(() => document.querySelectorAll('details').forEach(d => { if (d.querySelector('.t-dropped')) d.open = true; }));
        // The last turn, without the question itself or the list of passages searched.
        const out = await page.evaluate(() => {
            const turns = document.querySelectorAll('#chat-log .t-turn');
            const last = turns[turns.length - 1];
            return last ? [...last.children].filter(n => !n.matches('.t-user, .t-search'))
                .map(n => n.innerText.trim()).filter(Boolean).join('\n') : '';
        });
        const low = out.toLowerCase();
        const problems = [...c.has.filter(w => !low.includes(w.toLowerCase())).map(w => `missing "${w}"`),
            ...c.not.filter(w => low.includes(w.toLowerCase())).map(w => `contains "${w}"`)];
        if (problems.length) failed++;
        const mark = c.adhoc ? '===' : problems.length ? 'CHECK' : 'ok';
        console.log(`${mark} ${c.q} (${((Date.now() - t) / 1000).toFixed(1)}s)${problems.length ? '  ' + problems.join(', ') : ''}\n${out}\n`);
    }
    await browser.close();
    if (!todo[0]?.adhoc) console.log(`${todo.length - failed} of ${todo.length} answers passed their checks.`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
