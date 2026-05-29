import { PROTO_PATHS } from '@ciganov/contracts'
import { GrpcOptions } from '@nestjs/microservices'

export const grpcPackages = ['betting.v1']

export const grpcProtoPaths = [PROTO_PATHS.BETTING]

export const grpcLoader: NonNullable<GrpcOptions['options']['loader']> = {
	keepCase: false,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true
}
