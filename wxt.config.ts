import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Firefox target, Manifest V3 (Firefox requires MV3 for new extensions).
  manifestVersion: 3,
  manifest: {
    name: 'Text Polisher',
    description:
      'On demand, rewrites user-generated English text into natural, native-sounding language.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['*://*/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Polish this page',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    // Reachable in Firefox via about:addons → the add-on's Preferences button.
    options_ui: {
      open_in_tab: true,
    },
    browser_specific_settings: {
      gecko: {
        id: 'text-polisher@example.com',
        strict_min_version: '113.0',
      },
    },
  },
});
