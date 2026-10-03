/* @mp-consulting/homebridge-ui-kit v1.1.0
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

  global.MpKit = MpKit;

})(typeof window !== 'undefined' ? window : globalThis);
