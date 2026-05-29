import { Injectable, Logger } from '@nestjs/common'
import { RmqContext } from '@nestjs/microservices'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class RabbitmqService {
	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(RabbitmqService.name)
	}

	public ack(ctx: RmqContext, event?: string): void {
		const channel = ctx.getChannelRef()
		const msg = ctx.getMessage()
		const tag = msg?.fields?.deliveryTag

		if (!tag) return

		channel.ack(msg)
		this.logger.info(`[RMQ] ACK - Pattern: ${ctx.getPattern()}, Tag: ${tag}`)
	}

	public nack(context: RmqContext, event?: string, requeue = false): void {
		const channel = context.getChannelRef()
		const msg = context.getMessage()
		const tag = msg?.fields?.deliveryTag

		if (!tag) return

		channel.nack(msg, false, requeue)

		if (requeue) {
			this.logger.warn(
				`[RMQ] NACK response - Pattern: ${context.getPattern()}, Tag: ${tag}`
			)
		} else {
			this.logger.error(
				`[RMQ] NACK drop Pattern: ${context.getPattern()}, Tag: ${tag}`
			)
		}
	}
}
