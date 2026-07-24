# Foreground Supabase Recovery (July 22, 2026)

## Symptom

After an installed PWA returned from the background, the sidebar could remain on
`DB desconectada` until a full page refresh. The last logs were typically:

```text
[Sync] Status after foreground flush: { pendingCount: 0, deadLetterCount: 0, lastSync: null, ... }
[ConnectionStatus] Supabase connectivity check started
```

There was no matching connectivity-check completion log.

## Root cause

The sync queue was healthy and empty. The red badge is driven by `connectionStatus`, not by
`pendingCount`, `deadLetterCount`, or `lastSync`.

The auth store registered an async `onAuthStateChange` callback and awaited a `profiles` query from
inside that callback. Supabase Auth 2.91.1 invokes auth callbacks while holding its exclusive session
lock and explicitly warns that calling other Supabase APIs there can deadlock. Foreground session
recovery emitted `SIGNED_IN`; the profile query waited for the same lock; and database probes then
waited indefinitely while acquiring their access token.

React Strict Mode could also call auth initialization twice, registering duplicate listeners and
making the lock problem easier to trigger.

## Recovery flow after the fix

1. The auth callback updates only immediate in-memory auth state and returns synchronously.
2. Profile hydration runs on a later task, outside the Supabase auth lock. Repeated hydration for the
   same user is deduplicated, and a generation guard prevents late results from restoring a signed-out user.
3. Auth initialization is single-flight and installs one listener for the app lifetime.
4. Foreground `visibilitychange`, `focus`, and `pageshow` events join one recovery run.
5. Connectivity checks are single-flight and bound the entire token lookup, optional refresh, and
   database probe to 10 seconds. A timed-out underlying request cannot update newer status later.
6. A healthy result flushes pending writes, then runs product/customer deltas plus transaction and
   SAT-key reloads. If writes remain pending, remote loading is deferred to protect optimistic local data.
7. Failed checks can retry on the next foreground, browser-online event, or 30-second periodic check.

## Local storage boundaries

- Supabase Auth owns its persisted session in its library-managed localStorage key.
- `inventory_sync_queue` stores pending inventory writes.
- `inventory_sync_dead_letter` stores writes that exhausted normal retries.
- `inventory_sync_metadata` stores delta-sync cursors.
- Zustand stores use their existing `inventory_*` keys for local snapshots/preferences.

No key was renamed or cleared. No localStorage or database migration is required.

`pendingCount: 0` means there are no queued writes. `lastSync: null` means this runtime has not
completed a queued write; it is not evidence that Supabase is disconnected.

## Expected diagnostics

Every connectivity start must now be followed within 10 seconds by either:

```text
[ConnectionStatus] Supabase connectivity check completed
```

or a failure log with `timedOut: true`. Concurrent triggers log that they joined the active check.
After a successful foreground check, logs show connection-ready, queue flush, and foreground recovery
completion without requiring a page refresh.

## Validation scenarios

- Installed PWA: short background/resume while the token remains valid.
- Installed PWA: long background/resume requiring token refresh.
- Offline write followed by browser/PWA reconnect.
- Empty queue foreground resume.
- Rapid `visibilitychange`, `focus`, and `pageshow` delivery.
- Sign-out while a profile request is still pending.
