// Reads cases.txt: [{ route, q, has: [...], not: [...] }].
const fs = require('fs');
const path = require('path');

module.exports = () => fs.readFileSync(path.join(__dirname, 'cases.txt'), 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
        const [route, q, checks = ''] = l.split('|').map(s => s.trim());
        const list = checks.split(';').map(s => s.trim()).filter(Boolean);
        return { route, q, has: list.filter(c => !c.startsWith('!')), not: list.filter(c => c.startsWith('!')).map(c => c.slice(1)) };
    });
