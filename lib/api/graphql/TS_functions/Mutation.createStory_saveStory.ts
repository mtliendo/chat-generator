import { CreateStoryMutationVariables, Story } from '../API'

import { util, Context, DynamoDBUpdateItemRequest } from '@aws-appsync/utils'

export function request(
	ctx: Context<CreateStoryMutationVariables>
): DynamoDBUpdateItemRequest {
	let id = ctx.stash.id

	return {
		operation: 'UpdateItem',
		key: util.dynamodb.toMapValues({ id }),
		update: {
			expression:
				'set updatedAt = :updatedAt, isComplete = :isComplete, text = :text',
			expressionValues: {
				':updatedAt': { S: util.time.nowISO8601() },
				':isComplete': { BOOL: true },
				':text': { S: ctx.prev.result },
			},
		},
	}
}

export function response(ctx: Context) {
	return ctx.result as Story
}
