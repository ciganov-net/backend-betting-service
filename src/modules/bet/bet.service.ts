import { OddFinishedEvent } from '@ciganov/contracts'
import { TransactionType } from '@ciganov/contracts/dist/gen/balance'
import type {
	PlaceBetRequest,
	PlaceBetResponse
} from '@ciganov/contracts/dist/gen/betting'
import { RpcStatus } from '@ciganov/core'
import { Injectable } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import { Bet } from '@prisma/generated/client'
import { PinoLogger } from 'nestjs-pino'
import { lastValueFrom } from 'rxjs'

import { BalanceClientGrpc } from '@/infrastructure/grpc/clients/balance/balance.grpc'
import { OddsClientGrpc } from '@/infrastructure/grpc/clients/odds/odds.grpc'
import { PrismaService } from '@/infrastructure/prisma/prisma.service'

@Injectable()
export class BetService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly balanceClient: BalanceClientGrpc,
		private readonly oddsClient: OddsClientGrpc,
		private readonly logger: PinoLogger
	) {
		this.logger.setContext(BetService.name)
	}

	async placeBet(data: PlaceBetRequest): Promise<PlaceBetResponse> {
		const { amount, coefficient, outcomeId, userId } = data

		const validateResponse = await lastValueFrom(
			this.oddsClient.validate({
				outcomeId
			})
		)

		if (validateResponse.coefficient !== coefficient)
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

		return {
			ok: true
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
		return true
	}
}
