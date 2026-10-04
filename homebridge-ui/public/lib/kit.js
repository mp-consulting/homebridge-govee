/* @mp-consulting/homebridge-ui-kit v1.2.1
   Brand design system for Homebridge plugins
   https://github.com/mp-consulting/homebridge-ui-kit */

(function (global) {
  'use strict';

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

  /** Escapes a value for safe use in HTML text and quoted attributes. */
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ESCAPES[c];
    });
  }

  /** Returns the URL if it uses http(s), otherwise null (blocks javascript:, data:, …). */
  function safeUrl(url) {
    if (typeof url !== 'string') { return null; }
    return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
  }

  function badge(badgeClass, dotClass, label) {
    return '<span class="badge ' + badgeClass + '">'
      + (dotClass ? '<span class="mp-status ' + dotClass + ' me-1" aria-hidden="true"></span>' : '')
      + escapeHtml(label) + '</span>';
  }

  // Icon paths from Bootstrap Icons 1.11.3 (MIT), inlined so the footer
  // works whether or not the plugin loads the icon font.
  var FOOTER_LINKS = [
    {
      key: 'github',
      text: 'GitHub',
      paths: [
        'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8',
      ],
    },
    {
      key: 'npm',
      text: 'npm',
      paths: [
        'M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2zm3.564 1.426L5.596 5 8 5.961 14.154 3.5zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z',
      ],
    },
    {
      key: 'changelog',
      text: 'Changelog',
      paths: [
        'M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z',
        'M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z',
        'M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5',
      ],
    },
  ];

  function icon(paths) {
    return '<svg class="mp-footer-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('')
      + '</svg>';
  }

  var MpKit = {

    escapeHtml: escapeHtml,

    /**
     * StatusBadge — returns inline HTML for device status badges.
     * Labels are HTML-escaped.
     *
     * MpKit.StatusBadge.online()    → green dot + "Online"
     * MpKit.StatusBadge.offline()   → red dot + "Offline"
     * MpKit.StatusBadge.checking()  → animated dot + "Checking…"
     * MpKit.StatusBadge.disabled()  → grey badge + "Disabled"
     */
    StatusBadge: {
      online: function (label) {
        return badge('bg-success-subtle text-success', 'mp-status-online', label || 'Online');
      },
      offline: function (label) {
        return badge('bg-danger-subtle text-danger', 'mp-status-offline', label || 'Offline');
      },
      checking: function (label) {
        return badge('bg-secondary-subtle text-secondary', 'mp-status-checking', label || 'Checking…');
      },
      disabled: function (label) {
        return badge('bg-secondary', null, label || 'Disabled');
      },
    },

    /**
     * EmptyState — returns HTML for an empty list placeholder.
     * All options are HTML-escaped.
     *
     * MpKit.EmptyState.render({
     *   iconClass: 'bi bi-lightbulb',
     *   title: 'No devices found',
     *   hint: 'Click Discover to scan your network',
     * })
     */
    EmptyState: {
      render: function (opts) {
        opts = opts || {};
        var icon = opts.iconClass || 'bi bi-inbox';
        var title = opts.title || 'No items';
        var hint = opts.hint || '';
        return '<div class="mp-empty-state">'
          + '<i class="' + escapeHtml(icon) + ' mp-empty-state-icon" aria-hidden="true"></i>'
          + '<p class="mp-empty-state-title">' + escapeHtml(title) + '</p>'
          + (hint ? '<p class="mp-empty-state-hint">' + escapeHtml(hint) + '</p>' : '')
          + '</div>';
      },
    },

    /**
     * Loading — returns HTML for a centred loading spinner with message.
     * The message is HTML-escaped and announced to screen readers.
     *
     * MpKit.Loading.render('Loading device information...')
     */
    Loading: {
      render: function (message) {
        message = message || 'Loading…';
        return '<div class="mp-loading" role="status" aria-live="polite">'
          + '<div class="spinner-border spinner-border-sm text-secondary" aria-hidden="true"></div>'
          + '<span>' + escapeHtml(message) + '</span>'
          + '</div>';
      },
    },

    /**
     * View — controls which .mp-view element is visible.
     *
     * MpKit.View.show('listView')     → shows #listView, hides all others
     * MpKit.View.show('settingsView') → shows #settingsView, hides all others
     */
    View: {
      show: function (id) {
        document.querySelectorAll('.mp-view').forEach(function (v) {
          v.classList.toggle('active', v.id === id);
        });
      },
    },

    /**
     * Footer — renders support links into a .mp-footer element.
     * Only http(s) URLs are rendered; anything else is skipped.
     *
     * MpKit.Footer.render({
     *   github: 'https://github.com/mp-consulting/homebridge-...',
     *   npm: 'https://www.npmjs.com/package/@mp-consulting/...',
     *   changelog: 'https://github.com/.../blob/main/CHANGELOG.md',
     *   target: '.mp-footer', // optional selector or element
     * })
     */
    Footer: {
      render: function (opts) {
        opts = opts || {};
        var target = opts.target || '.mp-footer';
        var el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) { return; }
        var links = [];
        FOOTER_LINKS.forEach(function (link) {
          var url = safeUrl(opts[link.key]);
          if (!url) { return; }
          links.push('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">'
            + icon(link.paths) + link.text + '</a>');
        });
        el.innerHTML = links.join('<span class="mp-footer-sep" aria-hidden="true">|</span>');
      },
    },

  };

  // ── Assistant (AI) ─────────────────────────────────────────────────────────
  // Talks to the plugin's server-side routes registered by
  // @mp-consulting/homebridge-ai-core/plugin (`registerAiRoutes`) through the global
  // `homebridge` object from @homebridge/plugin-ui-utils.

  // Generic four-point sparkle (not a product logo).
  var SPARKLE = '<svg class="mp-ai-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
    + '<path d="M8 0c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6z"/>'
    + '<path d="M13.5 10.5c.15 1.5.85 2.2 2.5 2.5-1.65.3-2.35 1-2.5 2.5-.15-1.5-.85-2.2-2.5-2.5 1.65-.3 2.35-1 2.5-2.5z"/>'
    + '</svg>';
  var CARET = '<span class="mp-ai-caret" aria-hidden="true"></span>';
  var DEFAULT_NOTE = 'Generated by the Assistant. Check it before acting on it.';
  var DEFAULT_ERROR = 'The Assistant could not answer. Please try again.';
  var LCS_LIMIT = 4000000; // cells; larger diffs fall back to remove-all/add-all

  var aiSeq = 0;
  var uid = 0;

  function hbClient() {
    return global.homebridge || (typeof homebridge !== 'undefined' ? homebridge : undefined);
  }

  function newRequestId() {
    aiSeq += 1;
    return 'mpai-' + Date.now().toString(36) + '-' + aiSeq.toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
  }

  function eventData(ev) {
    if (ev && ev.data !== undefined) { return ev.data; }
    if (ev && ev.detail !== undefined) { return ev.detail; }
    return ev;
  }

  function errorMessage(err, fallback) {
    if (typeof err === 'string' && err) { return err; }
    return (err && err.message) || fallback;
  }

  /**
   * Sends a request to an /ai/* route with a generated requestId and, while it
   * runs, forwards matching `ai:chunk` / `ai:done` / `ai:error` events to the
   * onChunk / onDone / onError callbacks. Resolves with the route's result.
   */
  function aiRequest(path, body, opts) {
    opts = opts || {};
    var hb = hbClient();
    if (!hb || typeof hb.request !== 'function') {
      return Promise.reject(new Error('MpKit.ai needs the Homebridge plugin UI (window.homebridge)'));
    }
    var requestId = newRequestId();
    var payload = {};
    Object.keys(body || {}).forEach(function (k) { payload[k] = body[k]; });
    payload.requestId = requestId;

    var listeners = [];
    if (typeof hb.addEventListener === 'function') {
      var on = function (type, fn) {
        var handler = function (ev) {
          var data = eventData(ev);
          if (data && data.requestId === requestId) { fn(data); }
        };
        hb.addEventListener(type, handler);
        listeners.push([type, handler]);
      };
      if (typeof opts.onChunk === 'function') {
        on('ai:chunk', function (d) {
          if (typeof d.delta === 'string' && d.delta) { opts.onChunk(d.delta, d); }
        });
      }
      if (typeof opts.onDone === 'function') {
        on('ai:done', function (d) { opts.onDone(d); });
      }
      if (typeof opts.onError === 'function') {
        on('ai:error', function (d) { opts.onError(d.message || DEFAULT_ERROR, d); });
      }
    }
    function cleanup() {
      if (typeof hb.removeEventListener !== 'function') { return; }
      listeners.forEach(function (l) { hb.removeEventListener(l[0], l[1]); });
    }

    var pending;
    try {
      pending = Promise.resolve(hb.request(path, payload));
    } catch (err) {
      pending = Promise.reject(err);
    }
    return pending.then(function (result) {
      cleanup();
      return result;
    }, function (err) {
      cleanup();
      throw err;
    });
  }

  // ── Safe markdown subset ──
  // Paragraphs, **bold**, `inline code`, fenced code blocks, bullet and
  // numbered lists, and #-headings (rendered as bold paragraphs). Every piece of
  // text is HTML-escaped before any tag is added, so model output can never
  // inject markup. Links are left as plain text.

  function inlineMarkdown(text) {
    return String(text).split(/(`[^`\n]+`)/).map(function (part, i) {
      if (i % 2 === 1) { return '<code>' + escapeHtml(part.slice(1, -1)) + '</code>'; }
      return escapeHtml(part).replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, function (m, a, b) {
        return '<strong>' + (a || b) + '</strong>';
      });
    }).join('');
  }

  var UL_ITEM = /^\s*[-*+]\s+(.*)$/;
  var OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;
  var HEADING = /^\s*#{1,6}\s+(.*)$/;
  var FENCE = /^\s*(```|~~~)/;

  function markdown(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var para = [];
    var i = 0;
    function flush() {
      if (para.length) {
        out.push('<p>' + para.map(inlineMarkdown).join('<br>') + '</p>');
        para = [];
      }
    }
    while (i < lines.length) {
      var line = lines[i];
      var fence = FENCE.exec(line);
      if (fence) {
        flush();
        var code = [];
        i += 1;
        while (i < lines.length && lines[i].trim().indexOf(fence[1]) !== 0) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1; // closing fence (absent while a block is still streaming)
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      var listRe = UL_ITEM.test(line) ? UL_ITEM : (OL_ITEM.test(line) ? OL_ITEM : null);
      if (listRe) {
        flush();
        var tag = listRe === UL_ITEM ? 'ul' : 'ol';
        var items = [];
        while (i < lines.length && listRe.test(lines[i])) {
          items.push('<li>' + inlineMarkdown(listRe.exec(lines[i])[1]) + '</li>');
          i += 1;
        }
        out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
        continue;
      }
      var heading = HEADING.exec(line);
      if (heading) {
        flush();
        out.push('<p><strong>' + inlineMarkdown(heading[1]) + '</strong></p>');
      } else if (!line.trim()) {
        flush();
      } else {
        para.push(line);
      }
      i += 1;
    }
    flush();
    return out.join('');
  }

  /** Puts the streaming caret at the end of the last paragraph or list item. */
  function withCaret(html) {
    if (/<\/p>$/.test(html)) { return html.slice(0, -4) + CARET + '</p>'; }
    if (/<\/li><\/[ou]l>$/.test(html)) { return html.slice(0, -10) + CARET + html.slice(-10); }
    return html + CARET;
  }

  // ── Line diff (longest common subsequence) ──

  function toLines(value) {
    if (value == null) { return []; }
    var text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    text = text.replace(/\r\n?/g, '\n');
    if (text === '') { return []; }
    if (text.charAt(text.length - 1) === '\n') { text = text.slice(0, -1); }
    return text.split('\n');
  }

  function diffLines(before, after) {
    var a = toLines(before);
    var b = toLines(after);
    var out = [];
    var start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
      out.push({ type: 'same', text: a[start] });
      start += 1;
    }
    var endA = a.length;
    var endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA -= 1;
      endB -= 1;
    }
    var x = a.slice(start, endA);
    var y = b.slice(start, endB);
    var n = x.length;
    var m = y.length;
    var i;
    var j;
    if (n * m > LCS_LIMIT) {
      x.forEach(function (t) { out.push({ type: 'del', text: t }); });
      y.forEach(function (t) { out.push({ type: 'add', text: t }); });
    } else {
      var w = m + 1;
      var dp = new Int32Array((n + 1) * w);
      for (i = n - 1; i >= 0; i -= 1) {
        for (j = m - 1; j >= 0; j -= 1) {
          dp[i * w + j] = x[i] === y[j]
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
      }
      i = 0;
      j = 0;
      while (i < n && j < m) {
        if (x[i] === y[j]) {
          out.push({ type: 'same', text: x[i] });
          i += 1;
          j += 1;
        } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
          out.push({ type: 'del', text: x[i] });
          i += 1;
        } else {
          out.push({ type: 'add', text: y[j] });
          j += 1;
        }
      }
      for (; i < n; i += 1) { out.push({ type: 'del', text: x[i] }); }
      for (; j < m; j += 1) { out.push({ type: 'add', text: y[j] }); }
    }
    for (i = endA; i < a.length; i += 1) { out.push({ type: 'same', text: a[i] }); }
    return out;
  }

  var DIFF_SIGN = { add: '+', del: '−', same: ' ' };
  var DIFF_SR = { add: 'Added: ', del: 'Removed: ', same: '' };

  function diffLineHtml(line) {
    return '<span class="mp-ai-diff-line is-' + line.type + '">'
      + '<span class="mp-ai-diff-sign" aria-hidden="true">' + DIFF_SIGN[line.type] + '</span>'
      + (DIFF_SR[line.type] ? '<span class="mp-ai-sr-only">' + DIFF_SR[line.type] + '</span>' : '')
      + escapeHtml(line.text) + '</span>';
  }

  /** Replaces a previous listener of the same kind that MpKit.ai bound to el. */
  function bind(el, type, fn) {
    var store = el.__mpAiListeners || (el.__mpAiListeners = {});
    if (store[type]) { el.removeEventListener(type, store[type]); }
    store[type] = fn;
    el.addEventListener(type, fn);
  }

  function actionTarget(ev) {
    var t = ev && ev.target;
    return t && typeof t.closest === 'function' ? t.closest('[data-mp-ai-action]') : null;
  }

  function badgeHtml(label) {
    return '<span class="mp-ai-badge">' + SPARKLE + escapeHtml(label || 'Assistant') + '</span>';
  }

  function thinkingHtml(label) {
    return '<span class="mp-ai-thinking" role="status">' + escapeHtml(label || 'Thinking…') + '</span>';
  }

  var edgeEl = null;

  var ai = {

    /** GET-style status of the Assistant: { enabled, provider, model, capabilities }. */
    status: function () {
      var hb = hbClient();
      if (!hb || typeof hb.request !== 'function') {
        return Promise.reject(new Error('MpKit.ai needs the Homebridge plugin UI (window.homebridge)'));
      }
      return Promise.resolve(hb.request('/ai/status'));
    },

    /** Explains a device/plugin error. body: { error, context?, device? } → { text, usage } */
    explain: function (body, opts) { return aiRequest('/ai/explain', body, opts); },

    /** Free-form question. body: { prompt, context? } → { text, usage } */
    ask: function (body, opts) { return aiRequest('/ai/ask', body, opts); },

    /** Generates plugin config. body: { schema, request, current? } → { config, explanation, usage } */
    config: function (body, opts) { return aiRequest('/ai/config', body, opts); },

    markdown: markdown,
    diffLines: diffLines,

    /**
     * Returns HTML for an Assistant button (sparkle icon + escaped label).
     * opts: { label = 'Ask Assistant', id, className, size: 'sm' | 'lg', title }
     */
    renderButton: function (opts) {
      opts = opts || {};
      var cls = 'mp-ai-button'
        + (opts.size === 'sm' || opts.size === 'lg' ? ' mp-ai-button-' + opts.size : '')
        + (opts.className ? ' ' + escapeHtml(opts.className) : '');
      return '<button type="button" class="' + cls + '"'
        + (opts.id ? ' id="' + escapeHtml(opts.id) + '"' : '')
        + (opts.title ? ' title="' + escapeHtml(opts.title) + '"' : '')
        + '>' + SPARKLE + '<span>' + escapeHtml(opts.label || 'Ask Assistant') + '</span></button>';
    },

    /** Returns HTML for a small "Assistant" badge. */
    renderBadge: badgeHtml,

    /** Returns HTML for a pulsing "Thinking…" indicator (a status live region). */
    renderThinking: thinkingHtml,

    /**
     * Renders an answer panel into el and returns a controller for streaming:
     *   const answer = MpKit.ai.renderAnswer(el);
     *   const res = await MpKit.ai.ask({ prompt }, { onChunk: answer.append });
     *   answer.done(res.text);
     * opts: { label = 'Assistant', title, text, streaming = true, note }
     * The text is rendered as escaped, safe markdown.
     */
    renderAnswer: function (el, opts) {
      opts = opts || {};
      var note = opts.note === undefined ? DEFAULT_NOTE : opts.note;
      el.innerHTML = '<section class="mp-ai-panel" aria-label="' + escapeHtml(opts.label || 'Assistant') + ' answer">'
        + '<div class="mp-ai-panel-header">' + badgeHtml(opts.label)
        + (opts.title ? '<p class="mp-ai-panel-title">' + escapeHtml(opts.title) + '</p>' : '')
        + '</div>'
        + '<div class="mp-ai-panel-body mp-ai-prose"></div>'
        + '<p class="mp-ai-error" role="alert" hidden></p>'
        + (note ? '<p class="mp-ai-panel-note">' + escapeHtml(note) + '</p>' : '')
        + '</section>';
      var panel = el.querySelector('.mp-ai-panel');
      var body = el.querySelector('.mp-ai-panel-body');
      var errorEl = el.querySelector('.mp-ai-error');
      var text = opts.text == null ? '' : String(opts.text);
      var streaming = opts.streaming !== false;

      function paint() {
        var html = markdown(text);
        if (streaming) { html = text ? withCaret(html) : thinkingHtml(); }
        body.innerHTML = html;
        panel.classList.toggle('is-streaming', streaming);
        panel.setAttribute('aria-busy', streaming ? 'true' : 'false');
      }

      var controller = {
        append: function (delta) {
          text += delta == null ? '' : String(delta);
          paint();
          return controller;
        },
        setText: function (value) {
          text = value == null ? '' : String(value);
          paint();
          return controller;
        },
        done: function (result) {
          var final = result && typeof result === 'object' ? result.text : result;
          if (typeof final === 'string' && final) { text = final; }
          streaming = false;
          paint();
          return controller;
        },
        error: function (err) {
          streaming = false;
          paint();
          errorEl.textContent = errorMessage(err, DEFAULT_ERROR);
          errorEl.hidden = false;
          return controller;
        },
        getText: function () { return text; },
      };
      paint();
      return controller;
    },

    /**
     * Renders a line diff with Apply / Reject buttons into el.
     * before/after may be strings or JSON-serialisable values (pretty-printed).
     * onApply / onReject receive { before, after, lines }; they may return a
     * promise — if it rejects, the buttons are re-enabled and the error shown.
     * opts: { before, after, onApply, onReject, title, applyLabel, rejectLabel }
     * Returns { lines, added, removed }.
     */
    renderDiff: function (el, opts) {
      opts = opts || {};
      var lines = diffLines(opts.before, opts.after);
      var added = lines.filter(function (l) { return l.type === 'add'; }).length;
      var removed = lines.filter(function (l) { return l.type === 'del'; }).length;
      var hasActions = typeof opts.onApply === 'function' || typeof opts.onReject === 'function';
      var title = opts.title || 'Suggested changes';

      el.innerHTML = '<div class="mp-ai-diff">'
        + '<div class="mp-ai-diff-header">' + badgeHtml(opts.label)
        + '<span class="mp-ai-diff-title">' + escapeHtml(title) + '</span>'
        + '<span class="mp-ai-diff-stats">'
        + '<span class="mp-ai-diff-stat-add">+' + added + '<span class="mp-ai-sr-only"> added</span></span>'
        + '<span class="mp-ai-diff-stat-del">−' + removed + '<span class="mp-ai-sr-only"> removed</span></span>'
        + '</span></div>'
        + '<pre class="mp-ai-diff-body" tabindex="0" aria-label="' + escapeHtml(title) + '"><code>'
        + (added || removed ? lines.map(diffLineHtml).join('') : '<span class="mp-ai-diff-line">No changes</span>')
        + '</code></pre>'
        + (hasActions
          ? '<div class="mp-ai-diff-actions">'
            + '<span class="mp-ai-diff-status" role="status"></span>'
            + '<button type="button" class="mp-ai-action" data-mp-ai-action="reject">'
            + escapeHtml(opts.rejectLabel || 'Reject') + '</button>'
            + '<button type="button" class="mp-ai-action mp-ai-action-primary" data-mp-ai-action="apply">'
            + escapeHtml(opts.applyLabel || 'Apply') + '</button>'
            + '</div>'
          : '')
        + '</div>';

      var result = { lines: lines, added: added, removed: removed };
      if (!hasActions) { return result; }

      var root = el.querySelector('.mp-ai-diff');
      var statusEl = el.querySelector('.mp-ai-diff-status');
      var applyBtn = el.querySelector('[data-mp-ai-action="apply"]');
      var rejectBtn = el.querySelector('[data-mp-ai-action="reject"]');
      var settled = false;
      var busy = false;

      function setDisabled(disabled) {
        applyBtn.disabled = disabled;
        rejectBtn.disabled = disabled;
      }

      bind(el, 'click', function (ev) {
        var btn = actionTarget(ev);
        if (!btn || settled || busy) { return; }
        var action = btn.getAttribute('data-mp-ai-action');
        if (action !== 'apply' && action !== 'reject') { return; }
        var cb = action === 'apply' ? opts.onApply : opts.onReject;
        busy = true;
        setDisabled(true);
        statusEl.textContent = '';
        Promise.resolve()
          .then(function () {
            return typeof cb === 'function'
              ? cb({ before: opts.before, after: opts.after, lines: lines })
              : undefined;
          })
          .then(function () {
            busy = false;
            settled = true;
            root.classList.add(action === 'apply' ? 'is-applied' : 'is-rejected');
            statusEl.textContent = action === 'apply' ? 'Applied' : 'Rejected';
          }, function (err) {
            busy = false;
            setDisabled(false);
            statusEl.textContent = errorMessage(err, 'Something went wrong');
          });
      });
      return result;
    },

    /**
     * Renders a chat (log + input) into el. Each message is sent with
     * MpKit.ai.ask({ prompt, context }) and streamed into the log; the context is
     * opts.context plus the recent conversation. Pass opts.onSend(prompt,
     * { onChunk, history }) to use another transport; it may resolve with a
     * string or { text }.
     * opts: { label = 'Assistant', context, placeholder, emptyText, onSend }
     * Returns { send(text?), clear(), messages() }.
     */
    renderChat: function (el, opts) {
      opts = opts || {};
      uid += 1;
      var inputId = 'mp-ai-chat-input-' + uid;
      el.innerHTML = '<div class="mp-ai-chat">'
        + '<div class="mp-ai-chat-header">' + badgeHtml(opts.label) + '</div>'
        + '<div class="mp-ai-chat-log" role="log" aria-live="polite" aria-label="'
        + escapeHtml(opts.label || 'Assistant') + ' conversation"></div>'
        + '<form class="mp-ai-chat-form">'
        + '<label class="mp-ai-sr-only" for="' + inputId + '">Message</label>'
        + '<textarea class="mp-ai-chat-input" id="' + inputId + '" rows="1" placeholder="'
        + escapeHtml(opts.placeholder || 'Ask the Assistant…') + '"></textarea>'
        + '<button type="submit" class="mp-ai-button">' + SPARKLE + '<span>Send</span></button>'
        + '</form></div>';

      var log = el.querySelector('.mp-ai-chat-log');
      var input = el.querySelector('.mp-ai-chat-input');
      var sendBtn = el.querySelector('.mp-ai-chat-form .mp-ai-button');
      var messages = [];
      var busy = false;

      function messageHtml(m) {
        if (m.role === 'user') {
          return '<div class="mp-ai-chat-msg is-user"><div class="mp-ai-chat-bubble">'
            + '<span class="mp-ai-sr-only">You: </span>'
            + escapeHtml(m.text).replace(/\n/g, '<br>') + '</div></div>';
        }
        var html = markdown(m.text);
        if (m.streaming) { html = m.text ? withCaret(html) : thinkingHtml(); }
        if (m.error) { html += '<p class="mp-ai-error" role="alert">' + escapeHtml(m.error) + '</p>'; }
        return '<div class="mp-ai-chat-msg is-assistant"><div class="mp-ai-chat-bubble mp-ai-prose">'
          + '<span class="mp-ai-sr-only">' + escapeHtml(opts.label || 'Assistant') + ': </span>'
          + html + '</div></div>';
      }

      function paint() {
        log.innerHTML = messages.length
          ? messages.map(messageHtml).join('')
          : '<p class="mp-ai-chat-empty">' + escapeHtml(opts.emptyText || 'Ask the Assistant a question.') + '</p>';
        log.setAttribute('aria-busy', busy ? 'true' : 'false');
        log.scrollTop = log.scrollHeight;
        sendBtn.disabled = busy;
        sendBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      }

      function defaultSend(prompt, ctx) {
        var transcript = ctx.history.slice(-10).map(function (m) {
          return (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.text;
        }).join('\n');
        var context = [opts.context, transcript ? 'Conversation so far:\n' + transcript : '']
          .filter(Boolean).join('\n\n');
        var body = { prompt: prompt };
        if (context) { body.context = context; }
        return ai.ask(body, { onChunk: ctx.onChunk });
      }

      function send(text) {
        var prompt = String(text == null ? input.value : text).trim();
        if (!prompt || busy) { return Promise.resolve(null); }
        if (text == null) { input.value = ''; }
        var history = messages.filter(function (m) { return !m.error; }).map(function (m) {
          return { role: m.role, text: m.text };
        });
        var reply = { role: 'assistant', text: '', streaming: true };
        messages.push({ role: 'user', text: prompt }, reply);
        busy = true;
        paint();
        var handler = typeof opts.onSend === 'function' ? opts.onSend : defaultSend;
        return Promise.resolve()
          .then(function () {
            return handler(prompt, {
              history: history,
              onChunk: function (delta) {
                reply.text += delta == null ? '' : String(delta);
                paint();
              },
            });
          })
          .then(function (res) {
            var final = res && typeof res === 'object' ? res.text : res;
            if (typeof final === 'string' && final) { reply.text = final; }
          }, function (err) {
            reply.error = errorMessage(err, DEFAULT_ERROR);
          })
          .then(function () {
            reply.streaming = false;
            busy = false;
            paint();
            return reply.error ? null : reply.text;
          });
      }

      bind(el, 'submit', function (ev) {
        ev.preventDefault();
        send();
      });
      bind(el, 'keydown', function (ev) {
        var t = ev.target;
        if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && t === input) {
          ev.preventDefault();
          send();
        }
      });
      paint();

      return {
        send: send,
        clear: function () {
          messages = [];
          paint();
        },
        messages: function () {
          return messages.map(function (m) {
            return { role: m.role, text: m.text, error: m.error };
          });
        },
      };
    },

    /**
     * Shows (default) or hides a fixed glow around the page edges, e.g. while
     * the Assistant works. Returns the element.
     */
    edgeGlow: function (show) {
      if (show === false) {
        if (edgeEl) { edgeEl.hidden = true; }
        return edgeEl;
      }
      if (!edgeEl) {
        edgeEl = document.createElement('div');
        edgeEl.className = 'mp-ai-edge-glow';
        edgeEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(edgeEl);
      }
      edgeEl.hidden = false;
      return edgeEl;
    },

  };

  MpKit.ai = ai;

  global.MpKit = MpKit;

})(typeof window !== 'undefined' ? window : globalThis);
