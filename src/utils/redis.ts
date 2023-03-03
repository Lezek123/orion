import {
  createClient,
  RedisClientType,
  RedisDefaultModules,
  RedisFunctions,
  RedisScripts,
} from 'redis'
import { RedisClientMultiCommandType } from '@redis/client/dist/lib/client/multi-command'

export const DISTRIBUTION_BUCKETS_BAGS_KEY = 'distribution_buckets_bags'

export type RedisClient = RedisClientType<RedisDefaultModules, RedisFunctions, RedisScripts>
export type RedisMulti = RedisClientMultiCommandType<
  RedisDefaultModules,
  RedisFunctions,
  RedisScripts
>

export async function getRedis(): Promise<RedisClient> {
  const client = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${parseInt(
      process.env.REDIS_PORT || '6379'
    )}`,
  })

  client.on('error', (err) => console.error('Redis Client Error', err))
  await client.connect()
  return client
}
