import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import type { SyncResponse, MasterState } from '../../shared/types';
import { globalSkuIndex, type IndexedItem } from './searchIndex';

const STORAGE_KEY = 'gudang_cepat_master_v1';

const initialMasterState: MasterState = {
  cursor: 0,
  lastSyncedAt: 0,
  products: {},
  variants: {},
  stock: {},
  stores: {},
  partners: {},
  mappings: {},
  fee_profiles: {},
  settings: {},
};

let currentState: MasterState = initialMasterState;
let isSyncing = false;
let isInitialLoaded = false;
let syncError: string | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

// Load cached master from IndexedDB on startup
export async function initMasterCache(): Promise<MasterState> {
  try {
    const cached = await get<MasterState>(STORAGE_KEY);
    if (cached) {
      currentState = cached;
      globalSkuIndex.buildIndex(cached.products, cached.variants, cached.stock);
    }
  } catch (err) {
    console.warn('[IndexedDB] Failed to load cached master:', err);
  } finally {
    isInitialLoaded = true;
    notify();
  }
  return currentState;
}

// Perform delta sync with server
export async function syncMaster(force = false): Promise<void> {
  if (isSyncing && !force) return;

  isSyncing = true;
  syncError = null;
  notify();

  try {
    const since = currentState.cursor;
    const url = `/api/sync?since=${since}`;
    const headers: Record<string, string> = {};

    if (since > 0) {
      headers['If-None-Match'] = `W/"sync-${since}"`;
    }

    const res = await fetch(url, { headers });

    if (res.status === 304) {
      // Data unchanged
      currentState = { ...currentState, lastSyncedAt: Date.now() };
      await set(STORAGE_KEY, currentState);
      return;
    }

    if (!res.ok) {
      throw new Error(`Sync failed with HTTP ${res.status}`);
    }

    const data = (await res.json()) as SyncResponse;

    // Merge delta updates
    const nextProducts = { ...currentState.products };
    data.products.forEach((p) => {
      nextProducts[p.id] = p;
    });

    const nextVariants = { ...currentState.variants };
    data.variants.forEach((v) => {
      nextVariants[v.id] = v;
    });

    const nextStock = { ...currentState.stock };
    data.stock.forEach((s) => {
      nextStock[s.variant_id] = s;
    });

    const nextStores = { ...currentState.stores };
    data.stores.forEach((st) => {
      nextStores[st.id] = st;
    });

    const nextPartners = { ...currentState.partners };
    data.partners.forEach((pt) => {
      nextPartners[pt.id] = pt;
    });

    const nextMappings = { ...currentState.mappings };
    data.mappings.forEach((m) => {
      nextMappings[m.id] = m;
    });

    const nextFeeProfiles = { ...currentState.fee_profiles };
    data.fee_profiles.forEach((fp) => {
      nextFeeProfiles[fp.id] = fp;
    });

    const nextSettings = { ...currentState.settings };
    data.settings.forEach((st) => {
      nextSettings[st.key] = st;
    });

    currentState = {
      cursor: data.cursor,
      lastSyncedAt: Date.now(),
      products: nextProducts,
      variants: nextVariants,
      stock: nextStock,
      stores: nextStores,
      partners: nextPartners,
      mappings: nextMappings,
      fee_profiles: nextFeeProfiles,
      settings: nextSettings,
    };

    globalSkuIndex.buildIndex(nextProducts, nextVariants, nextStock);
    await set(STORAGE_KEY, currentState);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown sync error';
    syncError = msg;
    console.error('[Sync] Error during master sync:', msg);
  } finally {
    isSyncing = false;
    notify();
  }
}

// React Hook: useMaster
export function useMaster() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentState
  );

  const [initialized, setInitialized] = useState(isInitialLoaded);

  useEffect(() => {
    if (!isInitialLoaded) {
      initMasterCache().then(() => {
        setInitialized(true);
        syncMaster();
      });
    } else {
      setInitialized(true);
    }

    // Auto-sync on window focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncMaster();
      }
    };

    // Auto-sync every 60s
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncMaster();
      }
    }, 60000);

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  const searchVariants = useCallback((query: string, limit = 50): IndexedItem[] => {
    return globalSkuIndex.search(query, limit);
  }, []);

  return {
    ...state,
    productList: Object.values(state.products),
    variantList: Object.values(state.variants),
    storeList: Object.values(state.stores),
    partnerList: Object.values(state.partners),
    isSyncing,
    isInitialLoaded: initialized,
    syncError,
    sync: syncMaster,
    searchVariants,
  };
}
