import { OddFinishedEvent } from '@ciganov/contracts'
import type { OddResolvedEvent } from '@ciganov/contracts/dist/events'
import { TransactionType } from '@ciganov/contracts/dist/gen/balance'
import {
	BetStatus,
	type GetBetCountByEventRequest,
	type GetBetCountByEventResponse,
	type GetUserBetsRequest,
	type GetUserBetsResponse,
	type PlaceBetRequest,
	type PlaceBetResponse
} from '@ciganov/contracts/dist/gen/betting'
import { convertEnum, dateToProto, RpcStatus } from '@ciganov/core'
import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy, RpcException } from '@nestjs/microservices'
import { Bet } from '@prisma/generated/client'
import { PinoLogger } from 'nestjs-pino'
import { lastValueFrom } from 'rxjs'

import { BalanceClientGrpc } from '@/infrastructure/grpc/clients/balance/balance.grpc'
import { OddsClientGrpc } from '@/infrastructure/grpc/clients/odds/odds.grpc'
import { PrismaService } from '@/infrastructure/prisma/prisma.service'
import { RedisService } from '@/infrastructure/redis/redis.service'

@Injectable()
export class BetService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly balanceClient: BalanceClientGrpc,
		private readonly oddsClient: OddsClientGrpc,
		@Inject('GATEWAY_CLIENT') private readonly client: ClientProxy,
		private readonly logger: PinoLogger,
		private readonly redisService: RedisService
	) {
		this.logger.setContext(BetService.name)
	}

	async getBetCount(
		data: GetBetCountByEventRequest
	): Promise<GetBetCountByEventResponse> {
		const { eventId } = data
		const count = await this.prismaService.bet.count({
			where: {
				eventId
			}
		})
		return { count }
	}

	async placeBet(data: PlaceBetRequest): Promise<PlaceBetResponse> {
		const { amount, coefficient, outcomeId, userId } = data

		const validateResponse = await lastValueFrom(
			this.oddsClient.validate({
				outcomeId
			})
		)

		const redisCoefficient = await this.redisService.hget(
			`event:coefficients:${validateResponse.eventId}`,
			outcomeId
		)

		const actualCoefficient = parseFloat(redisCoefficient)

		if (actualCoefficient - coefficient > 0.0001)
			throw new RpcException({
				code: RpcStatus.INVALID_ARGUMENT,
				details: 'Coefficient is not valid'
			})

		const transaction = await lastValueFrom(
			this.balanceClient.transaction({
				type: TransactionType.BET_FREEZE,
				amount: amount,
				userId,
				eventId: validateResponse.eventId,
				multiplier: validateResponse.coefficient
			})
		)

		if (!transaction.ok)
			throw new RpcException({
				code: RpcStatus.INTERNAL,
				details: 'Failed to freeze balance for bet'
			})

		const potentialPayout = amount * coefficient
		await this.prismaService.bet.create({
			data: {
				userId,
				eventId: validateResponse.eventId,
				outcomeId,
				eventName: validateResponse.eventName,
				outcomeName: validateResponse.outcomeName,
				amount,
				totalCoefficient: coefficient,
				potentialPayout,
				status: 'PENDING'
			}
		})

		await this.redisService.hincrby(
			`event:amounts:${validateResponse.eventId}`,
			outcomeId,
			amount
		)

		const allAmounts = await this.redisService.hgetall(
			`event:amounts:${validateResponse.eventId}`
		)
		const redisOutcomeIds = Object.keys(allAmounts)
		let fullAmount = 0

		for (const redisOutcomeId of redisOutcomeIds) {
			fullAmount += parseFloat(allAmounts[redisOutcomeId])
		}

		if (fullAmount >= 5000) {
			for (const redisOutcomeId of redisOutcomeIds) {
				const currentAmount = parseFloat(allAmounts[redisOutcomeId])
				if (currentAmount >= 2500) {
					const newCoefficient = 0.8 / (currentAmount / fullAmount)
					await this.redisService.hset(
						`event:coefficients:${validateResponse.eventId}`,
						redisOutcomeId,
						Math.min(50.0, Math.max(0.01, newCoefficient))
					)
				}
			}
		}

		return {
			ok: true
		}
	}

	async getUserBets(data: GetUserBetsRequest): Promise<GetUserBetsResponse> {
		const { userId } = data
		const bets = await this.prismaService.bet.findMany({
			where: {
				userId
			},
			orderBy: {
				status: 'asc'
			}
		})
		return {
			bets: bets.map(value => ({
				id: value.id,
				amount: Number(value.amount),
				createdAt: dateToProto(value.createdAt),
				updatedAt: dateToProto(value.updatedAt),
				eventId: value.eventId,
				eventName: value.eventName,
				outcomeId: value.outcomeId,
				outcomeName: value.outcomeName,
				potentialPayout: Number(value.potentialPayout),
				status: convertEnum(BetStatus, value.status),
				totalCoefficient: Number(value.totalCoefficient),
				userId: value.userId,
				actualPayout: Number(value.actualPayout)
			}))
		}
	}

	async resolveBets(data: OddFinishedEvent) {
		const { eventId, status, winningOutcomes } = data
		const bets = await this.prismaService.bet.findMany({
			where: {
				eventId,
				status: 'PENDING'
			}
		})

		if (bets.length === 0) {
			this.oddsClient.closeEvent({ eventId })
			this.logger.info(`No pending bets found for event ${eventId}`)
			return
		}

		for (const bet of bets) {
			try {
				if (status === 'CANCELLED') {
					await this.processingCancelledBet(bet)
				} else if (status === 'FINISHED') {
					const isWinning = winningOutcomes.includes(bet.outcomeId)
					if (isWinning) {
						await this.processingWinBet(bet)
					} else {
						await this.processingLoseBet(bet)
					}
				}
			} catch (error) {
				this.logger.error(
					//@ts-ignore
					`Error processing bet ${bet.id}: ${error?.message ?? error}`
				)
			}
		}
	}

	private async processingWinBet(bet: Bet): Promise<boolean> {
		const payout = bet.amount.toNumber()

		const transaction = await lastValueFrom(
			this.balanceClient.transaction({
				type: TransactionType.BET_WIN,
				amount: payout,
				userId: bet.userId,
				eventId: bet.eventId,
				multiplier: bet.totalCoefficient.toNumber()
			})
		)

		if (!transaction.ok)
			throw new RpcException({
				code: RpcStatus.INTERNAL,
				details: 'Failed to process win bet transaction'
			})

		await this.prismaService.bet.update({
			where: {
				id: bet.id
			},
			data: {
				status: 'WON',
				actualPayout: bet.potentialPayout.toNumber()
			}
		})
		this.oddsClient.closeEvent({ eventId: bet.eventId })
		const wsData: OddResolvedEvent = {
			status: 'WON',
			userId: bet.userId
		}
		this.client.emit('bet.resolved', wsData)
		return true
	}

	private async processingLoseBet(bet: Bet): Promise<boolean> {
		const payout = bet.amount.toNumber()

		const transaction = await lastValueFrom(
			this.balanceClient.transaction({
				type: TransactionType.BET_LOSE,
				amount: payout,
				userId: bet.userId,
				eventId: bet.eventId,
				multiplier: bet.totalCoefficient.toNumber()
			})
		)

		if (!transaction.ok)
			throw new RpcException({
				code: RpcStatus.INTERNAL,
				details: 'Failed to process lose bet transaction'
			})

		await this.prismaService.bet.update({
			where: {
				id: bet.id
			},
			data: {
				status: 'LOST',
				actualPayout: -payout
			}
		})
		this.oddsClient.closeEvent({ eventId: bet.eventId })
		const wsData: OddResolvedEvent = {
			status: 'LOSE',
			userId: bet.userId
		}
		this.client.emit('bet.resolved', wsData)
		return true
	}

	private async processingCancelledBet(bet: Bet): Promise<boolean> {
		const amount = bet.amount.toNumber()

		const transaction = await lastValueFrom(
			this.balanceClient.transaction({
				type: TransactionType.REFUND,
				amount,
				userId: bet.userId,
				eventId: bet.eventId,
				multiplier: bet.totalCoefficient.toNumber()
			})
		)

		if (!transaction.ok)
			throw new RpcException({
				code: RpcStatus.INTERNAL,
				details: 'Failed to process cancelled bet transaction'
			})

		await this.prismaService.bet.update({
			where: {
				id: bet.id
			},
			data: {
				status: 'CANCELLED',
				actualPayout: 0
			}
		})
		this.oddsClient.closeEvent({ eventId: bet.eventId })
		const wsData: OddResolvedEvent = {
			status: 'CANCELLED',
			userId: bet.userId
		}
		this.client.emit('bet.resolved', wsData)
		return true
	}
}
