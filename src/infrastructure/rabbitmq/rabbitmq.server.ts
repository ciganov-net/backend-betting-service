import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type MicroserviceOptions, Transport } from '@nestjs/microservices'

export function createRabbitMQServer(
	app: INestApplication,
	config: ConfigService
) {
	app.connectMicroservice<MicroserviceOptions>({
		transport: Transport.RMQ,
		options: {
			urls: [config.getOrThrow<string>('RMQ_URL')],
			queue: config.getOrThrow<string>('RMQ_QUEUE'),
			queueOptions: {
				durable: true
			},
			noAck: false,
			prefetchCount: 10,
			persistent: true
		}
	})
}
