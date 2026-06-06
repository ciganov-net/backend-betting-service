import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'

@Injectable()
export class RedisService
	extends Redis
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(RedisService.name)

	public constructor(private readonly configService: ConfigService) {
		super({
			host: configService.getOrThrow<string>('REDIS_HOST'),
			port: configService.getOrThrow<number>('REDIS_PORT'),
			password: configService.getOrThrow<string>('REDIS_PASSWORD'),
			username: configService.getOrThrow<string>('REDIS_USER'),
			db: parseInt(configService.getOrThrow<string>('REDIS_DB')),
			maxRetriesPerRequest: 5,
			enableOfflineQueue: true
		})
	}

	onModuleInit() {
		const start = Date.now()
		this.logger.log('🔄Connecting to Redis...')
		this.on('ready', () => {
			this.logger.log('🔗Connecting...')
		})
		this.on('ready', () => {
			const ms = Date.now() - start
			this.logger.log(`🟢Connected to Redis in ${ms}ms`)
		})
		this.on('error', error => {
			this.logger.error('🔻Redis error', error)
		})
		this.on('close', () => {
			this.logger.warn('🔸Redis connection closed')
		})
		this.on('reconnecting', () => {
			this.logger.log('🔄Reconnecting to Redis...')
		})
	}

	async onModuleDestroy() {
		this.logger.log('🔻Disconnecting from Redis...')
		try {
			await this.quit()

			this.logger.log('🟡Disconnected from Redis')
		} catch (e) {
			this.logger.error('⚠Error disconnecting from Redis', e)
		}
	}
}
