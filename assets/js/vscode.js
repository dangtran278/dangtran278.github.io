// Workbench behavior: the tab, Explorer entry and status bar follow the section in view,
// plus the theme toggle, the Explorer toggle, quick open (Ctrl K) and the minimap.
(function () {
    "use strict";

    var root = document.documentElement;
    var body = document.body;
    var editor = document.getElementById("editor");
    var files = Array.prototype.slice.call(editor.querySelectorAll(".file"));
    var tabStrip = document.querySelector(".tabs");
    var tabs = document.querySelectorAll(".tab[data-target]");
    var treeItems = document.querySelectorAll(".tree-item[data-target]");
    var breadcrumbs = document.querySelector(".breadcrumbs");
    var crumb = document.getElementById("crumb");
    var sbLang = document.getElementById("sb-lang");
    var sbPos = document.getElementById("sb-pos");
    var LINES = "h2, h3, p, li, dt";

    // Bottom edge of the sticky chrome; content above it is hidden.
    function chromeBottom() {
        var el = breadcrumbs && breadcrumbs.offsetHeight ? breadcrumbs : tabStrip;
        return el.getBoundingClientRect().bottom;
    }

    // Section tracking
    var currentId = null;

    function currentFile(top) {
        var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        if (atEnd) return files[files.length - 1];
        var found = files[0];
        for (var i = 0; i < files.length; i++) {
            if (files[i].getBoundingClientRect().top <= top + 8) found = files[i];
        }
        return found;
    }

    function revealTab(tab) {
        var left = tab.offsetLeft, right = left + tab.offsetWidth;
        if (left < tabStrip.scrollLeft) tabStrip.scrollLeft = left - 24;
        else if (right > tabStrip.scrollLeft + tabStrip.clientWidth) tabStrip.scrollLeft = right - tabStrip.clientWidth + 24;
    }

    function updateSection() {
        var top = chromeBottom();
        var file = currentFile(top);
        if (!file) return;

        if (file.id !== currentId) {
            currentId = file.id;
            tabs.forEach(function (t) {
                var on = t.getAttribute("data-target") === currentId;
                t.classList.toggle("active", on);
                if (on) { t.setAttribute("aria-current", "true"); revealTab(t); }
                else t.removeAttribute("aria-current");
            });
            treeItems.forEach(function (t) {
                t.classList.toggle("active", t.getAttribute("data-target") === currentId);
            });
            if (crumb) crumb.textContent = file.getAttribute("data-name");
            if (sbLang) sbLang.textContent = file.getAttribute("data-lang");
        }

        if (sbPos) {
            var lines = file.querySelectorAll(LINES), n = 1;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].getBoundingClientRect().bottom > top) { n = i + 1; break; }
            }
            sbPos.textContent = "Ln " + n + ", Col 1";
        }
    }

    // Theme toggle: the system theme applies until the visitor picks one.
    var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var themeButton = document.getElementById("theme-toggle");

    function effectiveTheme() {
        return root.getAttribute("data-theme") || (darkQuery.matches ? "dark" : "light");
    }

    function labelThemeButton() {
        var next = effectiveTheme() === "dark" ? "light" : "dark";
        themeButton.setAttribute("aria-label", "Switch to " + next + " theme");
        themeButton.title = "Switch to " + next + " theme";
    }

    if (themeButton) {
        labelThemeButton();
        themeButton.addEventListener("click", function () {
            var next = effectiveTheme() === "dark" ? "light" : "dark";
            root.setAttribute("data-theme", next);
            try { localStorage.setItem("theme", next); } catch (e) {}
            labelThemeButton();
        });
        darkQuery.addEventListener("change", labelThemeButton);
    }

    // Explorer toggle
    var explorerButton = document.getElementById("explorer-toggle");
    if (explorerButton) {
        explorerButton.addEventListener("click", function () {
            var hidden = body.classList.toggle("sidebar-hidden");
            explorerButton.classList.toggle("active", !hidden);
            explorerButton.setAttribute("aria-pressed", String(!hidden));
            renderMinimap();
            updateSection();
        });
    }

    // Quick open
    var qo = document.getElementById("quickopen");
    var qoInput = qo.querySelector("input");
    var qoItems = Array.prototype.slice.call(qo.querySelectorAll(".qo-list li"));
    var qoReturnFocus = null;

    function visibleItems() {
        return qoItems.filter(function (li) { return !li.hidden; });
    }

    function select(li) {
        qoItems.forEach(function (x) { x.classList.toggle("sel", x === li); });
    }

    function filterItems() {
        var q = qoInput.value.trim().toLowerCase();
        qoItems.forEach(function (li) { li.hidden = q !== "" && li.textContent.toLowerCase().indexOf(q) === -1; });
        select(visibleItems()[0] || null);
    }

    function openQuickOpen() {
        qoReturnFocus = document.activeElement;
        qo.hidden = false;
        qoInput.value = "";
        filterItems();
        qoInput.focus();
    }

    function closeQuickOpen() {
        qo.hidden = true;
        if (qoReturnFocus && qoReturnFocus.focus) qoReturnFocus.focus();
    }

    document.querySelectorAll("[data-quickopen]").forEach(function (b) {
        b.addEventListener("click", openQuickOpen);
    });

    qo.addEventListener("mousedown", function (e) {
        if (e.target === qo) closeQuickOpen();
    });
    qo.addEventListener("click", function (e) {
        if (e.target.closest("a")) qo.hidden = true;
    });
    qoInput.addEventListener("input", filterItems);
    qoInput.addEventListener("keydown", function (e) {
        var items = visibleItems();
        var i = items.indexOf(qo.querySelector("li.sel"));
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!items.length) return;
            i = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
            select(items[i]);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (i >= 0) { qo.hidden = true; items[i].querySelector("a").click(); }
        } else if (e.key === "Escape") {
            closeQuickOpen();
        }
    });
    document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (qo.hidden) openQuickOpen(); else closeQuickOpen();
        } else if (e.key === "Escape" && !qo.hidden) {
            closeQuickOpen();
        }
    });

    // Minimap: a scaled copy of the editor. Click or drag it to scroll.
    var minimap = document.querySelector(".minimap");
    var mmContent = minimap.querySelector(".mm-content");
    var mmSlider = minimap.querySelector(".mm-slider");
    var mmScale = 0, mmOffset = 0;

    function minimapShown() {
        return minimap.offsetWidth > 0;
    }

    function renderMinimap() {
        if (!minimapShown()) return;
        var copy = editor.cloneNode(true);
        copy.removeAttribute("id");
        copy.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
        mmContent.replaceChildren(copy);
        mmContent.style.width = editor.offsetWidth + "px";
        mmScale = minimap.clientWidth / editor.offsetWidth;
        mmContent.style.transform = "scale(" + mmScale + ")";
        updateMinimap();
    }

    function visibleHeight() {
        var status = document.querySelector(".statusbar");
        return window.innerHeight - chromeBottom() - status.offsetHeight;
    }

    function editorTop() {
        return editor.getBoundingClientRect().top + window.scrollY;
    }

    function updateMinimap() {
        if (!mmScale || !minimapShown()) return;
        var contentH = editor.offsetHeight * mmScale;
        var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        var frac = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        mmOffset = Math.max(0, contentH - minimap.clientHeight) * frac;
        mmContent.style.top = -mmOffset + "px";
        var visTop = window.scrollY + chromeBottom() - editorTop();
        mmSlider.style.top = (visTop * mmScale - mmOffset) + "px";
        mmSlider.style.height = visibleHeight() * mmScale + "px";
    }

    function scrollFromMinimap(clientY) {
        var y = clientY - minimap.getBoundingClientRect().top + mmOffset;
        var target = editorTop() + y / mmScale - chromeBottom() - visibleHeight() / 2;
        window.scrollTo({ top: Math.max(0, target), behavior: "instant" });
    }

    var dragging = false;
    minimap.addEventListener("pointerdown", function (e) {
        dragging = true;
        minimap.setPointerCapture(e.pointerId);
        scrollFromMinimap(e.clientY);
    });
    minimap.addEventListener("pointermove", function (e) {
        if (dragging) scrollFromMinimap(e.clientY);
    });
    minimap.addEventListener("pointerup", function () { dragging = false; });
    minimap.addEventListener("pointercancel", function () { dragging = false; });

    // Wiring
    var ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
            ticking = false;
            updateSection();
            updateMinimap();
        });
    }

    var resizeTimer = null;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { renderMinimap(); updateSection(); }, 150);
    });
    window.addEventListener("load", renderMinimap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderMinimap);

    updateSection();
    renderMinimap();
})();
