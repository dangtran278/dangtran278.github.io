// ChatHallulu's side bar: opening and sizing it, its input, and drawing what the worker sends back,
// after the Claude Code extension. The model runs in worker.js and is loaded only after the visitor agrees,
// or right away if their browser already has it from an earlier visit.
(function () {
    "use strict";

    var root = document.documentElement;
    var body = document.body;
    var panel = document.getElementById("chat-panel");
    if (!panel) return;
    var term = document.getElementById("chat-term");
    var log = document.getElementById("chat-log");
    var form = document.getElementById("chat-form");
    var input = document.getElementById("chat-input");
    var spinner = document.getElementById("chat-spinner");
    var suggest = document.getElementById("chat-suggest");
    var hint = document.getElementById("chat-hint");
    var status = document.getElementById("chat-status");
    var statusLine = document.getElementById("chat-status-line");
    var sendButton = document.getElementById("chat-send");
    var explorerButton = document.getElementById("explorer-toggle");
    var toggles = document.querySelectorAll("[data-chat-toggle]");
    var welcome = log.querySelector(".t-welcome").cloneNode(true);
    var EMAIL = panel.getAttribute("data-email");
    var phone = window.matchMedia("(max-width: 767.98px)");
    var keys = window.keyLabel || function (s) { return s; };  // Mac key names, from vscode.js

    // ---- Side bar: open, close, resize ----
    // It takes about 30% of the window, or the width the visitor dragged it to, but leaves the editor
    // at least EDITOR_MIN. On a window too narrow for both it covers the editor instead.
    var MIN_W = 300, MAX_W = 720, EDITOR_MIN = 520;
    var width = 0, returnFocus = null, hidExplorer = false, togglingExplorer = false;
    try { width = +localStorage.getItem("chat-w") || 0; } catch (e) {}

    function px(name, from) {
        return parseFloat(getComputedStyle(from || root).getPropertyValue(name)) || 0;
    }

    function wanted() {
        return width || Math.min(480, Math.max(320, Math.round(window.innerWidth * 0.3)));
    }

    // Room left for the editor beside a side bar this wide.
    function editorRoom(w) {
        var explorer = body.classList.contains("sidebar-hidden") ? 0 : px("--sb-w");
        return window.innerWidth - px("--ab-w") - explorer - px("--mm-w", body) - w;
    }

    function layout() {
        var open = !panel.hidden && !phone.matches, w = 0, overlay = false;
        if (open) {
            w = Math.max(MIN_W, Math.min(wanted(), MAX_W, editorRoom(0) - EDITOR_MIN));
            overlay = editorRoom(w) < EDITOR_MIN;
            if (overlay) w = Math.min(wanted(), window.innerWidth - px("--ab-w"));
            panel.style.width = w + "px";
        } else {
            panel.style.width = "";
        }
        body.classList.toggle("chat-overlay", open && overlay);
        root.style.setProperty("--chat-w", (open && !overlay ? w : 0) + "px");
        document.dispatchEvent(new Event("chatresize"));
    }

    function toggleExplorer() {
        togglingExplorer = true;
        explorerButton.click();
        togglingExplorer = false;
    }

    function openPanel() {
        returnFocus = document.activeElement;
        body.querySelectorAll(".tb-chat.invite").forEach(function (b) { b.classList.remove("invite"); });
        try { sessionStorage.setItem("chat-seen", "1"); } catch (e) {}
        panel.hidden = false;
        body.classList.add("chat-open");
        toggles.forEach(function (t) { t.setAttribute("aria-expanded", "true"); });
        // Where the editor would get too narrow, the Explorer makes room, as VS Code lets you do by hand.
        // It comes back when the chat closes.
        if (!phone.matches && explorerButton && !body.classList.contains("sidebar-hidden") &&
            editorRoom(Math.max(MIN_W, Math.min(wanted(), MAX_W))) < EDITOR_MIN) {
            toggleExplorer();
            hidExplorer = true;
        }
        layout();
        input.focus();
        start();
        stickToBottom();
    }

    function closePanel() {
        panel.hidden = true;
        body.classList.remove("chat-open");
        toggles.forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
        if (hidExplorer && body.classList.contains("sidebar-hidden")) toggleExplorer();
        hidExplorer = false;
        layout();
        if (returnFocus && returnFocus.focus && !panel.contains(returnFocus)) returnFocus.focus();
    }

    function togglePanel() {
        if (panel.hidden) openPanel(); else closePanel();
    }

    toggles.forEach(function (t) { t.addEventListener("click", togglePanel); });

    // Until the chat is opened in this tab, the title bar button ripples a few times on each page load to
    // say it's there. With reduced motion it glows in place instead.
    var seen = false;
    try { seen = !!sessionStorage.getItem("chat-seen"); } catch (e) {}
    if (!seen) body.querySelectorAll(".tb-chat").forEach(function (b) { b.classList.add("invite"); });
    document.getElementById("chat-close").addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.code === "KeyI") {
            e.preventDefault();
            togglePanel();
        }
    });
    // Showing or hiding the Explorer by hand changes the room, and it's then the visitor's choice.
    if (explorerButton) explorerButton.addEventListener("click", function () {
        if (!togglingExplorer) hidExplorer = false;
        if (!panel.hidden) layout();
    });

    // Drag the left edge to resize, as in VS Code. A double-click goes back to the default width.
    var sash = panel.querySelector(".chat-sash");
    var dragging = false;
    sash.addEventListener("pointerdown", function (e) {
        dragging = true;
        sash.setPointerCapture(e.pointerId);
        body.classList.add("chat-dragging");
    });
    sash.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        width = Math.max(MIN_W, window.innerWidth - e.clientX);
        layout();
    });
    function endDrag() {
        if (!dragging) return;
        dragging = false;
        body.classList.remove("chat-dragging");
        width = parseFloat(panel.style.width) || width;
        try { localStorage.setItem("chat-w", String(Math.round(width))); } catch (e) {}
    }
    sash.addEventListener("pointerup", endDrag);
    sash.addEventListener("pointercancel", endDrag);
    sash.addEventListener("dblclick", function () {
        width = 0;
        try { localStorage.removeItem("chat-w"); } catch (e) {}
        layout();
    });

    window.addEventListener("resize", layout);
    phone.addEventListener("change", layout);

    // ---- Writing to the chat ----
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // Plain text, with the email address as a link. Model output only ever goes in as text.
    function withEmail(node, text) {
        node.textContent = "";
        var parts = EMAIL ? text.split(EMAIL) : [text];
        parts.forEach(function (p, i) {
            if (i) {
                var a = el("a", null, EMAIL);
                a.href = "mailto:" + EMAIL;
                node.appendChild(a);
            }
            node.appendChild(document.createTextNode(p));
        });
        return node;
    }

    // Follow new output, unless the visitor has scrolled up to read.
    var stuck = true;
    term.addEventListener("scroll", function () {
        stuck = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
        panel.classList.toggle("scrolled", term.scrollTop > 0);
    });
    function stickToBottom() {
        if (stuck) term.scrollTop = term.scrollHeight;
    }

    // Each question starts a turn: the question in a box, then the steps that answer it.
    var turn = null;
    function host() { return turn || log; }

    // A step led by a dot: green for a search, plain for an answer, magenta for a made-up one, red for an error.
    function dotRow(kind) {
        var row = el("div", "t-step t-" + kind);
        var b = el("div", "t-body");
        row.appendChild(b);
        host().appendChild(row);
        stickToBottom();
        return b;
    }

    // A line under the step above it.
    function subRow(cls) {
        var row = el("div", "t-sub" + (cls ? " " + cls : ""));
        var b = el("div", "t-body");
        row.appendChild(b);
        host().appendChild(row);
        stickToBottom();
        return b;
    }

    function echo(text) {
        turn = el("div", "t-turn");
        turn.appendChild(el("div", "t-user", text));
        log.appendChild(turn);
        stuck = true;
        stickToBottom();
    }

    function note(text, cls) {
        withEmail(subRow(cls || "t-dim"), text);
    }

    // Labeled answers to general questions count as warnings in the status bar, next to the 0 errors.
    var warnings = 0;
    var sbWarn = document.getElementById("sb-warn");
    var sbProblems = document.getElementById("sb-problems");
    function countWarning() {
        if (!sbWarn) return;
        warnings++;
        sbWarn.textContent = warnings;
        sbProblems.title = warnings + (warnings === 1 ? " answer" : " answers") + " by ChatHallulu not from Dang's site";
    }

    // ---- Spinner ----
    var spinVerb = spinner.querySelector(".t-verb");
    var spinTime = spinner.querySelector(".t-dim");
    var spinTimer = null, spinStart = 0, spinStoppable = false;
    // When the model last said anything. A stuck graphics card goes quiet without an error.
    var heard = 0, stallWarned = false;

    function tick() {
        if (!stallWarned && Date.now() - heard > 90000) {
            stallWarned = true;
            note("Nothing has happened for 90 seconds. Your graphics card may be stuck. Give it a moment, or reload the page.", "t-err");
        }
        var s = Math.floor((Date.now() - spinStart) / 1000) + "s";
        spinTime.textContent = "(" + (spinStoppable ? s + ", esc to interrupt" : s) + ")";
    }

    function spin(verb, stoppable) {
        spinVerb.textContent = verb + "…";
        spinStoppable = !!stoppable;
        if (!spinTimer) {
            spinner.hidden = false;
            spinStart = heard = Date.now();
            stallWarned = false;
            spinTimer = setInterval(tick, 250);
        }
        tick();
        stickToBottom();
    }

    function stopSpin() {
        clearInterval(spinTimer);
        spinTimer = null;
        spinner.hidden = true;
    }

    // ---- The model ----
    // idle: not loaded. consent: asking to load. loading, ready, busy: answering. nogpu: can't run here.
    var state = "idle";
    var worker = null, dtype = "q4f16", sizeMB = 520, passages = [];
    var pending = null;          // a question asked before the model loaded
    var current = null, askId = 0;
    var gpuCheck = null;

    // The send button turns into a stop button while an answer is being written.
    function setState(s) {
        state = s;
        panel.setAttribute("data-state", s);
        var busy = s === "busy";
        sendButton.classList.toggle("t-stop", busy);
        sendButton.querySelector("i").className = "fa-solid fa-" + (busy ? "stop" : "arrow-up");
        sendButton.setAttribute("aria-label", busy ? "Interrupt" : "Send");
        sendButton.title = busy ? "Interrupt (Esc)" : "Send (Enter)";
    }
    setState("idle");

    // Phones and tablets may run out of memory or take minutes per answer, so the bot stays on desktop.
    // iPads ask for the desktop site, so they show up as a Mac with a touch screen.
    var ua = navigator.userAgent;
    var mobile = (navigator.userAgentData && navigator.userAgentData.mobile) ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

    // q4f16 needs the GPU to support 16-bit floats; otherwise the q4 build, which is a bit larger.
    function detectGpu() {
        if (!navigator.gpu) return Promise.resolve(false);
        return navigator.gpu.requestAdapter().then(function (adapter) {
            if (!adapter) return false;
            if (!adapter.features.has("shader-f16")) { dtype = "q4"; sizeMB = 600; }
            return true;
        }, function () { return false; });
    }

    function isCached() {
        if (!window.caches) return Promise.resolve(false);
        return caches.open("transformers-cache").then(function (c) { return c.keys(); }).then(function (keys) {
            return keys.some(function (r) { return /Qwen3\.5-0\.8B-Text-ONNX\/.*\.onnx/.test(r.url); });
        }).catch(function () { return false; });
    }

    // On first open: check for WebGPU, and load straight away if the model is already downloaded.
    function start() {
        if (gpuCheck) return;
        gpuCheck = mobile ? Promise.resolve(false) : detectGpu();
        gpuCheck.then(function (ok) {
            if (!ok) return noGpu();
            return isCached().then(function (cached) {
                if (cached && state === "idle") load(true);
            });
        });
    }

    function noGpu() {
        setState("nogpu");
        if (mobile) {
            // Nothing typed here could be answered, so there is nothing to type into or click.
            form.hidden = true;
            suggest.hidden = true;
            log.querySelectorAll(".t-try").forEach(function (t) { t.hidden = true; });
            withEmail(dotRow("say"), "I only run on a computer; on phones and tablets I'm too big and too slow. Open this site in Chrome or Edge on a desktop or laptop, or skip me and email Dang at " + EMAIL + ".");
            return;
        }
        status.textContent = "WebGPU unavailable";
        withEmail(dotRow("err"), "I can't run in this browser. I need WebGPU, which recent Chrome and Edge have on desktop. Try one of those, or skip me and email Dang at " + EMAIL + ".");
    }

    // Asks before downloading. Arrow keys, number keys, Enter or a click pick an option.
    function consent() {
        gpuCheck.then(function (ok) {
            if (!ok) return noGpu();
            setState("consent");
            var box = el("div", "t-menu");
            box.appendChild(el("p", "t-menu-q", "Load the model?"));
            box.appendChild(el("p", "t-dim", "I run Qwen3.5-0.8B right here in your browser. That's a download of about " + sizeMB + " MB. Your browser can keep it so I start in seconds next time, or forget it when you close this tab. Nothing you type leaves this tab."));
            var options = ["Yes, for this visit only", "Yes, and keep it for next time", "Not now"].map(function (label, i) {
                var b = el("button", "t-option");
                b.type = "button";
                b.appendChild(el("span", "t-num", String(i + 1)));
                b.appendChild(document.createTextNode(label));
                b.addEventListener("click", function () { choose(i); });
                b.addEventListener("focus", function () { options.forEach(function (o) { o.classList.toggle("sel", o === b); }); });
                box.appendChild(b);
                return b;
            });
            function choose(i) {
                var answer = el("div", "t-sub t-dim");
                answer.appendChild(el("div", "t-body", "Load the model? " + ["Yes, for this visit", "Yes, and keep it", "Not now"][i]));
                box.replaceWith(answer);
                if (i < 2) {
                    load(false, i === 1);
                } else {
                    setState("idle");
                    pending = null;
                    note("Okay. Type /load whenever you change your mind.");
                }
                input.focus();
            }
            box.addEventListener("keydown", function (e) {
                var i = options.indexOf(document.activeElement);
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    options[(i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length].focus();
                } else if (e.key === "1" || e.key === "2" || e.key === "3") {
                    e.preventDefault();
                    choose(+e.key - 1);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    choose(2);
                }
            });
            host().appendChild(box);
            options[0].focus();
            stickToBottom();
        });
    }

    var meterFill = null, meterText = null;
    function bar(frac, text) {
        meterFill.style.width = (frac * 100).toFixed(1) + "%";
        meterText.textContent = text;
    }
    function drawProgress(loaded, total) {
        if (!meterFill) return;
        total = Math.max(total, sizeMB * 1e6);
        var frac = Math.min(loaded / total, 0.99);
        bar(frac, Math.floor(frac * 100) + "%, " + Math.round(loaded / 1e6) + " of " + Math.round(total / 1e6) + " MB");
        status.textContent = "loading " + Math.floor(frac * 100) + "%";
    }

    // keep: save the files in the browser for next time. A model that is already saved stays saved.
    function load(cached, keep) {
        setState("loading");
        status.textContent = "loading";
        dotRow("tool").textContent = cached
            ? "Loading my 0.8B-parameter brain from your browser's storage…"
            : "Loading my 0.8B-parameter brain (" + sizeMB + " MB, " + (keep ? "kept for next time" : "for this visit only") + ")…";
        meterFill = null;
        if (!cached) {
            var row = el("div", "t-progress"), meter = el("span", "t-meter");
            meterFill = el("span");
            meterText = el("span");
            meter.appendChild(meterFill);
            row.appendChild(meter);
            row.appendChild(meterText);
            subRow().appendChild(row);
        }
        drawProgress(0, 0);
        spin("Loading");
        worker = new Worker(panel.getAttribute("data-worker"), { type: "module" });
        worker.onmessage = onMessage;
        worker.onerror = function (e) { fail(e.message || "the model's script didn't load"); };
        worker.postMessage({ type: "load", dtype: dtype, keep: cached || keep, corpusUrl: new URL(panel.getAttribute("data-corpus"), location.href).href });
    }

    function ask(q) {
        setState("busy");
        current = { id: ++askId, q: q, mode: null, answer: null };
        log.setAttribute("aria-busy", "true");
        spin("Thinking", true);
        worker.postMessage({ type: "ask", id: current.id, q: q });
    }

    function interrupt() {
        if (state !== "busy" || !worker) return;
        worker.postMessage({ type: "stop" });
        spin("Interrupting");
    }

    // The answer step, made when the first words arrive or when a fixed reply comes back.
    function answerRow(kind) {
        if (!current.answer) current.answer = dotRow(kind);
        current.answer.parentNode.className = "t-step t-" + kind;
        return current.answer;
    }

    function showSources(ids) {
        var call = dotRow("tool");
        call.parentNode.classList.add("t-search");
        call.appendChild(el("strong", null, "Search"));
        call.appendChild(document.createTextNode(" "));
        call.appendChild(el("span", "t-arg", current.q.length > 60 ? current.q.slice(0, 59) + "…" : current.q));
        var list = subRow("t-search");
        list.appendChild(el("div", "t-dim", "Read " + ids.length + " passages"));
        ids.forEach(function (i) {
            var p = passages[i];
            var card = el("details", "t-src");
            var head = el("summary");
            head.appendChild(el("span", "t-file", p.file));
            head.appendChild(el("span", "t-dim", " › "));
            head.appendChild(document.createTextNode(p.title));
            card.appendChild(head);
            card.appendChild(el("div", "t-passage", p.text));
            if (p.anchor) {
                var a = el("a", "t-goto", "Go to this section");
                a.href = "#" + p.anchor;
                card.appendChild(a);
            }
            list.appendChild(card);
        });
    }

    // How many of the answer's sentences the fact-check kept, with the dropped ones a click away.
    // A draft that only said "I don't know" had nothing to check, and says so.
    function showCheck(kept, dropped, hedged) {
        var total = kept + dropped.length;
        var call = dotRow(dropped.length || hedged ? "warn" : "tool");
        call.appendChild(el("strong", null, "Fact-check"));
        call.appendChild(document.createTextNode(" "));
        call.appendChild(el("span", "t-arg", hedged ? "not needed: the draft found no answer"
            : "kept " + kept + " of " + total + (total === 1 ? " sentence" : " sentences")));
        var lines = hedged || dropped;
        if (!lines.length) return;
        var d = el("details", "t-src");
        d.appendChild(el("summary", "t-dim", hedged ? "Show the draft"
            : dropped.length === 1 ? "Dropped 1 sentence" : "Dropped " + dropped.length + " sentences"));
        lines.forEach(function (s) { d.appendChild(el("div", "t-dropped", s)); });
        subRow().appendChild(d);
    }

    function finish(m) {
        stopSpin();
        log.removeAttribute("aria-busy");
        if (m.kind === "interrupted") {
            if (current.answer) current.answer.parentNode.classList.add("t-stale");
            note(m.unchecked ? "Interrupted before the fact-check, so that answer is unchecked." : "Interrupted.", "t-err");
        } else if (m.kind === "play") {
            withEmail(answerRow("play"), m.answer);
            note(m.tag, "t-halluc");
            countWarning();
        } else {
            withEmail(answerRow("say"), m.answer);
            // Every answer the model drafted about Dang gets the row; fixed lines and chat don't.
            if (m.dropped || m.hedged) showCheck(m.kept || 0, m.dropped || [], m.hedged);
        }
        current = null;
        setState("ready");
    }

    // What went wrong, in words a visitor can act on, with the browser's own message underneath.
    function explain(message, loading) {
        if (/quota|storage/i.test(message))
            return "Your browser ran out of space to keep my files. Type /load and pick \"for this visit only\", or free up some disk space.";
        if (/fetch|network|load failed|connection|404|403|cors/i.test(message))
            return "I couldn't download my files. Check your connection (some networks block huggingface.co or jsdelivr.net), then type /load to try again.";
        if (/gpu|device|adapter|memory|alloc|buffer|shader/i.test(message))
            return "Your graphics card gave up on me. Close other heavy tabs and reload the page, or skip me and email Dang at " + EMAIL + ".";
        return "Something broke. " + (loading ? "Type /load to try again, or" : "Try again, or") + " reload the page. If it keeps happening, email Dang at " + EMAIL + ".";
    }

    function fail(message) {
        stopSpin();
        log.removeAttribute("aria-busy");
        var gpuLost = /gpu|device|adapter|memory|alloc|buffer|shader/i.test(message);
        withEmail(dotRow("err"), explain(message, state === "loading"));
        subRow("t-dim").textContent = message;
        // A lost graphics card won't answer again, so the model starts over on the next question.
        if (state === "loading" || gpuLost) {
            if (worker) worker.terminate();
            worker = null;
            setState("idle");
            status.textContent = "model not loaded";
        } else {
            setState("ready");
        }
        current = null;
    }

    function onMessage(e) {
        var m = e.data;
        heard = Date.now();
        if (m.type === "progress") return drawProgress(m.loaded, m.total);
        if (m.type === "stage") return spin("Reading Dang's site");
        if (m.type === "error") return fail(m.message);
        if (m.type === "ready") {
            passages = m.passages;
            setState("ready");
            stopSpin();
            if (meterFill) bar(1, "100%");
            status.textContent = "Qwen3.5-0.8B on WebGPU";
            note("Ready. Ask me about Dang, or anything else.", "t-ok");
            if (pending) { var q = pending; pending = null; ask(q); }
            return;
        }
        if (!current || m.id !== current.id) return;
        if (m.type === "route") {
            current.mode = m.mode;
            if (m.mode === "play") spin("Hallucinating", true);
            else if (m.mode === "chat") spin("Thinking", true);
            else if (m.mode === "fact" || m.mode === "bot") spin("Searching", true);
        } else if (m.type === "sources") {
            showSources(m.sources);
            spin("Reading sources", true);
        } else if (m.type === "text") {
            var play = current.mode === "play";
            if (!current.answer) spin(play ? "Hallucinating" : "Writing", true);
            answerRow(play ? "play" : "say").textContent = m.text;
            stickToBottom();
        } else if (m.type === "check") {
            spin("Fact-checking", true);
        } else if (m.type === "done") {
            finish(m);
        }
    }

    // ---- Commands ----
    var COMMANDS = [
        ["/help", "what I do, commands and shortcuts"],
        ["/about", "how I work"],
        ["/load", "load the model"],
        ["/clear", "clear the chat"],
        ["/delete-model", "remove my files from your browser"]
    ];

    function table(rows) {
        var t = el("div", "t-table");
        rows.forEach(function (r) {
            t.appendChild(el("span", "t-key", r[0]));
            t.appendChild(el("span", "t-dim", r[1]));
        });
        return t;
    }

    function help() {
        var b = subRow();
        b.appendChild(el("p", null, "Ask about Dang and I answer from this site, showing what I read. I'll chat about anything else too, but my answers to general questions (capitals, science, the news) aren't from this site, so they get a label."));
        b.appendChild(el("p", null, "Each question stands alone: I don't remember earlier ones."));
        b.appendChild(table(COMMANDS));
        b.appendChild(table([
            ["Enter", "send"], ["Shift+Enter", "new line"], ["↑ ↓", "earlier questions"],
            ["Esc", "interrupt an answer"], [keys("Ctrl+Alt+I"), "open or close ChatHallulu"],
            [keys("Ctrl+`"), "the terminal: search, resume, contact, BibTeX, no model needed"]
        ]));
    }

    var corpus = null;
    function about() {
        var b = subRow();
        corpus = corpus || fetch(panel.getAttribute("data-corpus")).then(function (r) { return r.json(); });
        corpus.then(function (c) {
            var notes = c.passages.filter(function (p) { return p.section === "ChatHallulu"; })[0];
            withEmail(b, notes.text);
            stickToBottom();
        }, function () {
            b.parentNode.classList.add("t-err");
            b.textContent = "I couldn't fetch my own notes. Try again in a moment.";
        });
    }

    function deleteModel() {
        var b = subRow("t-dim");
        function say(text) { b.textContent = text; stickToBottom(); }
        if (!window.caches) return say("There's nothing to delete.");
        caches.delete("transformers-cache").then(function (had) {
            if (!had) return say("There's nothing to delete.");
            say(state === "ready" || state === "busy"
                ? "Deleted my files from your browser. This tab keeps its loaded copy until you close it."
                : "Deleted my files from your browser.");
        });
    }

    // Back to the welcome. A question asked before the model loaded is dropped with the menu that asked.
    function newChat() {
        if (state === "busy") { flashHint("Still answering. Press Esc to interrupt."); return; }
        if (state === "consent") { setState("idle"); pending = null; }
        turn = null;
        log.replaceChildren(welcome.cloneNode(true));
        if (state === "nogpu" && mobile) log.querySelector(".t-try").hidden = true;
        stuck = true;
        input.focus();
    }

    function command(line) {
        var name = line.split(/\s+/)[0].toLowerCase();
        if (name === "/clear") return newChat();
        echo(line);
        if (name === "/help") help();
        else if (name === "/about") about();
        else if (name === "/delete-model") deleteModel();
        else if (name === "/load") {
            if (state === "ready" || state === "busy") note("Already loaded.");
            else if (state === "loading") note("Already loading.");
            else if (state !== "consent") consent();
        } else note("There's no " + name + ". Try /help.", "t-err");
        stickToBottom();
    }

    // ---- Input ----
    var history = [], historyPos = 0;
    var hintTimer = null;

    // A short message in place of the model's status, for a few seconds.
    function flashHint(text) {
        hint.textContent = text;
        hint.hidden = false;
        statusLine.hidden = true;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(function () {
            hint.hidden = true;
            statusLine.hidden = false;
        }, 3000);
    }

    function submit(text) {
        var q = text.trim();
        if (!q) return true;
        if (state === "busy") { flashHint("Still answering. Press Esc to interrupt."); return false; }
        if (q.charAt(0) === "/") { command(q); return true; }
        history.push(q);
        historyPos = history.length;
        echo(q);
        if (state === "nogpu") noGpu();
        else if (state === "ready") ask(q);
        else if (state === "loading") { pending = q; note("I'll answer once I've loaded."); }
        else { pending = q; if (state !== "consent") consent(); }
        return true;
    }

    function resize() {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    }

    function setInput(value) {
        input.value = value;
        resize();
        input.setSelectionRange(value.length, value.length);
    }

    // Typing "/" lists the matching commands. Tab completes, Enter runs the selected one.
    var matches = [], selected = 0;
    function updateSuggest() {
        var v = input.value;
        matches = /^\/\S*$/.test(v) ? COMMANDS.filter(function (c) { return c[0].indexOf(v.toLowerCase()) === 0; }) : [];
        selected = 0;
        drawSuggest();
    }
    function drawSuggest() {
        suggest.hidden = !matches.length;
        suggest.replaceChildren.apply(suggest, matches.map(function (c, i) {
            var li = el("li", i === selected ? "sel" : null);
            li.appendChild(el("span", "t-key", c[0]));
            li.appendChild(el("span", "t-dim", c[1]));
            li.addEventListener("mousedown", function (e) {
                e.preventDefault();
                setInput(c[0]);
                send();
            });
            return li;
        }));
    }

    function send() {
        if (submit(input.value)) setInput("");
        updateSuggest();
    }

    input.addEventListener("input", function () { resize(); updateSuggest(); });
    input.addEventListener("keydown", function (e) {
        if (e.isComposing) return;
        if (matches.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            selected = (selected + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length;
            drawSuggest();
        } else if (matches.length && e.key === "Tab") {
            e.preventDefault();
            setInput(matches[selected][0]);
            updateSuggest();
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (matches.length) setInput(matches[selected][0]);
            send();
        } else if (e.key === "ArrowUp" && history.length && input.value.lastIndexOf("\n", input.selectionStart - 1) === -1) {
            e.preventDefault();
            historyPos = Math.max(0, historyPos - 1);
            setInput(history[historyPos]);
        } else if (e.key === "ArrowDown" && historyPos < history.length && input.value.indexOf("\n", input.selectionEnd) === -1) {
            e.preventDefault();
            historyPos++;
            setInput(history[historyPos] || "");
        } else if (e.key === "Escape" && matches.length) {
            matches = [];
            drawSuggest();
        }
    });
    // The send button doubles as the stop button.
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (state === "busy") interrupt(); else send();
    });
    document.getElementById("chat-slash").addEventListener("click", function () {
        setInput("/");
        updateSuggest();
        input.focus();
    });

    // Esc anywhere in the side bar interrupts an answer.
    panel.addEventListener("keydown", function (e) {
        if (e.key === "Escape") interrupt();
    });

    term.addEventListener("click", function (e) {
        // The welcome's example questions ask themselves.
        var example = e.target.closest(".t-try button");
        if (example) { submit(example.textContent); input.focus(); return; }
        // Clicking empty space puts the cursor in the input, as a terminal would.
        if (e.target === term || e.target === log) input.focus();
        // On phones the chat covers the page, so following a source link closes it.
        if (e.target.closest(".t-goto") && phone.matches) closePanel();
    });
})();
