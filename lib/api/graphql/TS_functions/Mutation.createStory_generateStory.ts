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
				model: 'text-davinci-003',
				prompt: ctx.args.prompt,
				temperature: 0,
				max_tokens: 1455,
				top_p: 1,
				frequency_penalty: 0.5,
				presence_penalty: 0,
			},
		},
		resourcePath: '/v1/completions',
	}
}

export function response(ctx: Context) {
	console.log(ctx)
	const body = JSON.parse(ctx.result.body)
	const response = body.choices[0].text
	console.log(response)
	return response
}
