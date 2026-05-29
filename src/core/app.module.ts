import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

import { PrismaModule } from '@/infrastructure/prisma/prisma.module'
import { RabbitmqModule } from '@/infrastructure/rabbitmq/rabbitmq.module'
import { BetModule } from '@/modules/bet/bet.module'
import { ObservabilityModule } from '@/observability/observability.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: [
				`.env.${process.env.NODE_ENV}.local`,
				`.env.${process.env.NODE_ENV}`,
				`.env`
			]
		}),
		LoggerModule.forRoot({
			pinoHttp: {
				level: process.env.LOG_LEVEL,
				transport: {
					target: 'pino/file',
					options: {
						destination: '/var/log/services/betting/betting.log',
						mkdir: true
					}
				},
				messageKey: 'msg',
				customProps: () => ({
					service: 'betting-service'
				})
			}
		}),
		ObservabilityModule,
		PrismaModule,
		RabbitmqModule,
		BetModule
	]
})
export class AppModule {}
