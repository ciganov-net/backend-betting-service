import * as dotenv from 'dotenv'
import { defineConfig, env } from 'prisma/config'

dotenv.config({
	path: ['.env.development.local', '.env.production.local']
})

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		url: env('DATABASE_URI')
	}
})
