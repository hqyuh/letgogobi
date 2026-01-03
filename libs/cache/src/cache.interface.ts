export abstract class ICacheService {
  /**
   * Saves data to the cache.
   * @param key
   * @param value
   * @param expired expiration time
   * @return Promise<'OK'>
   */
  abstract set(
    key: string,
    value: string,
    expired: string | number,
  ): Promise<'OK'>;

  /**
   * Saves data to the cache. (but never expires)
   * @param key
   * @param value
   * @return Promise<number>
   */
  abstract setNx(key: string, value: string): Promise<number>;

  /**
   * Saves data to the cache. (but setnx to lock with expiry)
   * @param key
   * @param value
   * @return Promise<boolean>
   */
  abstract setNxWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean>;

  /**
   * Get data from the cache.
   * @param key
   * @return Promise<string | null>
   */
  abstract get(key: string): Promise<string | null>;

  /**
   * Delete data from the cache
   * @param key
   * @return Promise<number>
   */
  abstract del(key: string): Promise<number>;

  /**
   * Get all keys by their prefix
   * @param prefix
   * @return Promise<string[]>
   */
  abstract keys(prefix: string): Promise<string[]>;
}
