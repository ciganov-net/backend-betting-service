import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'

import { BalanceGrpcModule } from '@/infrastructure/grpc/clients/balance/balance.module'
import { OddsGrpcModule } from '@/infrastructure/grpc/clients/odds/odds.module'

import { BetController } from './bet.controller'
import { BetService } from './bet.service'

@Module({
	controllers: [BetController],
	providers: [BetService],
	imports: [
		OddsGrpcModule,
		BalanceGrpcModule,
		ClientsModule.registerAsync([
			{
				name: 'GATEWAY_CLIENT',
				useFactory: (configService: ConfigService) => ({
					transport: Transport.RMQ,
					options: {
						urls: [configService.getOrThrow<string>('RMQ_URL')],
						queue: 'gateway_queue',
						queueOptions: {
							durable: true
						}
					}
				}),
				inject: [ConfigService]
			}
		])
	]
})
export class BetModule {}
