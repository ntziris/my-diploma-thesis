import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { chain } from '@/adapters';
import type { Page } from '@/adapters';

export interface ReadState<T> {
  data: T | undefined;
  loading: boolean;
  error: boolean;
}

interface Slot<T> {
  read: () => Promise<T>;
  view: ReadState<T>;
  loaded: boolean;
  inFlight: boolean;
  stale: boolean;
  listeners: Set<() => void>;
}

const slots = new Map<string, Slot<unknown>>();
let unsubscribeChain: (() => void) | null = null;

function slotFor<T>(key: string, read: () => Promise<T>): Slot<T> {
  let slot = slots.get(key) as Slot<T> | undefined;
  if (!slot) {
    slot = {
      read,
      view: { data: undefined, loading: true, error: false },
      loaded: false,
      inFlight: false,
      stale: false,
      listeners: new Set(),
    };
    slots.set(key, slot as Slot<unknown>);
  } else {
    slot.read = read;
  }
  return slot;
}

function load(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  if (slot.inFlight) {
    slot.stale = true;
    return;
  }
  slot.inFlight = true;
  void slot
    .read()
    .then((value) => {
      slot.view = { data: value, loading: false, error: false };
      slot.loaded = true;
    })
    .catch((e) => {
      console.error(`[chain] read of ${key} failed`, e);
      slot.view = { data: slot.view.data, loading: false, error: true };
      slot.loaded = true;
    })
    .finally(() => {
      slot.inFlight = false;
      for (const l of slot.listeners) l();
      if (slot.stale) {
        slot.stale = false;
        load(key);
      }
    });
}

// Every resource somebody listens to is re-read; the rest is forgotten
function refreshAll(): void {
  for (const [key, slot] of slots) {
    if (slot.listeners.size) load(key);
    else slots.delete(key); // nobody looks: forget it, it will be re-read fresh
  }
  for (const [key, feed] of feeds) {
    if (feed.listeners.size) loadFeed(key, null);
    else feeds.delete(key);
  }
}

// The chain poller runs only while somebody listens to at least one slot or feed
function attachChain(): void {
  if (!unsubscribeChain) unsubscribeChain = chain.subscribe(refreshAll);
}

function releaseChain(): void {
  if (!unsubscribeChain) return;
  for (const s of slots.values()) if (s.listeners.size) return;
  for (const f of feeds.values()) if (f.listeners.size) return;
  unsubscribeChain();
  unsubscribeChain = null;
}

function subscribe<T>(key: string, read: () => Promise<T>, listener: () => void): () => void {
  attachChain();
  const slot = slotFor(key, read);
  slot.listeners.add(listener);
  if ((!slot.loaded || slot.view.error) && !slot.inFlight) load(key);
  return () => {
    slot.listeners.delete(listener);
    releaseChain();
  };
}

const IDLE: ReadState<never> = { data: undefined, loading: false, error: false };
const PENDING: ReadState<never> = { data: undefined, loading: true, error: false };

export function useRead<T>(key: string | null, read: () => Promise<T>): ReadState<T> {
  const sub = useCallback(
    (listener: () => void) => (key ? subscribe(key, read, listener) : () => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const snapshot = useCallback(() => {
    if (!key) return IDLE as ReadState<T>;
    const slot = slots.get(key) as Slot<T> | undefined;
    return slot ? slot.view : (PENDING as ReadState<T>);
  }, [key]);
  return useSyncExternalStore(sub, snapshot, snapshot);
}

// True only while a read has never landed; a refresh keeps the previous value on screen
export function firstLoad(...states: readonly { loading: boolean; data: unknown }[]): boolean {
  return states.some((s) => s.loading && s.data === undefined);
}

export function useWatch(ids: readonly string[]): void {
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    return chain.watch(key.split(','));
  }, [key]);
}

export interface FeedView<T> {
  items: T[];
  more: boolean;
  loading: boolean;
  error: boolean;
}

interface FeedSlot<T> {
  fetch: (cursor: string | null) => Promise<Page<T>>;
  view: FeedView<T>;
  cursor: string | null;
  loaded: boolean;
  generation: number;
  listeners: Set<() => void>;
}

const feeds = new Map<string, FeedSlot<unknown>>();

function feedFor<T>(key: string, fetch: FeedSlot<T>['fetch']): FeedSlot<T> {
  let slot = feeds.get(key) as FeedSlot<T> | undefined;
  if (!slot) {
    slot = {
      fetch,
      view: { items: [], more: false, loading: false, error: false },
      cursor: null,
      loaded: false,
      generation: 0,
      listeners: new Set(),
    };
    feeds.set(key, slot as FeedSlot<unknown>);
  } else {
    slot.fetch = fetch;
  }
  return slot;
}

// A null cursor restarts from the first page; a page from an old generation is dropped
function loadFeed(key: string, cursor: string | null): void {
  const slot = feeds.get(key);
  if (!slot) return;
  if (cursor === null) slot.generation += 1;
  const gen = slot.generation;
  slot.view = { ...slot.view, loading: true, error: false };
  for (const l of slot.listeners) l();
  void slot
    .fetch(cursor)
    .then((page) => {
      if (gen !== slot.generation) return;
      const items = cursor === null ? page.items : [...slot.view.items, ...page.items];
      slot.view = { items, more: page.more, loading: false, error: false };
      slot.cursor = page.cursor;
      slot.loaded = true;
    })
    .catch((e) => {
      if (gen !== slot.generation) return;
      console.error(`[chain] feed ${key} failed`, e);
      slot.view = { ...slot.view, loading: false, error: true };
      slot.loaded = true;
    })
    .finally(() => {
      if (gen === slot.generation) for (const l of slot.listeners) l();
    });
}

function subscribeFeed<T>(
  key: string,
  fetch: FeedSlot<T>['fetch'],
  listener: () => void,
): () => void {
  attachChain();
  const slot = feedFor(key, fetch);
  slot.listeners.add(listener);
  if (!slot.loaded && !slot.view.loading) loadFeed(key, null);
  return () => {
    slot.listeners.delete(listener);
    releaseChain();
  };
}

const FEED_PENDING: FeedView<never> = { items: [], more: false, loading: true, error: false };

export function useFeed<T>(
  key: string,
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
): FeedView<T> & { loadMore: () => void } {
  const sub = useCallback(
    (listener: () => void) => subscribeFeed(key, fetchPage, listener),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const snapshot = useCallback(() => {
    const slot = feeds.get(key) as FeedSlot<T> | undefined;
    return slot ? slot.view : (FEED_PENDING as FeedView<T>);
  }, [key]);
  const view = useSyncExternalStore(sub, snapshot, snapshot);
  const loadMore = useCallback(() => {
    const slot = feeds.get(key);
    if (!slot || slot.view.loading || !slot.view.more) return;
    loadFeed(key, slot.cursor);
  }, [key]);
  return { ...view, loadMore };
}
