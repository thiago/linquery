/**
 * Manager class for model queries
 */

import type { ModelClass, ModelInstance, Filter, TypedFilter, BackendAdapter } from '../types';
import { QuerySet } from './QuerySet';

/**
 * Manager - Query interface for models
 * Accessed via Model.objects
 */
export class Manager<T = unknown> {
  private model: ModelClass<T>;
  private adapter?: BackendAdapter;

  constructor(model: ModelClass<T>, adapter?: BackendAdapter) {
    this.model = model;
    this.adapter = adapter;
  }

  /**
   * Get the adapter, either from manager or model
   */
  private getAdapter(): BackendAdapter {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = this.adapter ?? (this.model as any).getAdapter?.();
    if (!adapter) {
      throw new Error(`No adapter configured for model ${this.model.name}`);
    }
    return adapter;
  }

  /**
   * Get all objects
   */
  all(): QuerySet<T> {
    return new QuerySet<T>(this.model, this.getAdapter());
  }

  /**
   * Filter objects
   */
  filter(filters: TypedFilter<T>): QuerySet<T> {
    return this.all().filter(filters);
  }

  /**
   * Exclude objects
   */
  exclude(filters: TypedFilter<T>): QuerySet<T> {
    return this.all().exclude(filters);
  }

  /**
   * Get a single object
   */
  async get(filters: TypedFilter<T>): Promise<T> {
    return this.all().get(filters);
  }

  /**
   * Create a new object
   */
  async create(data: Partial<ModelInstance<T>>): Promise<T> {
    return this.all().create(data);
  }

  /**
   * Get or create an object
   */
  async getOrCreate(
    filters: TypedFilter<T>,
    defaults: Partial<ModelInstance<T>> = {}
  ): Promise<{ instance: T; created: boolean }> {
    try {
      const instance = await this.get(filters);
      return { instance, created: false };
    } catch (error) {
      // DoesNotExist - create new instance
      const instance = await this.create({ ...(filters as Filter), ...defaults });
      return { instance, created: true };
    }
  }

  /**
   * Update or create an object
   */
  async updateOrCreate(
    filters: TypedFilter<T>,
    defaults: Partial<ModelInstance<T>> = {}
  ): Promise<{ instance: T; created: boolean }> {
    try {
      const instance = await this.get(filters);
      // Update instance
      Object.assign(instance as object, defaults);
      await (instance as unknown as { save(): Promise<void> }).save();
      return { instance, created: false };
    } catch (error) {
      // DoesNotExist - create new instance
      const instance = await this.create({ ...(filters as Filter), ...defaults });
      return { instance, created: true };
    }
  }

  /**
   * Bulk create objects
   */
  async bulkCreate(dataList: Partial<ModelInstance<T>>[]): Promise<T[]> {
    const instances: T[] = [];

    for (const data of dataList) {
      const instance = await this.create(data);
      instances.push(instance);
    }

    return instances;
  }

  /**
   * Count all objects
   */
  async count(): Promise<number> {
    return this.all().count();
  }

  /**
   * Check if any objects exist
   */
  async exists(): Promise<boolean> {
    return this.all().exists();
  }

  /**
   * Get the first object
   */
  async first(): Promise<T | undefined> {
    return this.all().first();
  }

  /**
   * Get the last object
   */
  async last(): Promise<T | undefined> {
    return this.all().last();
  }

  /**
   * Order by fields
   */
  order_by(...fields: (keyof ModelInstance<T> | `-${string}`)[]): QuerySet<T> {
    return this.all().order_by(...fields);
  }

  /**
   * Limit results
   */
  limit(count: number): QuerySet<T> {
    return this.all().limit(count);
  }

  /**
   * Offset results
   */
  offset(count: number): QuerySet<T> {
    return this.all().offset(count);
  }

  /**
   * Select related
   */
  select_related(...fields: string[]): QuerySet<T> {
    return this.all().select_related(...fields);
  }

  /**
   * Prefetch related
   */
  prefetch_related(...fields: string[]): QuerySet<T> {
    return this.all().prefetch_related(...fields);
  }

  /**
   * Only specific fields
   */
  only(...fields: (keyof ModelInstance<T>)[]): QuerySet<T> {
    return this.all().only(...fields);
  }

  /**
   * Defer specific fields
   */
  defer(...fields: (keyof ModelInstance<T>)[]): QuerySet<T> {
    return this.all().defer(...fields);
  }

  /**
   * Get distinct results
   */
  distinct(): QuerySet<T> {
    return this.all().distinct();
  }

  /**
   * Get values as plain objects
   */
  values(...fields: (keyof ModelInstance<T>)[]): QuerySet<Record<string, unknown>> {
    return this.all().values(...fields);
  }

  /**
   * Get values as arrays
   */
  values_list(...fields: (keyof ModelInstance<T>)[]): QuerySet<unknown[]> {
    return this.all().values_list(...fields);
  }

  /**
   * Update multiple objects
   */
  async update(filters: TypedFilter<T>, data: Partial<ModelInstance<T>>): Promise<number> {
    return this.filter(filters).update(data);
  }

  /**
   * Delete objects
   */
  async delete(filters: TypedFilter<T>): Promise<number> {
    return this.filter(filters).delete();
  }

  /**
   * Set a custom adapter for this manager
   */
  using(adapter: BackendAdapter): Manager<T> {
    return new Manager<T>(this.model, adapter);
  }
}
