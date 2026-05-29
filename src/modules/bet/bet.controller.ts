import type { OddFinishedEvent } from '@ciganov/contracts'
import type {
	PlaceBetRequest,
	PlaceBetResponse
} from '@ciganov/contracts/dist/gen/betting'
import { Controller } from '@nestjs/common'
import {
	Ctx,
	EventPattern,
	GrpcMethod,
	Payload,
	RmqContext
} from '@nestjs/microservices'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { PinoLogger } from 'nestjs-pino'
import { Counter, Histogram } from 'prom-client'

import { RabbitmqService } from '@/infrastructure/rabbitmq/rabbitmq.service'

import { BetService } from './bet.service'

@Controller()
export class BetController {
	private readonly SERVICE_NAME: string

	constructor(
		private readonly betService: BetService,
		private readonly rabbitmqService: RabbitmqService,
		@InjectMetric('rmq_event_processing_duration_seconds')
		private readonly processingDuration: Histogram<string>,
		@InjectMetric('rmq_event_total')
		private readonly eventTotal: Counter<string>,
		private readonly logger: PinoLogger
	) {
		this.SERVICE_NAME = 'betting'
		this.logger.setContext(BetController.name)
	}

	@GrpcMethod('BettingService', 'PlaceBet')
	async placeBet(data: PlaceBetRequest): Promise<PlaceBetResponse> {
		return this.betService.placeBet(data)
	}

	@EventPattern('odd.finished.request')
	async onOddFinished(
		@Payload() data: OddFinishedEvent,
		@Ctx() ctx: RmqContext
	) {
		const event = 'odd.finished.request'
		const endTimer = this.processingDuration.startTimer({
			service: this.SERVICE_NAME,
			event
		})
		try {
			await this.betService.resolveBets(data)
			this.eventTotal.inc({
				service: this.SERVICE_NAME,
				event,
				status: 'success'
			})
			await this.rabbitmqService.ack(ctx)
		} catch (error) {
			//@ts-ignore
			this.logger.error(`Odd processing error: ${error?.message ?? error}`)
			this.eventTotal.inc({
				service: this.SERVICE_NAME,
				event,
				status: 'error'
			})
			this.rabbitmqService.nack(ctx)
			throw error
		} finally {
			endTimer()
		}
	}
}
