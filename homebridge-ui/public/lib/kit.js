/* @mp-consulting/homebridge-ui-kit v1.0.0
   Brand design system for Homebridge plugins
   https://github.com/mp-consulting/homebridge-ui-kit */

(function (global) {
  'use strict';

  var MpKit = {

    /**
     * StatusBadge — returns inline HTML for device status badges.
     *
     * MpKit.StatusBadge.online()    → green dot + "Online"
     * MpKit.StatusBadge.offline()   → red dot + "Offline"
     * MpKit.StatusBadge.checking()  → animated dot + "Checking..."
     * MpKit.StatusBadge.disabled()  → grey badge + "Disabled"
     */
    StatusBadge: {
      online: function (label) {
        label = label || 'Online';
        return '<span class="badge bg-success-subtle text-success">'
          + '<span class="mp-status mp-status-online me-1"></span>'
          + label + '</span>';
      },
      offline: function (label) {
        label = label || 'Offline';
        return '<span class="badge bg-danger-subtle text-danger">'
          + '<span class="mp-status mp-status-offline me-1"></span>'
          + label + '</span>';
      },
      checking: function (label) {
        label = label || 'Checking...';
        return '<span class="badge bg-secondary-subtle text-secondary">'
          + '<span class="mp-status mp-status-checking me-1"></span>'
          + label + '</span>';
      },
      disabled: function (label) {
        label = label || 'Disabled';
        return '<span class="badge bg-secondary">' + label + '</span>';
      },
    },

    /**
     * EmptyState — returns HTML for an empty list placeholder.
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
          + '<i class="' + icon + ' mp-empty-state-icon"></i>'
          + '<p class="mp-empty-state-title">' + title + '</p>'
          + (hint ? '<p class="mp-empty-state-hint">' + hint + '</p>' : '')
          + '</div>';
      },
    },

    /**
     * Loading — returns HTML for a centred loading spinner with message.
     *
     * MpKit.Loading.render('Loading device information...')
     */
    Loading: {
      render: function (message) {
        message = message || 'Loading...';
        return '<div class="mp-loading">'
          + '<div class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></div>'
          + '<span>' + message + '</span>'
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
          v.classList.remove('active');
        });
        var el = document.getElementById(id);
        if (el) { el.classList.add('active'); }
      },
    },

    /**
     * Footer — renders support links into a .mp-footer element.
     *
     * MpKit.Footer.render({
     *   github: 'https://github.com/mp-consulting/homebridge-...',
     *   npm: 'https://www.npmjs.com/package/@mp-consulting/...',
     *   changelog: 'https://github.com/.../blob/main/CHANGELOG.md',
     * })
     */
    Footer: {
      render: function (opts) {
        opts = opts || {};
        var target = opts.target || '.mp-footer';
        var el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) { return; }
        var links = [];
        if (opts.github) {
          links.push('<a href="' + opts.github + '" target="_blank" rel="noopener">'
            + '<i class="bi bi-github"></i>GitHub</a>');
        }
        if (opts.npm) {
          links.push('<a href="' + opts.npm + '" target="_blank" rel="noopener">'
            + '<i class="bi bi-box-seam"></i>npm</a>');
        }
        if (opts.changelog) {
          links.push('<a href="' + opts.changelog + '" target="_blank" rel="noopener">'
            + '<i class="bi bi-clock-history"></i>Changelog</a>');
        }
        el.innerHTML = links.join('<span class="mp-footer-sep">|</span>');
      },
    },

  };

  global.MpKit = MpKit;

})(window);
