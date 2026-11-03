/**
 * Ponto offline — estado no ecrã: rede, interruptor da empresa, fila e envio
 * automático quando a rede volta (evento `online`, foco da janela e a cada 30 s).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  defaultQueue,
  eventsFor,
  newEventId,
  type OfflinePunchEvent,
  type OfflineQueueStorage,
} from "@/lib/punch/offline-queue";
import { fetchOfflineSettings, syncOfflineQueue, type SyncOutcome } from "@/lib/punch/offline-sync";

export type NewOfflineEvent = Omit<
  OfflinePunchEvent,
  "client_event_id" | "user_id" | "company_id" | "status" | "created_at"
>;

export interface OfflinePunchApi {
  enabled: boolean;
  online: boolean;
  pending: OfflinePunchEvent[];
  failed: OfflinePunchEvent[];
  syncing: boolean;
  enqueue: (ev: NewOfflineEvent) => Promise<OfflinePunchEvent | null>;
  syncNow: () => Promise<SyncOutcome | null>;
  dismissFailed: () => Promise<void>;
}

export function useOfflinePunch(
  userId: string | null | undefined,
  companyId: string | null | undefined,
  onSynced?: (outcome: SyncOutcome) => void,
): OfflinePunchApi {
  const storageRef = useRef<OfflineQueueStorage>(defaultQueue());
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [events, setEvents] = useState<OfflinePunchEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const { data: settings } = useQuery({
    queryKey: ["offline-punch-settings", companyId],
    queryFn: () => fetchOfflineSettings(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
  const enabled = !!settings?.enabled;

  const reload = useCallback(async () => {
    if (!userId) return setEvents([]);
    try {
      setEvents(eventsFor(await storageRef.current.list(), userId, companyId));
    } catch (err) {
      console.error("[offline-punch] queue read failed", err);
    }
  }, [userId, companyId]);

  const syncNow = useCallback(async () => {
    if (!userId || syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const outcome = await syncOfflineQueue(storageRef.current, userId);
      await reload();
      if (outcome.sent > 0) onSyncedRef.current?.(outcome);
      return outcome;
    } catch (err) {
      console.error("[offline-punch] sync failed", err);
      return null;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId, reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void syncNow();
    };
    const down = () => setOnline(false);
    const focus = () => void syncNow();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("focus", focus);
    const id = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 30_000);
    void syncNow();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("focus", focus);
      window.clearInterval(id);
    };
  }, [syncNow]);

  const enqueue = useCallback<OfflinePunchApi["enqueue"]>(
    async (ev) => {
      if (!userId || !companyId) return null;
      const full: OfflinePunchEvent = {
        ...ev,
        client_event_id: newEventId(),
        user_id: userId,
        company_id: companyId,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      await storageRef.current.put(full);
      await reload();
      return full;
    },
    [userId, companyId, reload],
  );

  const dismissFailed = useCallback(async () => {
    for (const e of events.filter((x) => x.status === "failed"))
      await storageRef.current.remove(e.client_event_id);
    await reload();
  }, [events, reload]);

  return {
    enabled,
    online,
    pending: events.filter((e) => e.status === "pending"),
    failed: events.filter((e) => e.status === "failed"),
    syncing,
    enqueue,
    syncNow,
    dismissFailed,
  };
}
