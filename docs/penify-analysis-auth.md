# Authentication Type Configuration Analysis

## Overview

This document explains how `settings.merged.security.auth.selectedType` is
determined and which environment variables and configuration files control
whether the system uses `AuthType.USE_VERTEX_AI` instead of
`AuthType.LOGIN_WITH_GOOGLE`.

## AuthType Enum Values

Located in: `packages/core/src/core/contentGenerator.ts:50-56`

```typescript
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
}
```

## Configuration Files and Their Precedence

The settings system loads from multiple sources with a specific precedence
order:

### 1. Settings File Locations

| Scope                  | File Path                                                                                                                                                                          | Description                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Schema Defaults**    | Built-in code                                                                                                                                                                      | Hardcoded defaults in `settingsSchema.ts`          |
| **System Defaults**    | macOS: `/Library/Application Support/GeminiCli/system-defaults.json`<br>Windows: `C:\ProgramData\gemini-cli\system-defaults.json`<br>Linux: `/etc/gemini-cli/system-defaults.json` | Enterprise/system-level default settings           |
| **User Settings**      | `~/.gemini/settings.json`                                                                                                                                                          | User-specific settings (highest personal priority) |
| **Workspace Settings** | `<workspace>/.gemini/settings.json`                                                                                                                                                | Project/workspace-specific settings                |
| **System Settings**    | macOS: `/Library/Application Support/GeminiCli/settings.json`<br>Windows: `C:\ProgramData\gemini-cli\settings.json`<br>Linux: `/etc/gemini-cli/settings.json`                      | Enterprise/system-level override settings          |

**Important**: File path can be overridden by:

- `GEMINI_CLI_SYSTEM_SETTINGS_PATH` (for system settings)
- `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` (for system defaults)

### 2. Settings Merge Precedence

Located in: `packages/cli/src/config/settings.ts:215-240`

The merge order is (last one wins for single values):

1. Schema Defaults (Built-in)
2. System Defaults
3. User Settings
4. Workspace Settings
5. System Settings (as overrides)

## Current Configuration in Your Environment

### User Settings File

**Location**: `~/.gemini/settings.json`

```json
{
  "ide": {
    "hasSeenNudge": true
  },
  "admin": {
    "mcp": {
      "enabled": false
    }
  },
  "security": {
    "auth": {
      "selectedType": "oauth-personal"
    }
  }
}
```

**Value**: `"selectedType": "oauth-personal"` → This is
`AuthType.LOGIN_WITH_GOOGLE`

### Environment Variables

Currently set environment variables affecting authentication:

```bash
GEMINI_CLI_CUSTOM_HEADERS=X-Trace-Id: gateway-test, x-portkey-virtual-key: ank_...
GEMINI_CLI_VERTEX_BASE_URL=https://tunnel.penify.info
GEMINI_DEFAULT_AUTH_TYPE=vertex-ai    # ← This sets the default!
GEMINI_MODEL=vertex-ai/gemini-3-flash-preview
GOOGLE_API_KEY=ank_3e92acfe4f4cc0f6943d1c4a8d6bf239001651dbfa90a6e31dfa0e1430f21c1c
GOOGLE_CLOUD_LOCATION=global
GOOGLE_CLOUD_PROJECT=penify-prod
```

## How Auth Type is Determined

### Loading Flow

1. **Initial Load** (`packages/cli/src/gemini.tsx:296`)

   ```typescript
   const settings = loadSettings();
   ```

2. **Auth Type Selection** (`packages/cli/src/core/initializer.ts:40-43`)

   ```typescript
   const authError = await performInitialAuth(
     config,
     settings.merged.security?.auth?.selectedType, // ← Read from merged settings
   );
   ```

3. **Merged Settings** (`packages/cli/src/config/settings.ts:274-299`)
   - The `merged` property is computed from all settings sources
   - Path: `settings.merged.security.auth.selectedType`

### Key Environment Variables That Control Auth Type

#### 1. `GEMINI_DEFAULT_AUTH_TYPE` (Primary Control)

**Location**: `packages/cli/src/ui/auth/AuthDialog.tsx:86-92`

```typescript
let defaultAuthType = null;
const defaultAuthTypeEnv = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
if (
  defaultAuthTypeEnv &&
  Object.values(AuthType).includes(defaultAuthTypeEnv as AuthType)
) {
  defaultAuthType = defaultAuthTypeEnv as AuthType;
}
```

**Usage in Auth Selection** (`packages/cli/src/ui/auth/AuthDialog.tsx:94-108`):

```typescript
let initialAuthIndex = items.findIndex((item) => {
  if (settings.merged.security?.auth?.selectedType) {
    return item.value === settings.merged.security.auth.selectedType; // Priority 1
  }

  if (defaultAuthType) {
    return item.value === defaultAuthType; // Priority 2 - from GEMINI_DEFAULT_AUTH_TYPE
  }

  if (process.env['GEMINI_API_KEY']) {
    return item.value === AuthType.USE_GEMINI; // Priority 3
  }

  return item.value === AuthType.LOGIN_WITH_GOOGLE; // Default fallback
});
```

**Valid values**:

- `"oauth-personal"` → `AuthType.LOGIN_WITH_GOOGLE`
- `"gemini-api-key"` → `AuthType.USE_GEMINI`
- `"vertex-ai"` → `AuthType.USE_VERTEX_AI`
- `"cloud-shell"` → `AuthType.LEGACY_CLOUD_SHELL`
- `"compute-default-credentials"` → `AuthType.COMPUTE_ADC`

#### 2. Vertex AI Specific Variables

**Location**: `packages/cli/src/config/auth.ts:29-42`

For `AuthType.USE_VERTEX_AI` to work, you need either:

**Option A**: Project + Location

```bash
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=<location>
```

**Option B**: Google API Key

```bash
GOOGLE_API_KEY=<api-key>
```

**Validation code**:

```typescript
if (authMethod === AuthType.USE_VERTEX_AI) {
  const hasVertexProjectLocationConfig =
    !!process.env['GOOGLE_CLOUD_PROJECT'] &&
    !!process.env['GOOGLE_CLOUD_LOCATION'];
  const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
  if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
    return (
      'When using Vertex AI, you must specify either:\n' +
      '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
      '• GOOGLE_API_KEY environment variable (if using express mode).\n'
    );
  }
}
```

#### 3. Base URL Override

**Location**: `packages/core/src/utils/baseUrlUtils.ts:40-58`

```typescript
const vertexCliBaseUrl =
  process.env['GEMINI_CLI_VERTEX_BASE_URL'] ??
  process.env['GEMINI_CLI_GATEWAY_URL'] ??
  process.env['GOOGLE_VERTEX_BASE_URL'];
```

**Priority**:

1. `GEMINI_CLI_VERTEX_BASE_URL`
2. `GEMINI_CLI_GATEWAY_URL`
3. `GOOGLE_VERTEX_BASE_URL`

## How to Set Auth Type to `vertex-ai`

### Method 1: Environment Variable (Recommended for Default)

Set the default auth type:

```bash
export GEMINI_DEFAULT_AUTH_TYPE="vertex-ai"
```

This will make Vertex AI the default selection in the auth dialog, but users can
still change it.

### Method 2: User Settings File (Persistent)

Edit `~/.gemini/settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "vertex-ai"
    }
  }
}
```

### Method 3: Workspace Settings (Project-Specific)

Edit `<workspace>/.gemini/settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "vertex-ai"
    }
  }
}
```

### Method 4: System Settings (Enterprise/Admin Override)

Edit `/Library/Application Support/GeminiCli/settings.json` (macOS):

```json
{
  "security": {
    "auth": {
      "selectedType": "vertex-ai",
      "enforcedType": "vertex-ai" // Optional: Force this auth type
    }
  }
}
```

### Method 5: Environment File (.env)

Located in: `packages/cli/src/config/settings.ts:351-442`

The system loads `.env` files from:

1. `<workspace>/.gemini/.env` (highest priority for gemini-specific)
2. `<workspace>/.env`
3. `~/.gemini/.env` (fallback)
4. `~/.env` (fallback)

Create `.env` file:

```bash
GEMINI_DEFAULT_AUTH_TYPE=vertex-ai
GOOGLE_CLOUD_PROJECT=penify-prod
GOOGLE_CLOUD_LOCATION=global
GOOGLE_API_KEY=your-api-key-here
```

## Complete Vertex AI Configuration

To use Vertex AI authentication, you need:

### Required Environment Variables

```bash
# Auth type selection
export GEMINI_DEFAULT_AUTH_TYPE="vertex-ai"

# Vertex AI credentials (Option A - Project based)
export GOOGLE_CLOUD_PROJECT="penify-prod"
export GOOGLE_CLOUD_LOCATION="global"

# OR (Option B - API Key based)
export GOOGLE_API_KEY="your-api-key"

# Optional: Custom Vertex AI endpoint
export GEMINI_CLI_VERTEX_BASE_URL="https://tunnel.penify.info"
```

### Settings File Configuration

`~/.gemini/settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "vertex-ai"
    }
  }
}
```

## Debugging Auth Configuration

### Check Current Auth Type

Located in: `packages/cli/src/gemini.tsx:509`

```typescript
const authType = settings.merged.security?.auth?.selectedType;
```

### Validation Points

1. **Settings Validation** (`packages/cli/src/config/settings.ts:499-511`)
   - Validates settings structure with Zod
   - Reports errors to `settings.errors`

2. **Auth Method Validation** (`packages/cli/src/config/auth.ts:10-46`)
   - Validates auth method has required environment variables
   - Called before authentication

3. **Auth Dialog Validation** (`packages/cli/src/ui/auth/useAuth.ts:109-119`)
   - Validates `GEMINI_DEFAULT_AUTH_TYPE` is valid
   - Shows error if invalid

### Common Issues

1. **"Invalid value for GEMINI_DEFAULT_AUTH_TYPE"**
   - The environment variable has an invalid value
   - Valid values: `oauth-personal`, `gemini-api-key`, `vertex-ai`,
     `cloud-shell`, `compute-default-credentials`

2. **"When using Vertex AI, you must specify..."**
   - Missing `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`
   - OR missing `GOOGLE_API_KEY`

3. **Auth type not persisting**
   - Check which settings file has the highest precedence
   - System settings override workspace and user settings

## File References

| File                                         | Purpose                                  |
| -------------------------------------------- | ---------------------------------------- |
| `packages/cli/src/config/settings.ts`        | Settings loading and merging logic       |
| `packages/cli/src/config/settingsSchema.ts`  | Settings schema and defaults (line 1256) |
| `packages/cli/src/config/auth.ts`            | Auth validation logic                    |
| `packages/cli/src/ui/auth/AuthDialog.tsx`    | Auth selection UI                        |
| `packages/cli/src/ui/auth/useAuth.ts`        | Auth state management                    |
| `packages/cli/src/core/initializer.ts`       | Initial auth setup                       |
| `packages/core/src/core/contentGenerator.ts` | AuthType enum and config creation        |
| `packages/core/src/utils/baseUrlUtils.ts`    | Base URL overrides for Vertex AI         |

## Summary

To make `settings.merged.security.auth.selectedType` equal to
`AuthType.USE_VERTEX_AI`:

1. **Set environment variable** (temporary, affects default selection):

   ```bash
   export GEMINI_DEFAULT_AUTH_TYPE="vertex-ai"
   ```

2. **OR edit user settings** (persistent):

   ```bash
   echo '{
     "security": {
       "auth": {
         "selectedType": "vertex-ai"
       }
     }
   }' > ~/.gemini/settings.json
   ```

3. **AND provide required credentials**:
   ```bash
   export GOOGLE_CLOUD_PROJECT="penify-prod"
   export GOOGLE_CLOUD_LOCATION="global"
   export GOOGLE_API_KEY="your-api-key"
   ```

The settings merge in this order: Schema Defaults → System Defaults → User
Settings → Workspace Settings → System Settings (override).
