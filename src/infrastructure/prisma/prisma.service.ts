import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PinoLogger } from 'nestjs-pino'

import { PrismaClient } from '../../../prisma/generated/client'

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	public constructor(
		private readonly configService: ConfigService,
		private readonly logger: PinoLogger
	) {
		const adapter = new PrismaPg({
			user: configService.getOrThrow<string>('DATABASE_USER'),
			password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
			host: configService.getOrThrow<string>('DATABASE_HOST'),
			port: configService.getOrThrow<number>('DATABASE_PORT'),
			database: configService.getOrThrow<string>('DATABASE_NAME')
		})
		super({ adapter })
		this.logger.setContext(PrismaService.name)
	}

	async onModuleInit() {
		const start = Date.now()
		this.logger.info('🔄Connecting to the database...')

		try {
			await this.$connect()
			const ms = Date.now() - start
			this.logger.info(`🟢Connected to the database in ${ms}ms`)
		} catch (e) {
			this.logger.error('🔴Failed to connect to the database: ', e)
		}
	}

	async onModuleDestroy() {
		this.logger.info('🔄Disconnecting from the database...')
		try {
			await this.$disconnect()
			this.logger.info('🟢Disconnected from the database')
		} catch (e) {
			this.logger.error('🔴Failed to connect to the database: ', e)
		}
	}
}
