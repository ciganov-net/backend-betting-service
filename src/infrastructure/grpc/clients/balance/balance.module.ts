import { PROTO_PATHS } from '@ciganov/contracts'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'

import { BalanceClientGrpc } from './balance.grpc'

@Module({
	providers: [BalanceClientGrpc],
	imports: [
		ClientsModule.registerAsync([
			{
				name: 'BALANCE_PACKAGE',
				useFactory: (configService: ConfigService) => ({
					transport: Transport.GRPC,
					options: {
						package: 'balance.v1',
						protoPath: PROTO_PATHS.BALANCE,
						url: configService.getOrThrow<string>('BALANCE_GRPC_URL')
					}
				}),
				inject: [ConfigService]
			}
		])
	],
	exports: [BalanceClientGrpc]
})
export class BalanceGrpcModule {}
