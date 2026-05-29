import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import {
	makeCounterProvider,
	makeHistogramProvider,
	PrometheusModule
} from '@willsoto/nestjs-prometheus'

import { gRPCMetricsInterceptor } from './grpc-metrics.interceptor'

@Global()
@Module({
	imports: [
		PrometheusModule.register({
			path: '/metrics',
			defaultMetrics: {
				enabled: true
			}
		})
	],
	providers: [
		makeHistogramProvider({
			name: 'grpc_request_duration_seconds',
			help: 'gRPC request latency',
			labelNames: ['service', 'method']
		}),
		makeCounterProvider({
			name: 'grpc_requests_total',
			help: 'Total gRPC requests',
			labelNames: ['service', 'method', 'status']
		}),
		makeHistogramProvider({
			name: 'rmq_event_processing_duration_seconds',
			help: 'RabbitMQ event processing duration',
			labelNames: ['service', 'event'],
			buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
		}),
		makeCounterProvider({
			name: 'rmq_event_total',
			help: 'Total rabbitmq events processed',
			labelNames: ['service', 'event', 'status']
		}),
		makeCounterProvider({
			name: 'rmq_events_ack_total',
			help: 'Total rabbitmq ACKed events',
			labelNames: ['service', 'event']
		}),
		makeCounterProvider({
			name: 'rmq_events_nack_total',
			help: 'Total rabbitmq NACKed events',
			labelNames: ['service', 'event']
		}),
		gRPCMetricsInterceptor,
		{
			provide: APP_INTERCEPTOR,
			useClass: gRPCMetricsInterceptor
		}
	],
	exports: [
		'PROM_METRIC_RMQ_EVENT_PROCESSING_DURATION_SECONDS',
		'PROM_METRIC_RMQ_EVENT_TOTAL',
		'PROM_METRIC_RMQ_EVENTS_ACK_TOTAL',
		'PROM_METRIC_RMQ_EVENTS_NACK_TOTAL'
	]
})
export class MetricsModule {}
