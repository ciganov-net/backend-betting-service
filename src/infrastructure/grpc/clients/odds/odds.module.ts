import { PROTO_PATHS } from '@ciganov/contracts'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'

import { OddsClientGrpc } from './odds.grpc'

@Module({
	providers: [OddsClientGrpc],
	imports: [
		ClientsModule.registerAsync([
			{
				name: 'ODDS_PACKAGE',
				useFactory: (configService: ConfigService) => ({
					transport: Transport.GRPC,
					options: {
						package: 'odd.v1',
						protoPath: PROTO_PATHS.ODD,
						url: configService.getOrThrow<string>('ODDS_GRPC_URL')
					}
				}),
				inject: [ConfigService]
			}
		])
	],
	exports: [OddsClientGrpc]
})
export class OddsGrpcModule {}
