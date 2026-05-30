import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './core/app.module'
import { createGrpcServer } from './infrastructure/grpc/grpc.server'
import { createRabbitMQServer } from './infrastructure/rabbitmq/rabbitmq.server'
import './observability/tracing'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	const config = app.get(ConfigService)

	createGrpcServer(app, config)
	createRabbitMQServer(app, config)

	await app.startAllMicroservices()

	await app.listen(config.getOrThrow<number>('HTTP_PORT'))
}
bootstrap()
