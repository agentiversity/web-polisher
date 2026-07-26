# Technology Stack

**Project:** Text Polisher Extension (Firefox)
**Researched:** 2026-07-26

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Firefox WebExtensions | MV3 | Browser extension platform | Firefox standard. MV3 required for new extensions (MV2 deprecated). Native `browser.*` API, no polyfill needed for Firefox-only. |
| WXT | 0.20.27 | Extension build framework | Vite-based, file-based entrypoints, auto-generates manifest, HMR for UI dev, built-in Firefox support (`wxt -b firefox`). MIT license. Active development. Beats Plasmo (simpler, no licensing concerns) and raw Vite config (too much boilerplate). |
| TypeScript | 5.x | Language | Type safety for complex DOM manipulation and LLM API calls. WXT includes TS by default. |

### LLM Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Gemini API (Flash) | Latest | Cloud LLM for text polishing | Cheapest viable option. Gemini 2.0 Flash: $0.075/1M input tokens, $0.30/1M output tokens. Fast (<2s latency). Free tier: 15 RPM, 1M tokens/day. Meets "small/cheap LLM" requirement. |
| WebLLM | 0.2.84 | Local LLM inference | WebGPU-based in-browser inference. Supports Gemma, Llama, Phi, Mistral. OpenAI-compatible API. Runs in Web Worker to avoid blocking UI. Firefox supports WebGPU (enabled by default since Firefox 113). |
| `@google/generative-ai` | 0.21.x | Gemini SDK | Official Google SDK. Simpler than raw fetch. Handles streaming, retries, error parsing. |

### DOM Manipulation & Content Detection
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native DOM APIs | — | Content script DOM manipulation | `document.querySelector`, `MutationObserver`, `IntersectionObserver`. No library needed. Extensions have full DOM access in content scripts. |
| `webextension-polyfill` | 0.12.x | Cross-browser API (optional) | Only if targeting Chrome later. Firefox-only = skip it, use native `browser.*`. |

### Build & Dev Tools
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | 6.x | Bundler | WXT uses Vite under the hood. Fast HMR, tree-shaking, handles TS/CSS/assets. |
| web-ext | 7.x | Firefox extension CLI | Official Mozilla tool. `web-ext run` launches Firefox with extension loaded. `web-ext build` packages .xpi. `web-ext lint` validates manifest. |
| pnpm | 9.x | Package manager | Faster than npm, strict dependency resolution, disk-efficient. WXT docs use pnpm. |

### Storage & State
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `browser.storage.local` | — | Extension storage | Native Firefox API. Persists settings, API keys, cached transformations. 5MB limit (sufficient for this use case). |
| `@wxt-dev/storage` | 1.2.8 | Typed storage wrapper | WXT's storage utility. Type-safe wrapper around `browser.storage`. Simplifies get/set operations. |

### UI (Options Page / Popup)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla HTML/CSS/JS | — | Options page UI | Minimal UI needed (API key input, enable/disable toggle). No framework required. Keeps bundle small. |
| React (optional) | 18.x | Complex UI (if needed) | Only if building rich settings UI or dashboard. WXT supports React via Vite plugin. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Extension Framework | WXT | Plasmo | Plasmo more complex, commercial licensing, overkill for this scope. WXT simpler, MIT, better DX. |
| Extension Framework | WXT | Raw Vite + manual config | Too much boilerplate. Must manually configure manifest, entrypoints, HMR. WXT automates this. |
| Cloud LLM | Gemini Flash | OpenAI GPT-4o-mini | More expensive ($0.15/1M input, $0.60/1M output). Slower. Gemini Flash cheaper and faster for text transformation. |
| Cloud LLM | Gemini Flash | Anthropic Claude Haiku | More expensive ($0.25/1M input, $1.25/1M output). Overkill for text polishing. |
| Local LLM | WebLLM | Ollama (local server) | Requires separate server process. WebLLM runs in-browser, no setup. Ollama better for desktop apps, not extensions. |
| Local LLM | WebLLM | TensorFlow.js | Not optimized for LLMs. WebLLM purpose-built for LLM inference. |
| Package Manager | pnpm | npm | Slower, less strict. pnpm preferred for monorepos and CI. |
| Build Tool | Vite (via WXT) | Webpack | Slower, more config. Vite standard for new projects. Webpack legacy. |

## Installation

```bash
# Create project with WXT
pnpm dlx wxt@latest init
# Select: Vanilla template, TypeScript

# Install dependencies
pnpm add @google/generative-ai
pnpm add -D @types/firefox-webext-browser

# Optional: React for UI
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom @vitejs/plugin-react

# Optional: Local LLM
pnpm add @mlc-ai/web-llm
```

## Manifest Configuration

```json
{
  "manifest_version": 3,
  "name": "Text Polisher",
  "version": "1.0.0",
  "description": "Automatically polishes English text in user-generated content",
  "browser_specific_settings": {
    "gecko": {
      "id": "text-polisher@example.com",
      "strict_min_version": "113.0"
    }
  },
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "*://*.facebook.com/*",
    "*://*.reddit.com/*",
    "*://*/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  }
}
```

## Key Architecture Decisions

### Why WXT over Plasmo?
- **Simpler**: File-based entrypoints, no complex routing
- **MIT license**: No commercial restrictions
- **Firefox-first**: Better Firefox support, less Chrome-centric
- **Smaller bundle**: Less overhead for simple extensions

### Why Gemini Flash over GPT-4o-mini?
- **Cheaper**: 2x cheaper input, 2x cheaper output
- **Faster**: Sub-2s latency vs 3-5s for GPT-4o-mini
- **Free tier**: 15 RPM free, sufficient for MVP validation
- **Quality**: Comparable for text transformation tasks

### Why WebLLM over Ollama?
- **No setup**: Runs in browser, no separate server
- **Portable**: Works on any device with WebGPU
- **Privacy**: Models stay in browser, no network calls
- **Extension-friendly**: Designed for browser environments

### Why Native DOM APIs over libraries?
- **Zero overhead**: No dependencies to bundle
- **Full control**: Extensions have unrestricted DOM access
- **Performance**: Direct DOM manipulation faster than abstraction layers
- **Simplicity**: Content scripts are isolated, no conflicts with page scripts

## Sources

- Mozilla Extension Workshop: https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
- MDN WebExtensions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- WXT Documentation: https://wxt.dev/
- WebLLM Documentation: https://webllm.mlc.ai/docs/
- Gemini API Pricing: https://ai.google.dev/pricing (verified 2026-07-26)
- Firefox WebGPU Support: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

## Confidence Assessment

| Technology | Confidence | Reason |
|------------|------------|---------|
| Firefox MV3 | HIGH | Official Mozilla docs, current standard |
| WXT 0.20.27 | HIGH | Latest version verified, active development |
| Gemini Flash | HIGH | Official pricing, meets cost/latency requirements |
| WebLLM 0.2.84 | HIGH | Latest version, WebGPU support verified |
| Vite 6.x | HIGH | Standard build tool, WXT dependency |
| TypeScript 5.x | HIGH | Industry standard, WXT default |
| pnpm 9.x | MEDIUM | Recommended but not required; npm works too |

## Version Currency Check

All versions verified current as of 2026-07-26:
- WXT: 0.20.27 (latest release)
- WebLLM: 0.2.84 (latest release)
- Firefox: MV3 required for new extensions (MV2 deprecated 2024)
- Gemini API: Flash models current, pricing verified
- Vite: 6.x current major version
- TypeScript: 5.x current major version
