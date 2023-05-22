import * as cdk from 'aws-cdk-lib'
import { CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createPublishToAppSyncFunc } from './functions/publishToAppSync/construct'
import { createTable } from './databases/tables'
import {
	FilterCriteria,
	FilterRule,
	StartingPosition,
} from 'aws-cdk-lib/aws-lambda'
import { createAPI } from './api/appsync'
import { createAuth } from './cognito/auth'
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources'

export class ChatGeneratorStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props)

		const AIStoryTable = createTable(this, {
			tableName: 'AIStoryTable',
		})

		const AIStoryAuth = createAuth(this, {
			appName: 'AIStoryAuth',
		})

		const appsyncAPI = createAPI(this, {
			appName: 'createAIStoryAPI',

			storyDB: AIStoryTable,
			userpool: AIStoryAuth.userPool,
			unauthenticatedRole: AIStoryAuth.identityPool.unauthenticatedRole,
		})

		const publishToAppSyncFunc = createPublishToAppSyncFunc(this, {
			appSyncARN: appsyncAPI.arn,
			appSyncURL: appsyncAPI.graphqlUrl,
			appName: 'AIStory',
		})

		publishToAppSyncFunc.addEventSource(
			new eventsources.DynamoEventSource(AIStoryTable, {
				startingPosition: StartingPosition.LATEST,
				filters: [
					FilterCriteria.filter({
						eventName: FilterRule.isEqual('INSERT'),
					}),
				],
			})
		)
		AIStoryTable.grantStreamRead(publishToAppSyncFunc)
		appsyncAPI.grantMutation(publishToAppSyncFunc, 'publish')

		new CfnOutput(this, 'cognitoUserPoolId', {
			value: AIStoryAuth.userPool.userPoolId,
		})
		new CfnOutput(this, 'idenititypoolId', {
			value: AIStoryAuth.identityPool.identityPoolId,
		})

		new CfnOutput(this, 'cognitoUserPoolClientId', {
			value: AIStoryAuth.userPoolClient.userPoolClientId,
		})

		new CfnOutput(this, 'region', {
			value: this.region,
		})

		new CfnOutput(this, 'AppSyncURL', {
			value: appsyncAPI.graphqlUrl,
		})
	}
}
