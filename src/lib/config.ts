/**
 * La app trabaja 100 % en el dispositivo: no hay cuenta ni sincronización. El código de
 * Supabase (login, sync.ts, SQL) se conserva para respaldo en la nube más adelante; con
 * este interruptor apagado, las escrituras no dejan nada en el outbox y nada llama a la red.
 */
export const CLOUD_SYNC = false;

// Claves de la tabla `kv` de IndexedDB.
export const LOGO_KEY = "logo-blob";
export const NEXT_NUMBER_KEY = "nextBudgetNumber";
export const LAST_BACKUP_KEY = "lastBackupAt";
export const BACKUP_REMINDER_DISMISSED_KEY = "backupReminderDismissedAt";

/** Marca que se guarda en professionals.logo_url cuando el logo está en IndexedDB. */
export const LOCAL_LOGO_MARK = "local:logo";
