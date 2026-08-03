import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Firefox target, Manifest V3 (Firefox requires MV3 for new extensions).
  manifestVersion: 3,
  manifest: {
    name: 'Text Polisher',
    description:
      'Passively transforms user-generated English text into natural, native-sounding language.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['*://*/*'],
    action: {
      default_title: 'Polish this page',
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
