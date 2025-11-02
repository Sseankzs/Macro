// Centralized app configuration flags
// Toggle DB bypass for application listings
// Set via environment: VITE_BYPASS_DB_APPS=true|false
export const BYPASS_DB_APPS: boolean = (import.meta as any).env?.VITE_BYPASS_DB_APPS === 'true';
// Feature flag to enable task encryption prototype
export const E2EE_TASKS: boolean = (import.meta as any).env?.VITE_E2EE_TASKS === 'true';
// Temporary bypass for login page (easy to remove)
// - Enable via env: VITE_BYPASS_LOGIN=true
// - Disabled by default to require explicit login
const __env = (import.meta as any).env || {};
export const BYPASS_LOGIN: boolean = __env.VITE_BYPASS_LOGIN === 'true';
