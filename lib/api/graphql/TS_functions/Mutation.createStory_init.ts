import { CreateStoryMutationVariables } from '../API'

import {
	util,
	DynamoDBPutItemRequest,
	Context,
	AppSyncIdentityCognito,
} from '@aws-appsync/utils'

export function request(
	ctx: Context<CreateStoryMutationVariables>
): DynamoDBPutItemRequest {
	let id = util.autoId()

	ctx.stash.id = id

	return {
		operation: 'PutItem',
		key: util.dynamodb.toMapValues({ id }),
		attributeValues: util.dynamodb.toMapValues({
			__typename: 'Story',
			owner: (ctx.identity as AppSyncIdentityCognito).sub,
			createdAt: util.time.nowISO8601(),
			updatedAt: util.time.nowISO8601(),
			isComplete: false,
			text: '',
		}),
	}
}

export function response(ctx: Context) {
	return {}
}
