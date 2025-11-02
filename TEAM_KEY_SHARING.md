# Sharing Task Encryption Key with Teammates

## Quick Summary

The task encryption key is stored in **two places**:

1. **LocalStorage** (local device): `e2ee:teamkey:${teamId}` - This is automatically synced when you enter the passphrase
2. **Database** (Supabase `team_keys` table): The wrapped key encrypted with a passphrase

## For Your Teammate (Copy-Paste This)

### Option 1: Share the Passphrase (Recommended)

**You need to share:**
1. The **team passphrase** (the password you created when setting up encryption)
2. The **team_id** (usually `default-team` or your team's ID)

**Steps for your teammate:**
1. Open the app and go to the Tasks page
2. When they see the prompt "Enter team passphrase to decrypt tasks", enter the shared passphrase
3. The app will automatically:
   - Fetch the wrapped key from the database
   - Unwrap it using the passphrase
   - Save it locally in localStorage
   - Decrypt all tasks

### Option 2: Direct Database Query (If you want to check)

**In Supabase SQL Editor, run:**
```sql
SELECT 
  team_id,
  key_id,
  wrapped_key_b64,
  kdf_salt_b64,
  kdf_iters,
  wrap_iv_b64,
  created_at
FROM team_keys
WHERE team_id = 'default-team'  -- or your actual team_id
ORDER BY created_at DESC
LIMIT 1;
```

This shows the encrypted key record. Your teammate still needs the passphrase to decrypt it.

### Option 3: Share LocalStorage Key (Not Recommended - Device Specific)

**Only works on the same browser/device:**
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. Find key: `e2ee:teamkey:default-team` (or your team_id)
4. Copy the base64 value
5. Teammate pastes it into their localStorage

⚠️ **Warning**: This is device-specific and won't work if they're on a different machine. Use Option 1 instead.

## What Gets Shared?

- ✅ **Share**: The team passphrase (one-time setup password)
- ✅ **Share**: The team_id (usually `default-team`)
- ❌ **Don't share**: The actual encryption key (it's encrypted in the database anyway)
- ❌ **Don't share**: LocalStorage values (device-specific)

## Database Setup (If Not Already Done)

Make sure the `team_keys` table exists in Supabase:

```sql
CREATE TABLE IF NOT EXISTS team_keys (
  team_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  wrapped_key_b64 TEXT NOT NULL,
  kdf_salt_b64 TEXT,
  kdf_iters INT,
  wrap_iv_b64 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, key_id)
);

ALTER TABLE team_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read team key" ON team_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id::text = auth.uid()::text
        AND u.team_id = team_keys.team_id
    )
  );

CREATE POLICY "Team members can upsert team key" ON team_keys
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id::text = auth.uid()::text
        AND u.team_id = team_keys.team_id
    )
  );
```

## Quick Copy-Paste for Teammate

```
Hey! To access encrypted tasks, you need the team passphrase.

1. Open the app → Tasks page
2. When prompted "Enter team passphrase to decrypt tasks", enter: [SHARE THE PASSPHRASE HERE]
3. The app will sync the encryption key automatically

Team ID: default-team (or [YOUR_TEAM_ID])

That's it! Once you enter it once, it saves locally.
```

