/**
 * Injected stylesheet for the content-script overlay: the progress HUD, the
 * error toast, the rewritten-text highlight + confidence badge, and the
 * "pending" scan animation.
 *
 * Theme-aware via light-dark(): our own elements opt into `color-scheme`, so
 * highlights adapt to the page's preferred theme instead of clashing with dark
 * sites. Each light-dark() line is preceded by a plain fallback for browsers
 * that don't support the function yet (manifest floor is Firefox 113).
 */
import { PENDING_CLASS } from './polish';

export const OVERLAY_CSS = `
#text-polisher-hud{
  position:fixed;right:16px;bottom:16px;z-index:2147483647;
  display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;
  font:600 13px/1.4 system-ui,-apple-system,sans-serif;
  color-scheme:light dark;
  background:rgba(30,30,30,.88);
  background:light-dark(rgba(30,30,30,.88),rgba(240,240,246,.92));
  color:#fff;color:light-dark(#fff,#1c1c1e);
  box-shadow:0 6px 24px rgba(0,0,0,.25)}
#text-polisher-hud button{
  border:none;background:transparent;cursor:pointer;padding:0;
  font:inherit;color:#fff;color:light-dark(#fff,#1c1c1e)}
#text-polisher-hud .hud-undo{font-weight:700;text-decoration:underline}
#text-polisher-hud .hud-close{opacity:.7}
#text-polisher-toast{
  position:fixed;right:16px;bottom:64px;z-index:2147483647;
  max-width:320px;padding:10px 14px;border-radius:10px;
  font:600 13px/1.4 system-ui,-apple-system,sans-serif;
  color-scheme:light dark;
  background:rgba(30,30,30,.88);
  background:light-dark(rgba(30,30,30,.88),rgba(240,240,246,.92));
  color:#fff;color:light-dark(#fff,#1c1c1e);
  box-shadow:0 6px 24px rgba(0,0,0,.25);
  opacity:0;transition:opacity .15s ease;pointer-events:none}
#text-polisher-toast.show{opacity:1}
.text-polished{
  color-scheme:light dark;
  background-color:#cfe4f7;background-color:light-dark(#cfe4f7,#33475c);
  border-radius:2px!important}
.text-polished[data-confidence]:not([data-confidence=""])::after{
  content:attr(data-confidence);margin-left:5px;padding:1px 5px;border-radius:4px;
  font:600 10px/1.4 system-ui,-apple-system,sans-serif;
  color:#0b57d0;color:light-dark(#0b57d0,#9cc3ff);
  background:rgba(11,87,208,.15);background:light-dark(rgba(11,87,208,.15),rgba(156,195,255,.18))}
.${PENDING_CLASS}{
  color-scheme:light dark;
  background-color:#e7e7ec;background-color:light-dark(#e7e7ec,#2a2a2f)!important;
  background-image:repeating-linear-gradient(135deg,transparent 0 10px,#f6f6f8 10px 20px,transparent 20px 30px,#f6f6f8 30px 40px)!important;
  background-image:light-dark(
    repeating-linear-gradient(135deg,transparent 0 10px,#f6f6f8 10px 20px,transparent 20px 30px,#f6f6f8 30px 40px),
    repeating-linear-gradient(135deg,transparent 0 10px,#38383f 10px 20px,transparent 20px 30px,#38383f 30px 40px))!important;
  animation:tp-scan 2.5s linear infinite!important}
@keyframes tp-scan{from{background-position:0 0}to{background-position:56.5685px 0}}
`;
