import {
	OddServiceClient,
	SwitchEventLiveStateRequest,
	ValidateOutcomeRequest,
	ValidateOutcomeResponse
} from '@ciganov/contracts/dist/gen/odd'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import type { ClientGrpc } from '@nestjs/microservices'

@Injectable()
export class OddsClientGrpc implements OnModuleInit {
	private oddsService: OddServiceClient
	public constructor(
		@Inject('ODDS_PACKAGE') private readonly client: ClientGrpc
	) {}

	public onModuleInit() {
		this.oddsService = this.client.getService<OddServiceClient>('OddService')
	}

	public validate(data: ValidateOutcomeRequest) {
		return this.oddsService.validateOutcome(data)
	}

	public switchLiveState(data: SwitchEventLiveStateRequest) {
		return this.oddsService.switchEventLiveState(data)
	}
}
