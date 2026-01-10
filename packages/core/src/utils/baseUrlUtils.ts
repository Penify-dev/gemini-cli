/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const LOCALHOST_REGEX = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i;

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (SCHEME_REGEX.test(trimmed)) {
    return trimmed;
  }
  const scheme = LOCALHOST_REGEX.test(trimmed) ? 'http' : 'https';
  return `${scheme}://${trimmed}`;
}

function sanitizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized ? normalized : undefined;
}

export function resolveGeminiBaseUrl(): string | undefined {
  return sanitizeBaseUrl(
    process.env['GEMINI_CLI_GEMINI_BASE_URL'] ??
      process.env['GEMINI_CLI_GATEWAY_URL'] ??
      process.env['GOOGLE_GEMINI_BASE_URL'],
  );
}

export function resolveVertexBaseUrl(): string | undefined {
  return sanitizeBaseUrl(
    process.env['GEMINI_CLI_VERTEX_BASE_URL'] ??
      process.env['GEMINI_CLI_GATEWAY_URL'] ??
      process.env['GOOGLE_VERTEX_BASE_URL'],
  );
}

export function applyCliBaseUrlOverrides(vertexai?: boolean): void {
  const geminiCliBaseUrl = sanitizeBaseUrl(
    process.env['GEMINI_CLI_GEMINI_BASE_URL'] ??
      process.env['GEMINI_CLI_GATEWAY_URL'],
  );
  const vertexCliBaseUrl = sanitizeBaseUrl(
    process.env['GEMINI_CLI_VERTEX_BASE_URL'] ??
      process.env['GEMINI_CLI_GATEWAY_URL'],
  );

  if (vertexai) {
    if (vertexCliBaseUrl) {
      process.env['GOOGLE_VERTEX_BASE_URL'] = vertexCliBaseUrl;
    }
  } else if (geminiCliBaseUrl) {
    process.env['GOOGLE_GEMINI_BASE_URL'] = geminiCliBaseUrl;
  }
}
