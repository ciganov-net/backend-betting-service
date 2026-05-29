import { Module } from '@nestjs/common'

import { BalanceGrpcModule } from '@/infrastructure/grpc/clients/balance/balance.module'
import { OddsGrpcModule } from '@/infrastructure/grpc/clients/odds/odds.module'

import { BetController } from './bet.controller'
import { BetService } from './bet.service'

@Module({
	controllers: [BetController],
	providers: [BetService],
	imports: [OddsGrpcModule, BalanceGrpcModule]
})
export class BetModule {}
