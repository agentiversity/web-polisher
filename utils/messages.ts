/**
 * Runtime message contracts between the background service worker, the content
 * script, and the action popup. Keeping the union in one place avoids the
 * `as never` casts and keeps the messaging surface type-safe.
 */

import type { TransformResult } from './llmClient';

export interface PingMessage {
  type: 'ping';
  payload?: unknown;
}

export interface PingResponse {
  ok: true;
  echo: unknown;
  from: 'background';
}

export interface PolisherStatusMessage {
  type: 'polisher-status';
  status: 'idle' | 'running' | 'paused' | 'done';
}

export interface TransformTextMessage {
  type: 'transform-text';
  texts: string[];
}

export interface TransformTextReply {
  type: 'transform-text-result';
  results: TransformResult[];
  notConfigured: boolean;
}

export interface SetTestKeyMessage {
  type: 'set-test-key';
  key: string;
  config?: unknown;
}

export interface SetTestKeyResponse {
  ok: boolean;
}

export interface ApplyPolishMessage {
  type: 'apply-polish';
}

export interface ApplyPolishResponse {
  ok: boolean;
  replaced?: number;
  blocks?: number;
  pending?: number;
  notConfigured?: boolean;
  state?: 'idle' | 'running' | 'paused' | 'done';
}

export type BackgroundMessage =
  | PingMessage
  | PolisherStatusMessage
  | TransformTextMessage
  | SetTestKeyMessage;

export type ContentMessage = ApplyPolishMessage;

export function isPingMessage(msg: unknown): msg is PingMessage {
  return isObject(msg) && msg.type === 'ping';
}

export function isPolisherStatusMessage(msg: unknown): msg is PolisherStatusMessage {
  return isObject(msg) && msg.type === 'polisher-status' && typeof msg.status === 'string';
}

export function isTransformTextMessage(msg: unknown): msg is TransformTextMessage {
  return isObject(msg) && msg.type === 'transform-text' && Array.isArray(msg.texts);
}

export function isSetTestKeyMessage(msg: unknown): msg is SetTestKeyMessage {
  return isObject(msg) && msg.type === 'set-test-key' && typeof msg.key === 'string';
}

export function isApplyPolishMessage(msg: unknown): msg is ApplyPolishMessage {
  return isObject(msg) && msg.type === 'apply-polish';
}

function isObject(msg: unknown): msg is Record<string, unknown> {
  return msg !== null && typeof msg === 'object';
}
