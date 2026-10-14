import type { ChainAdapter } from './types';
import { suiAdapter } from './suiAdapter';
import type { StorageAdapter } from './storage';
import { walrusStorage } from './storage';

export const chain: ChainAdapter = suiAdapter;

export const storage: StorageAdapter = walrusStorage;

export * from './types';
export type { StorageAdapter } from './storage';
