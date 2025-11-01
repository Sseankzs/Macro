// Centralized app configuration flags
// Toggle DB bypass for application listings
// Set via environment: VITE_BYPASS_DB_APPS=true|false
export const BYPASS_DB_APPS: boolean = (import.meta as any).env?.VITE_BYPASS_DB_APPS === 'true';
// Feature flag to enable task encryption prototype
export const E2EE_TASKS: boolean = (import.meta as any).env?.VITE_E2EE_TASKS === 'true';
// Temporary bypass for login page (until profile login is fixed on DB side)
// Set via environment: VITE_BYPASS_LOGIN=true|false
export const BYPASS_LOGIN: boolean = (import.meta as any).env?.VITE_BYPASS_LOGIN === 'true';
