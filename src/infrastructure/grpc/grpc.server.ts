import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type MicroserviceOptions, Transport } from '@nestjs/microservices'

import { grpcLoader, grpcPackages, grpcProtoPaths } from './grpc.options'

export function createGrpcServer(app: INestApplication, config: ConfigService) {
	const host = config.getOrThrow<string>('GRPC_HOST')
	const port = config.getOrThrow<string>('GRPC_PORT')

	const url = `${host}:${port}`

	app.connectMicroservice<MicroserviceOptions>({
		transport: Transport.GRPC,
		options: {
			package: grpcPackages,
			protoPath: grpcProtoPaths,
			url,
			loader: grpcLoader
		}
	})
}
