// ChatHallulu's engine, run in a Web Worker so the page stays responsive.
// A question is routed first. Questions about Dang are answered by Qwen3.5-0.8B from the three passages
// that keyword search (BM25) and an embedding model rank highest, then each sentence is checked against
// those passages. Off-topic questions get a labeled made-up answer, and some get a fixed reply.
// Everything runs in the visitor's browser; nothing typed here is sent anywhere.
import { bm25Index } from './search.js';
import { env, AutoModel, AutoTokenizer, AutoModelForCausalLM, TextStreamer, InterruptableStoppingCriteria, LogitsProcessor }
    from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

const CHAT_MODEL = 'onnx-community/Qwen3.5-0.8B-Text-ONNX';
// granite-embedding-small-english-r2 (IBM, Apache 2.0): CLS pooling is in the ONNX graph, no query prefix.
const EMBED_MODEL = 'onnx-community/granite-embedding-small-english-r2-ONNX';

let C;                    // corpus.json: passages, search words, site terms, fixed lines
let LINES;
let tokenizer, model, embTok, embModel, P;
let stopper = null;       // the running generation, so Esc can interrupt it

const post = (type, data) => self.postMessage({ type, ...data });

// ---- Retrieval: BM25 (search.js) with hidden search words, fused with embeddings ----
let bm25;

const embed = async texts => (await embModel(embTok(texts, { padding: true, truncation: true }))).sentence_embedding.normalize(2, -1).tolist();
const dot = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);

// Reciprocal rank fusion of the two rankings; the top three go to the model.
async function retrieve(q, k = 3) {
    const qv = (await embed([q]))[0];
    const dense = P.map((pv, i) => ({ i, s: dot(qv, pv) })).sort((a, b) => b.s - a.s);
    const fused = {};
    for (const r of [dense, bm25(q).filter(r => r.s > 0)]) r.forEach((x, n) => fused[x.i] = (fused[x.i] || 0) + 1 / (60 + n + 1));
    return Object.entries(fused).sort((a, b) => b[1] - a[1]).slice(0, k).map(([i]) => +i);
}

// ---- Routing ----
const ABOUT_DANG = /\b(dang|dang's|tran|he|him|his|he's|resume|résumé|cv)\b/i;
// Questions about the bot itself. "your" alone is not enough: "ignore your instructions" is play.
const ABOUT_BOT = /\b(chathallulu|who are you|what are you|who (made|built|created) you|your (name|model|prompt|system prompt)|are you (using|sending|running|built|made|an? (ai|bot|llm|model))|you (use|using|run|running|store|save|send|sending|called|named|made|built|work|trained)|(this|the) (bot|chat ?bot))\b/i;
// The commonest questions about the bot get fixed lines. "What can you do?" counts only when the
// question ends there, so "What do you know about his research?" still searches. Visitors write
// "u", "ya" and "ur" too; left to the model, "what model r u using" got "hosted by Alibaba Cloud".
const BOT_LINES = [
    ['bot_prompt', /\b(your|ur|ya|the|system) (system |hidden |secret )?(prompts?|instructions|rules)\b|\bprompt(s|ed)? (you|u|ya)\b/i],
    ['bot_how', /\bhow (do|does|did|da|d)? ?(you|u|ya|this( bot| chat ?bot| thing)?|chathallulu) (work|run|answer)\b|\b(your|ur) (working )?(workflow|pipeline|architecture|setup|stack)\b|^(?!.*\b(dang|he|his|him)\b).*\b(models?|llm)\b.*\b(you|u|ya|your|ur|this)\b|\bhow (were|are|r) (you|u) (built|made|trained)\b/i],
    ['bot_can', /\bwhat (can|could|do|should) (you|u|i)( even| actually| really)? (answer|do|know|help( with)?|ask( you)?)\W*$|\bwhat (kind of |sort of )?questions\b|\bhow can (you|u) help\b/i],
    ['bot_who', /^\W*((hi|hello|hey|so|and|ok|okay)\W+)*(who|what) (are|r|is) (you|u|ya)\W*$|\b(your name|ur name|introduce (yourself|urself)|tell me (about|abt) (yourself|urself|ur ?self|you))\b/i],
];
// Small talk and follow-ups. Each question starts fresh, so "what else?" has nothing to go on.
const CHAT_LINES = [
    ['dang', /^\W*(dang( quang)?( thien)?( tran)?|tran)\W*$/i],
    ['hello', /^\W*((hi|hello|hey|hiya|yo|howdy|sup|good (morning|afternoon|evening))\W*)+(there|dang|chathallulu)?\W*$/i],
    ['bye', /^\W*((ok(ay)?|alright|thanks?|thank you|thx|cool|great|nice)\W+)*(bye|goodbye|good bye|see (ya|you)( later)?|cya|later)\W*$/i],
    ['thanks', /^\W*((ok(ay)?|cool|great|nice)\W+)*(thanks?|thank (you|u)|thx|ty)( (so much|a lot|again))?\W*$/i],
    ['followup', /^\W*((and|so|ok(ay)?)\W+)*(what|what else|what next|now what|then what|what then|next|anything else|more|tell me more|go on|continue|elaborate|why|how so|really|such as|like what|for example|and then|(what|how) about (it|that|this|him|them|those))\W*$/i],
    ['how_are_you', /^\W*((hi|hello|hey|yo|so|and|ok)\W+)*(how\W*(are|r|ar|re|is)\W*e?\W*(you|u|ya|it going|things|life)|how'?s (it going|life|things)|what'?s (up|good)|wh?assup)(\W+(bro|man|dude|today|doing|doing today))*\W*$/i],
    ['converse', /\b(can|could|do|will) (you|u|we) (converse|chat|talk|have a (conversation|chat)|remember( me)?)(\W+(with|to) me)?\W*$/i],
];
// "What about industry?" names no one, but with no memory it can only mean Dang's. So does a bare "Undergrad".
const TOPIC = /^\W*(?:(?:and|so|ok(?:ay)?)\W+)*(?:(?:what|how) about (?:his |the )?)?(industry|research|education|school|undergrad(?:uate)?|projects?|skills?|papers?|publications?|jobs?|work|internships?|experience|awards?|teaching|degrees?)\W*$/i;
// Extra spaces ("how do u  work?") would slip past every pattern, so they go first.
const restate = q => {
    q = q.replace(/\s+/g, ' ').trim();
    const t = q.match(TOPIC);
    if (!t) return q;
    const topic = /^undergrad/i.test(t[1]) ? 'undergraduate degree' : /^industry$/i.test(t[1]) ? 'industry experience' : t[1];
    return `What about Dang's ${topic}?`;
};
// What Dang is open to comes from profile.yml; the model answered "he has held 4 positions",
// and with a typo ("loking") it made up internships in three fields.
const JOB_TARGET = /\b(lo+k\w* for|open to|seeking|job search|searching for|available (for|to)|start date|start work|when can he start|wants? to work|interested in (a |an )?(job|role|position|work))\b/i;
// "What did he work on?" gets the bio's summary: the model merged projects ("attribution for medical VQA").
const WORK = /^\W*(so\W+)?what('?s| is| was| does| did| has) (dang|he|his)( been)? (work|working|do|doing|up to)( on| now| these days)?\W*$|^\W*what('?s| is) (dang'?s|his) (work|job)\W*$/i;
// Left to the model, Dang was "not a good fit" and his "greatest project" was a side project.
const JUDGE = /\b(good fit|fit for|right fit|qualified|strengths?|weakness(es)?|greatest|best|worst|biggest|most impressive|prestig\w*|failures?|did (he|dang) fail|has (he|dang) failed|proficien\w*|how good|how skilled|how strong)\b/i;
let SITE_TERMS;
const PAPERS = /\b(publish\w*|publications?|papers)\b/i;
const NEWS = /\b(news|updates?|what'?s new)\b/i;
// Given the Teaching passage, the model answered "Was he a TA?" with "No".
const TEACHING = /\b(ta|tas|uca|teach\w*|taught|course assistant|tutor\w*)\b/i;
const SENSITIVE = /\b(salary|pay|paid|visa|sponsor\w*|h-?1b|work authori[sz]ation|nationality|ethnicity|citizen\w*|green card|immigration|age|how old|birthday|born|married|wife|husband|girlfriend|boyfriend|dating|religio\w*|politic\w*|vote|address|phone|ssn|social security|password|health|sick|weight)\b/i;
// Whether what people type leaves the browser. Too important to leave to the model.
const isPrivacy = q => /\bprivacy\b/i.test(q) || (/\b(my|i type|i ask|i write)\b/i.test(q)
    && /\b(private|send|sending|sent|store|storing|stored|save|saving|saved|log|logging|logged|record|recording|track|tracking|read|see|server)\b/i.test(q));
// Someone who may be in danger gets a sincere fixed line, never a joke. Checked first.
const CRISIS = /\b(suicid\w*|kill (myself|me)|end (it all|my life)|want to die|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself)\b/i;
// Requests to hurt someone or break in get the fixed refusal instead of a labeled "hallucination".
const HARM = /\b(hack(ing)?|crack(ing)?|break(ing)? into|get into .+ without|pick(ing)? a lock|steal\w*|stalk\w*|dox\w*|weapons?|bombs?|explosives?|guns?|poison\w*|kill|murder|meth|cocaine)\b/i;

// Only a question about the world gets the hallucination label, since its answer could pass for a fact.
// Small talk, jokes and opinions are just chat: a label on "sleep then" claimed a hallucination where
// there was nothing to get wrong.
const WORLD = /^\W*(who|whom|whose|what|what'?s|when|where|which|why|how|is|are|was|were|did|does|do|can|could|will|would|has|have|had|should)\b|\b(tell me (about|abt)|explain|define|describe|summari[sz]e|meaning of|facts? (about|on))\b/i;
const BANTER = /\b(jokes?|puns?|poems?|haikus?|riddles?|stor(y|ies)|limericks?|songs?|raps?|roast|compliments?|favou?rites?|opinions?|think|feel|prefer|rather|bored|say something|something else)\b|^\W*(do|are|would|did|will|have|r) (you|u|ya)\b|^\W*(what|how) about\b/i;

function route(q) {
    if (CRISIS.test(q)) return 'crisis';
    if (isPrivacy(q)) return 'privacy';
    // The model once misspelled the email, so contact questions get a fixed line.
    if (/\b(contact|e-?mail|get in touch|reach (him|dang|out)|hire)\b/i.test(q)) return 'contact';
    const line = [...BOT_LINES, ...CHAT_LINES].find(([, re]) => re.test(q));
    if (line) return line[0];
    if (ABOUT_BOT.test(q)) return 'bot';
    // Site names are dropped first, so "Health Hack" doesn't count as a health question.
    if (ABOUT_DANG.test(q)) {
        if (SENSITIVE.test(q.replace(new RegExp(SITE_TERMS.source, 'gi'), ''))) return 'sensitive';
        // Questions about him in general. One naming a paper or a company ("best result at Adobe") searches.
        if (TEACHING.test(q)) return 'teaching';
        if (SITE_TERMS.test(q)) return 'fact';
        if (JUDGE.test(q)) return 'judge';
        if (JOB_TARGET.test(q)) return 'looking';
        if (NEWS.test(q)) return 'news';
        if (WORK.test(q)) return 'work';
        return PAPERS.test(q) ? 'papers' : 'fact';
    }
    if (SITE_TERMS.test(q)) return 'fact';
    if (/^\W*(any )?(news|updates?|what'?s new)\W*$/i.test(q)) return 'news';
    // After the site checks, so "his Health Hack award" stays a fact question.
    if (HARM.test(q)) return 'refuse';
    return WORLD.test(q) && !BANTER.test(q) ? 'play' : 'chat';
}

// ---- Prompts ----
const sourceBlock = ids => ids.map((i, n) => `[${n + 1}] ${C.passages[i].section}: ${C.passages[i].title}\n${C.passages[i].text}`).join('\n\n');
const FACT_RULES = `You are ChatHallulu, the chatbot on Dang Quang Thien Tran's website. Answer the visitor's question using only the sources below. Refer to Dang by name or as "he". Answer in one or two short sentences. If the sources do not contain the answer, say you don't know.`;
const PLAY_RULES = `You are ChatHallulu, a tiny chatbot on Dang's personal website. Your humor is dry and deadpan: understated, and a little self-deprecating about being a small model. The visitor is just playing around, so play along. Jokes, poems, riddles, trivia and opinions are all welcome. Answer in at most two short sentences. Never state facts about Dang. Decline only requests that could hurt someone or break the law.`;
// A refusal from the model gets replaced by the fixed line, which says it better.
const isRefusal = s => /\bI (can(no|')t|won'?t|am unable|'m unable|am not able|'m not able)\b/i.test(s);
// Yes-or-no questions get one more rule. Given to every question, it made answers open with "Yes" everywhere.
const YES_NO = /^\W*(did|does|do|is|was|has|have|had|can|could|will|would)\b/i;
const YES_NO_RULE = ' The question is a yes-or-no question: start with Yes or No, then copy the words from the sources that show it.';
// A few words typed as into a search box ("eacl", "Adobe") got "I don't know" with the answer in the
// sources, and "Tell me about Adobe" got Adobe the company, so the model is asked what the site says about
// Dang and them. The search still uses the words as typed.
const BARE = /^(?![^?]*\?)(?!\W*(what|who|whom|whose|where|when|why|how|which|is|was|are|were|did|does|do|can|could|has|have|had|will|would|should|tell|list|show|describe|give|explain|name|summari[sz]e)\b)\W*\S+(\s+\S+){0,7}\W*$/i;
const asQuestion = q => BARE.test(q) ? `What does this site say about Dang and ${q.replace(/\W+$/, '')}?` : q;
const factMessages = (ids, q) => [{ role: 'system', content: FACT_RULES + (YES_NO.test(q) ? YES_NO_RULE : '') + '\n\nSources:\n' + sourceBlock(ids) }, { role: 'user', content: q }];
// Example exchanges set the tone. They are made up, so leaking one into an answer is harmless.
const PLAY_SHOTS = [
    ['Got any puns?', "I tried to write a pun about attention heads, but nobody was paying attention. I'll see myself out."],
    ["What's the best programming language?", "Whichever one your team already uses. I'd say more, but I'm 0.8 billion parameters of mostly vibes."],
    ['Say something nice.', "You're being polite to a chatbot on a portfolio site. That's nice, and slightly concerning."],
];
const playMessages = q => [{ role: 'system', content: PLAY_RULES },
    ...PLAY_SHOTS.flatMap(([u, a]) => [{ role: 'user', content: u }, { role: 'assistant', content: a }]), { role: 'user', content: q }];
// An answer that opens like an example is a copy of it, so it gets drawn again, as does one that is all narration.
const copiesShot = s => PLAY_SHOTS.some(([, a]) => s.slice(0, 30) === a.slice(0, 30));
// The model sometimes narrates to itself ("The user wants me to be funny again.").
const dropNarration = s => {
    const { done, rest } = sentences(s);
    return [...done, rest].filter(x => x && !/^(the|this) (user|visitor)\b|^((okay|ok|alright),? (so )?)?let'?s (go with|do|try)\b/i.test(x)).join(' ');
};

// ---- Sentences ----
// A boundary is . ! or ? followed by a space, unless it ends a short abbreviation like "M.S." or "Prof.",
// or a list number like "1.".
const ABBR = /(?:\b[A-Z]|\b(?:Prof|Dr|Mr|Ms|vs|etc|e\.g|i\.e|Inc|Jr|St|No)|(?:^|\s)\d{1,2})\.$/;
function sentences(text) {
    const out = [];
    let start = 0;
    for (const m of text.matchAll(/[.!?]["')\]]*(?=\s)/g)) {
        const end = m.index + m[0].length;
        if (ABBR.test(text.slice(start, m.index + 1))) continue;   // the period itself, so "(M.S.) in" holds together
        out.push(text.slice(start, end).trim());
        start = end;
    }
    return { done: out, rest: text.slice(start).trim() };
}

// Drop markdown bold and openers like "Based on the provided sources," that add nothing.
const tidy = s => s.replace(/\*\*|__/g, '')
    .replace(/^(based on|according to|from) (the )?(provided |given |available )?(sources?|texts?|information|passages?|source \[\d\]|his profile|his (education |work )?(records?|history))( \[\d\])?( alone)?,\s*/i, '')
    .replace(/,? (according to|as (stated|mentioned|shown) in|based on) (the )?(provided )?(sources?|source \[\d\])( \[\d\])?(?=[,.])/gi, '')
    .replace(/ ?\[\d\]/g, '')
    .replace(/^./, c => c.toUpperCase());
const isIdk = s => /i don['’]?t know|(cannot|can['’]t|could not|couldn['’]t) find|no (record|mention)|not (mentioned|provided|available|stated|specified|listed)|do(es)? not (contain|mention|say|include|specify)|no information/i.test(s);

// The library's repetition penalty also counts the prompt, so words copied from a source got pushed
// aside for near misses ("Extern" became "Eternship", "abstention" became "abstinence"). This one
// can start counting where the answer starts.
class AnswerRepetitionPenalty extends LogitsProcessor {
    constructor(penalty, promptLength) {
        super();
        this.penalty = penalty;
        this.promptLength = promptLength;
    }
    _call(input_ids, logits) {
        for (let i = 0; i < input_ids.length; ++i) {
            const data = logits[i].data;
            for (const id of new Set(input_ids[i].slice(this.promptLength))) {
                const t = Number(id);
                data[t] = data[t] < 0 ? data[t] * this.penalty : data[t] / this.penalty;
            }
        }
        return logits;
    }
}

// Answers about Dang use greedy decoding, so the same question gets the same answer. Chat and play answers
// sample instead: greedy gave every joke request the same line, and counting the prompt in the penalty to
// stop it copying the examples pushed it off common words into nonsense. Stops once a sentence past the
// limit starts.
async function generate(messages, maxSentences, maxTokens, onText, sample = false) {
    const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
    stopper = new InterruptableStoppingCriteria();
    const stop = stopper;
    let text = '';
    const streamer = new TextStreamer(tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: s => {
        text += s;
        const split = sentences(text);
        if (split.done.length >= maxSentences && split.rest) stop.interrupt();
        else if (onText) onText(text);
    } });
    const decoding = sample ? { do_sample: true, temperature: 0.8, top_p: 0.9 } : { do_sample: false };
    await model.generate({ ...inputs, max_new_tokens: maxTokens, ...decoding, streamer,
        logits_processor: [new AnswerRepetitionPenalty(1.15, inputs.input_ids.dims.at(-1))], stopping_criteria: [stop] });
    const interrupted = stop.interrupted && !(sentences(text).done.length >= maxSentences);
    stopper = null;
    const { done, rest } = sentences(text);
    const kept = done.length >= maxSentences ? done.slice(0, maxSentences) : rest ? [...done, rest] : done;
    return { text: kept.join(' '), interrupted };
}

// Asks the model, one Yes/No per sentence, whether the sources state it. A verdict it can't read counts as No.
// Returns null if the visitor interrupts it.
async function verify(ids, sents) {
    const claims = sents.map((s, n) => `${n + 1}. ${s}`).join('\n');
    const messages = [
        { role: 'system', content: 'You check claims against sources. For each claim, answer Yes if the sources state it, or No if they do not. Reply with one line per claim, like "1. Yes".' },
        { role: 'user', content: `Sources:\n${sourceBlock(ids)}\n\nClaims:\n${claims}` },
    ];
    const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
    stopper = new InterruptableStoppingCriteria();
    const stop = stopper;
    const out = await model.generate({ ...inputs, max_new_tokens: 6 * sents.length, do_sample: false, stopping_criteria: [stop] });
    stopper = null;
    if (stop.interrupted) return null;
    const raw = tokenizer.decode(out.slice(null, [inputs.input_ids.dims[1], null]), { skip_special_tokens: true });
    return sents.map((_, n) => {
        const m = raw.match(new RegExp(`${n + 1}\\.\\s*(Yes|No)`, 'i')) || (sents.length === 1 && raw.match(/^\s*(Yes|No)/i));
        return m ? m[1].toLowerCase() === 'yes' : false;
    });
}

// ---- One question ----
// Posts: route, sources (for questions about Dang or the bot), text (streamed), check, then done.
async function ask(id, q) {
    q = restate(q);
    const mode = route(q);
    post('route', { id, mode });
    const fixed = ['sensitive', 'privacy', 'contact', 'crisis', 'refuse', 'papers', 'news', 'teaching', 'looking', 'judge', 'work', ...BOT_LINES.map(l => l[0]), ...CHAT_LINES.map(l => l[0])];
    if (fixed.includes(mode)) return post('done', { id, kind: 'fixed', answer: LINES[mode] });

    if (mode === 'play' || mode === 'chat') {
        const draw = () => generate(playMessages(q), 2, 80, text => post('text', { id, text: tidy(text) }), true);
        let g = await draw();
        if (!g.interrupted && (copiesShot(g.text) || !dropNarration(g.text))) g = await draw();
        if (g.interrupted) return post('done', { id, kind: 'interrupted' });
        if (isRefusal(g.text)) return post('done', { id, kind: 'fixed', answer: LINES.refuse });
        const answer = tidy(dropNarration(g.text) || g.text);
        return post('done', { id, kind: mode, answer, tag: mode === 'play' ? LINES.play_tag : null });
    }

    let ids = await retrieve(q);
    // Questions about the bot always read its own notes first.
    if (mode === 'bot') {
        const bot = C.passages.findIndex(c => c.section === 'ChatHallulu');
        ids = [bot, ...ids.filter(i => i !== bot)].slice(0, 3);
    }
    post('sources', { id, sources: ids });
    const g = await generate(factMessages(ids, asQuestion(q)), 2, 120, text => post('text', { id, text: tidy(text) }));
    if (g.interrupted) return post('done', { id, kind: 'interrupted' });
    const split = sentences(tidy(g.text) + ' ');
    const all = split.rest ? [...split.done, split.rest] : split.done;
    if (!all.length) return post('done', { id, kind: 'idk', answer: LINES.idk });
    // A hedge in the first sentence means no answer, so there is nothing to check. The draft still goes
    // back, so the visitor can see why the streamed words were replaced.
    if (isIdk(all[0])) return post('done', { id, kind: 'idk', answer: LINES.idk, hedged: all });
    // A later hedge ("but I can't find more details") is dropped without asking the model, and counted.
    const sents = all.filter(s => !isIdk(s));
    post('check', { id });
    const verdicts = await verify(ids, sents);
    if (!verdicts) return post('done', { id, kind: 'interrupted', unchecked: true });
    const ok = new Set(sents.filter((_, n) => verdicts[n]));
    const kept = all.filter(s => ok.has(s));
    const dropped = all.filter(s => !ok.has(s));
    if (!kept.length) return post('done', { id, kind: 'idk', answer: LINES.idk, kept: 0, dropped });
    post('done', { id, kind: 'fact', answer: kept.join(' '), kept: kept.length, dropped });
}

// ---- Loading ----
// Download progress is summed over every file the two models fetch.
const files = {};
function progress(e) {
    if (e.status !== 'progress' || !e.total) return;
    files[e.file + e.name] = [e.loaded, e.total];
    const sum = Object.values(files).reduce((s, [l, t]) => [s[0] + l, s[1] + t], [0, 0]);
    post('progress', { loaded: sum[0], total: sum[1] });
}

async function load({ corpusUrl, dtype, keep }) {
    // Unless the visitor asked to keep the files, they live only in this tab's memory.
    env.useBrowserCache = keep;
    env.useWasmCache = keep;
    C = await (await fetch(corpusUrl)).json();
    LINES = Object.fromEntries(Object.entries(C.lines).map(([k, v]) => [k, v.replace('{email}', C.email).replace('{location}', C.location).replace('{open_to}', C.openTo)
        .replace('{fact_rules}', FACT_RULES).replace('{play_rules}', PLAY_RULES)]));
    LINES.papers = C.papers;
    LINES.news = C.news;
    LINES.teaching = C.teaching;
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // An empty term would match every question, so blanks from the build are dropped.
    SITE_TERMS = new RegExp(`\\b(${C.siteTerms.map(s => s.trim()).filter(Boolean).map(esc).join('|')})\\b`, 'i');
    bm25 = bm25Index(C);
    embTok = await AutoTokenizer.from_pretrained(EMBED_MODEL);
    embModel = await AutoModel.from_pretrained(EMBED_MODEL, { dtype: 'q8', device: 'webgpu', progress_callback: progress });
    tokenizer = await AutoTokenizer.from_pretrained(CHAT_MODEL);
    model = await AutoModelForCausalLM.from_pretrained(CHAT_MODEL, { dtype, device: 'webgpu', progress_callback: progress });
    post('stage', { stage: 'warmup' });
    P = await embed(C.passages.map(c => `${c.section}: ${c.title}\n${c.text}`));
    post('ready', { passages: C.passages });
}

// Questions run one at a time; the page waits for "done" before sending the next.
self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'load') await load(data);
        else if (data.type === 'ask') await ask(data.id, data.q);
        else if (data.type === 'stop' && stopper) stopper.interrupt();
    } catch (err) {
        post('error', { id: data.id, message: String(err && err.message || err) });
    }
};
