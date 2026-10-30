// Terminal: the bottom panel, opened with Ctrl+` as in VS Code. Its commands look things up on the site
// (sections, PDFs, contact, BibTeX, keyword search), so they work at once and without ChatHallulu's model.
(function () {
    "use strict";

    var root = document.documentElement;
    var body = document.body;
    var panel = document.getElementById("terminal");
    if (!panel) return;
    var termBody = document.getElementById("term-body");
    var log = document.getElementById("term-log");
    var form = document.getElementById("term-form");
    var input = document.getElementById("term-input");
    var toggles = document.querySelectorAll("[data-term-toggle]");
    var D = JSON.parse(document.getElementById("term-data").textContent);
    var phone = window.matchMedia("(max-width: 767.98px)");
    var keys = window.keyLabel || function (s) { return s; };  // Mac key names, from vscode.js

    // ---- Panel: open, close, resize ----
    // About 30% of the window, or the height the visitor dragged it to. The page gets that much more room
    // at the bottom, so the panel never hides the end of it.
    var MIN_H = 120, EDITOR_MIN = 180;
    var height = 0, greeted = false, returnFocus = null, tab = "terminal";
    try { height = +localStorage.getItem("term-h") || 0; } catch (e) {}

    function px(name) {
        return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
    }

    function layout() {
        var open = !panel.hidden && !phone.matches, h = 0;
        if (open) {
            var room = window.innerHeight - px("--title-h") - px("--tabs-h") - px("--crumb-h") - px("--status-h") - EDITOR_MIN;
            var want = height || Math.min(320, Math.max(160, Math.round(window.innerHeight * 0.3)));
            h = Math.max(MIN_H, Math.min(want, room));
        }
        root.style.setProperty("--term-h", h + "px");
        document.dispatchEvent(new Event("chatresize"));
    }

    // Each status bar toggle names its tab: Terminal, or Problems for the error and warning counts.
    function syncToggles() {
        toggles.forEach(function (t) {
            var on = !panel.hidden && (t.getAttribute("data-term-toggle") || "terminal") === tab;
            t.setAttribute("aria-expanded", String(on));
        });
    }

    var tabButtons = panel.querySelectorAll(".tm-tab");
    function showTab(name) {
        tab = name;
        tabButtons.forEach(function (b) {
            var on = b.getAttribute("data-tab") === name;
            b.setAttribute("aria-selected", String(on));
            b.tabIndex = on ? 0 : -1;
        });
        panel.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== name; });
        panel.querySelectorAll("[data-for]").forEach(function (c) { c.hidden = c.getAttribute("data-for") !== name; });
        syncToggles();
        if (name === "terminal" && !greeted) {
            greeted = true;
            print([text("Type "), cmd("help"), text(" for commands, or try "), cmd("ls"), text(", "), cmd("grep attention"), text(" or "), cmd("bibtex"), text(".")]);
            print(keys("Questions in plain English go to ChatHallulu (Ctrl+Alt+I)."), "tm-dim");
        }
    }

    function openPanel(name) {
        if (panel.hidden) returnFocus = document.activeElement;
        panel.hidden = false;
        showTab(name || "terminal");
        layout();
        if (tab === "terminal") input.focus();
    }

    function closePanel() {
        panel.hidden = true;
        syncToggles();
        layout();
        if (returnFocus && returnFocus.focus && !panel.contains(returnFocus)) returnFocus.focus();
    }

    // As in VS Code: Ctrl+` opens the terminal, moves focus to it if it's open elsewhere, and closes it
    // if it has focus.
    function togglePanel() {
        if (panel.hidden || tab !== "terminal") openPanel("terminal");
        else if (!panel.contains(document.activeElement)) input.focus();
        else closePanel();
    }

    toggles.forEach(function (t) {
        t.addEventListener("click", function () {
            var name = t.getAttribute("data-term-toggle") || "terminal";
            if (panel.hidden || tab !== name) openPanel(name); else closePanel();
        });
    });
    tabButtons.forEach(function (b, i) {
        b.addEventListener("click", function () {
            showTab(b.getAttribute("data-tab"));
            if (tab === "terminal") input.focus();
        });
        b.addEventListener("keydown", function (e) {
            var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            var next = tabButtons[(i + step + tabButtons.length) % tabButtons.length];
            showTab(next.getAttribute("data-tab"));
            next.focus();
        });
    });

    // ChatHallulu's labeled answers to general questions, listed under Problems as warnings.
    document.addEventListener("chatwarning", function (e) {
        var items = document.getElementById("problems-items");
        var li = el("li");
        var icon = el("i", "fa-solid fa-triangle-exclamation");
        icon.setAttribute("aria-hidden", "true");
        li.appendChild(icon);
        li.appendChild(text(e.detail.tag));
        li.appendChild(text(e.detail.q, "tm-note"));
        items.appendChild(li);
        document.getElementById("problems-count").textContent = items.children.length;
        document.getElementById("problems-none").hidden = true;
        document.getElementById("problems-list").hidden = false;
    });
    document.getElementById("term-close").addEventListener("click", closePanel);
    document.getElementById("term-clear").addEventListener("click", function () { clear(); input.focus(); });
    document.addEventListener("keydown", function (e) {
        if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.code === "Backquote" && !phone.matches) {
            e.preventDefault();
            togglePanel();
        }
    });
    window.addEventListener("resize", function () { if (!panel.hidden) layout(); });

    // Drag the top edge to resize. A double-click goes back to the default height.
    var sash = panel.querySelector(".tm-sash");
    var dragging = false;
    sash.addEventListener("pointerdown", function (e) {
        dragging = true;
        sash.setPointerCapture(e.pointerId);
        body.classList.add("term-dragging");
    });
    sash.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        height = Math.max(MIN_H, window.innerHeight - px("--status-h") - e.clientY);
        layout();
    });
    function endDrag() {
        if (!dragging) return;
        dragging = false;
        body.classList.remove("term-dragging");
        height = px("--term-h") || height;
        try { localStorage.setItem("term-h", String(height)); } catch (e) {}
    }
    sash.addEventListener("pointerup", endDrag);
    sash.addEventListener("pointercancel", endDrag);
    sash.addEventListener("dblclick", function () {
        height = 0;
        try { localStorage.removeItem("term-h"); } catch (e) {}
        layout();
    });

    // A click in the panel goes to the input, unless it selected text or hit a link.
    termBody.addEventListener("click", function (e) {
        if (e.target.closest("a, button") || String(window.getSelection())) return;
        input.focus();
    });

    // ---- Output ----
    function el(tag, cls, content) {
        var x = document.createElement(tag);
        if (cls) x.className = cls;
        if (content != null) x.textContent = content;
        return x;
    }

    function text(s, cls) { return el("span", cls, s); }

    function link(label, href, cls) {
        var a = el("a", cls, label);
        a.href = href;
        if (!/^(#|mailto:)/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
        return a;
    }

    // A command name that runs when clicked, so visitors who don't type can still use the list.
    function cmd(s) {
        var b = el("button", "tm-cmd", s);
        b.type = "button";
        b.addEventListener("click", function () { run(s); input.focus(); });
        return b;
    }

    // One line of output: a string or a list of nodes.
    function print(parts, cls) {
        var line = el("div", "tm-out" + (cls ? " " + cls : ""));
        (typeof parts === "string" ? [text(parts)] : parts).forEach(function (p) { line.appendChild(p); });
        log.appendChild(line);
        termBody.scrollTop = termBody.scrollHeight;
        return line;
    }

    function clear() { log.replaceChildren(); }

    function echo(line) {
        var x = el("div", "tm-out");
        x.appendChild(panel.querySelector(".tm-prompt").cloneNode(true));
        x.lastChild.removeAttribute("for");
        x.appendChild(text(" " + line));
        log.appendChild(x);
    }

    // Two columns, as `help` and `contact` print them. keyNodes, if given, draws the key column.
    function table(rows, keyNodes) {
        var w = rows.reduce(function (n, r) { return Math.max(n, r[0].length); }, 0) + 2;
        rows.forEach(function (r) {
            var key = keyNodes ? keyNodes(r[0]) : [text(r[0])];
            print(key.concat([text(new Array(w - r[0].length + 1).join(" ")), typeof r[1] === "string" ? text(r[1]) : r[1]]));
        });
    }

    // ---- Files and sections ----
    function jump(id) {
        var target = document.getElementById(id);
        if (!target) return false;
        target.scrollIntoView({ block: "start" });
        history.replaceState(null, "", "#" + id);
        return true;
    }

    function fileLink(name, id, cls) {
        var a = link(name, "#" + id, cls || "tm-file");
        a.addEventListener("click", function (e) { e.preventDefault(); jump(id); });
        return a;
    }

    var ALIASES = { papers: "publications", pubs: "publications", jobs: "experience", work: "experience", cv: "cv.pdf", resume: "resume.pdf", "~": "about", "..": "about", "/": "about", home: "about" };

    function bare(s) {
        return s.toLowerCase().replace(/^(\.\/|~\/|\/)+/, "").replace(/\/+$/, "").replace(/\.(md|yaml|yml|log|bib|json|pdf)$/, "");
    }

    // Finds a section, project or PDF from what a visitor typed: "research", "research.md", "pub",
    // "projects/ctrl-f-ilm.md", "ctrl" or "resume".
    function resolve(arg) {
        var a = (ALIASES[arg.toLowerCase()] || arg).toLowerCase();
        if (a === "cv.pdf") return { pdf: D.cv, name: "cv.pdf" };
        if (a === "resume.pdf") return { pdf: D.resume, name: "resume.pdf" };
        var b = bare(a).replace(/^projects\/(?=.)/, "");
        var all = D.files.concat(D.projects);
        var exact = all.filter(function (f) { return bare(f.name) === b || f.id === b; });
        if (exact.length) return exact[0];
        var pre = all.filter(function (f) { return b && bare(f.name).indexOf(b) === 0; });
        return pre.length === 1 ? pre[0] : null;
    }

    function openPdf(name, url) {
        window.open(url, "_blank", "noopener");
        print([text("Opening "), link(name, url), text(" in a new tab.")]);
    }

    function open(verb, args) {
        if (!args.length) {
            if (verb === "cd") { jump("about"); return; }
            print(verb + ": which file? Try ls.");
            return;
        }
        var f = resolve(args.join(" "));
        if (!f) print(verb + ": " + args.join(" ") + ": No such file or directory. Try ls.", "tm-err");
        else if (f.pdf) openPdf(f.name, f.pdf);
        else jump(f.id);
    }

    function ls(args) {
        var dir = args.filter(function (a) { return a[0] !== "-"; })[0];
        if (dir && bare(dir) === "projects") {
            print(D.projects.reduce(function (out, p, i) { return out.concat(i ? [text("  ")] : [], [fileLink(p.name, p.id)]); }, []));
            return;
        }
        if (dir && !resolve(dir)) { print("ls: cannot access '" + dir + "': No such file or directory", "tm-err"); return; }
        var parts = [];
        D.files.forEach(function (f) {
            parts.push(fileLink(f.name, f.id, /\/$/.test(f.name) ? "tm-file tm-dir" : "tm-file"), text("  "));
        });
        parts.push(link("cv.pdf", D.cv, "tm-file"), text("  "), link("resume.pdf", D.resume, "tm-file"));
        print(parts);
    }

    function contact() {
        table([["email", link(D.email, "mailto:" + D.email)]].concat(D.links.map(function (l) { return [l[0], link(l[1].replace(/^https:\/\/(www\.)?/, ""), l[1])]; })));
    }

    function bibtex() {
        if (!D.bibtex.length) { print("No papers on the site yet."); return; }
        D.bibtex.forEach(function (bib) {
            var copy = el("button", "tm-cmd", "Copy");
            copy.type = "button";
            copy.addEventListener("click", function () {
                navigator.clipboard.writeText(bib).then(function () { copy.textContent = "Copied"; }, function () { copy.textContent = "Select the text to copy it"; });
            });
            print(bib, "tm-pre");
            print([copy]);
        });
    }

    // ---- grep: BM25 over ChatHallulu's passages, without the model ----
    var searching = null;

    function loadSearch() {
        if (!searching) {
            searching = Promise.all([
                fetch(panel.getAttribute("data-corpus")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
                import(panel.getAttribute("data-search"))
            ]).then(function (x) {
                var C = x[0], S = x[1];
                return { C: C, rank: S.bm25Index(C), toks: S.toks };
            });
            searching.catch(function () { searching = null; });
        }
        return searching;
    }

    // The passage's lines (or, in a paragraph, sentences) that contain a search word, with those words
    // marked. A first line that repeats the title is skipped.
    function snippet(passage, qs, toks) {
        var lines = passage.text.split("\n");
        if (lines[0].indexOf(passage.title) >= 0) lines.shift();
        lines = lines.join("\n").split(/\n|(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
        var hits = lines.filter(function (l) { return toks(l).some(function (t) { return qs.has(t); }); });
        return (hits.length ? hits : lines).slice(0, 2).map(function (l) {
            var parts = [];
            l = l.length > 220 ? l.slice(0, 217) + "..." : l;
            l.split(/([A-Za-z0-9+#.-]+)/).forEach(function (w, i) {
                var hit = i % 2 === 1 && toks(w).some(function (t) { return qs.has(t); });
                parts.push(text(w, hit ? "tm-hit" : null));
            });
            return parts;
        });
    }

    function grep(verb, args) {
        var words = args.filter(function (a) { return a[0] !== "-"; }).join(" ").replace(/^["']|["']$/g, "");
        if (!words) { print([text("usage: " + verb + " <words>, e.g. "), cmd(verb + " attention")]); return; }
        var wait = print("Searching...", "tm-dim");
        loadSearch().then(function (S) {
            wait.remove();
            var qs = new Set(S.toks(words));
            if (!qs.size) { print(verb + ": too common to search for. Try a more specific word."); return; }
            // The bot's notes about itself have no place on the page (no anchor), so grep leaves them out.
            var found = S.rank(words).filter(function (r) { return r.s > 0 && S.C.passages[r.i].anchor; }).slice(0, 5);
            if (!found.length) { print("No matches for \"" + words + "\"."); return; }
            found.forEach(function (r) {
                var p = S.C.passages[r.i];
                // The bio comes in numbered parts ("About 2"); the number means nothing to a visitor.
                print([fileLink(p.file, p.anchor), text(":", "tm-dim"), text(" " + p.title.replace(/^About \d+$/, "About"), "tm-title")]);
                snippet(p, qs, S.toks).forEach(function (parts) { print(parts, "tm-indent"); });
            });
        }, function () {
            wait.remove();
            print(verb + ": couldn't load the site's text. Check the connection and try again.", "tm-err");
        });
    }

    // ---- Commands ----
    var HELP = [
        ["help", "this list"],
        ["ls", "list the files"],
        ["open <file>", "go to a section, e.g. open research (also cd)"],
        ["grep <words>", "search the site, e.g. grep attention (also search)"],
        ["resume", "open the resume PDF (cv for the CV)"],
        ["contact", "email and links"],
        ["bibtex", "citation for each paper"],
        ["clear", keys("clear the terminal (Ctrl+L)")],
        ["exit", "close the terminal"]
    ];

    // Questions get pointed to ChatHallulu instead of "command not found" alone.
    var QUESTION = /\?\s*$|^(what|who|where|when|why|how|is|are|does|did|do|can|has|tell)\b.*\s.*\s/i;

    function askChat(q) {
        var b = el("button", "tm-cmd", "Ask ChatHallulu");
        b.type = "button";
        b.addEventListener("click", function () {
            var chat = document.getElementById("chat-panel");
            var chatInput = document.getElementById("chat-input");
            if (chat && chat.hidden) document.querySelector("[data-chat-toggle]").click();
            if (chatInput) {
                chatInput.value = q;
                chatInput.dispatchEvent(new Event("input"));
                chatInput.focus();
            }
        });
        return b;
    }

    function run(line) {
        line = line.trim();
        echo(line);
        if (line) past.push(line);
        hIndex = past.length;
        if (!line) return;
        var args = line.split(/\s+/), verb = args.shift().toLowerCase();

        if (verb === "help" || verb === "man" || verb === "--help") table(HELP, function (s) {
            var v = s.split(" ")[0];
            return [cmd(v), text(s.slice(v.length))];
        });
        else if (verb === "ls" || verb === "dir") ls(args);
        else if (verb === "open" || verb === "cd" || verb === "cat" || verb === "code" || verb === "less") open(verb, args);
        else if (verb === "grep" || verb === "search" || verb === "find") grep(verb, args);
        else if (verb === "resume" || verb === "cv") openPdf(verb + ".pdf", verb === "cv" ? D.cv : D.resume);
        else if (verb === "contact" || verb === "email") contact();
        else if (verb === "bibtex" || verb === "cite") bibtex();
        else if (verb === "clear" || verb === "cls") clear();
        else if (verb === "pwd") print("/home/visitor/dangtran278.github.io");
        else if (verb === "whoami") print("visitor");
        else if (verb === "exit" || verb === "logout") {
            print("logout");
            print(keys("Ctrl+` brings me back."), "tm-dim");
            setTimeout(closePanel, 700);
        }
        else if (verb === "sudo") {
            if (/^hire\b/i.test(args.join(" "))) {
                print("[sudo] password for visitor:");
                print([text("Hiring Dang doesn't need root. Email works: "), link(D.email, "mailto:" + D.email)]);
            }
            else print("visitor is not in the sudoers file. This incident will be reported.");
        }
        else if (verb === "rm") {
            var target = args.filter(function (a) { return a[0] !== "-"; })[0] || "";
            if (/^\/\*?$/.test(target)) print("rm: blocked by ChatHallulu, who lives in '/' and would like to keep existing.", "tm-err");
            else print("rm: cannot remove '" + target + "': Read-only file system", "tm-err");
        }
        else if (QUESTION.test(line)) print([text(verb + ": command not found. That reads like a question: "), askChat(line)], "tm-err");
        else print([text(verb + ": command not found. Try "), cmd("help"), text(".")], "tm-err");
        termBody.scrollTop = termBody.scrollHeight;
    }

    // ---- Input: Enter runs, up and down walk the history, Tab completes ----
    var past = [], hIndex = 0;
    var VERBS = ["help", "ls", "open", "cd", "grep", "search", "resume", "cv", "contact", "bibtex", "clear", "exit"];

    function names() {
        return D.files.map(function (f) { return f.name; })
            .concat(D.projects.map(function (p) { return "projects/" + p.name; }), ["cv.pdf", "resume.pdf"]);
    }

    function complete() {
        var v = input.value, sp = v.lastIndexOf(" ");
        var word = v.slice(sp + 1), pool = sp < 0 ? VERBS : names();
        var matches = pool.filter(function (n) { return n.indexOf(word.toLowerCase()) === 0; });
        if (!matches.length) return;
        var common = matches.reduce(function (a, b) {
            var i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            return a.slice(0, i);
        });
        if (matches.length === 1) common += /\/$/.test(common) ? "" : " ";
        if (common.length > word.length) input.value = v.slice(0, sp + 1) + common;
        else if (matches.length > 1) { echo(v); print(matches.join("  ")); }
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var line = input.value;
        input.value = "";
        run(line);
    });
    input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            hIndex = Math.max(0, Math.min(past.length, hIndex + (e.key === "ArrowUp" ? -1 : 1)));
            input.value = past[hIndex] || "";
        } else if (e.key === "Tab" && !e.shiftKey && input.value) {
            e.preventDefault();
            complete();
        } else if (e.ctrlKey && !e.altKey && (e.key === "l" || e.key === "L")) {
            e.preventDefault();
            clear();
        } else if (e.ctrlKey && !e.altKey && (e.key === "c" || e.key === "C") && input.selectionStart === input.selectionEnd) {
            e.preventDefault();
            echo(input.value + "^C");
            input.value = "";
        }
    });
})();
