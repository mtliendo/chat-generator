import { Context, util } from '@aws-appsync/utils'

export function request(ctx: Context) {
	console.log(ctx.prev.result)
	return {
		method: 'POST',
		params: {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${ctx.prev.result}`,
			},
			body: {
				model: 'gpt-3.5-turbo',
				messages: [
					{
						role: 'system',
						content:
							'You are a wonderful storyteller. You create wonderful, whimsical and imaginative bedtime stories for children. Your stories are a single page but contain an intro, build up, climax, and happy ending.',
					},
					{ role: 'user', content: ctx.args.prompt },
				],
			},
		},
		resourcePath: '/v1/chat/completions',
	}
}

export function response(ctx: Context) {
	console.log(ctx)
	const body = JSON.parse(ctx.result.body)
	const response = body.choices[0].message.content
	console.log(response)
	return response
}
