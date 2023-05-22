import { Construct } from 'constructs'
import * as awsAppsync from 'aws-cdk-lib/aws-appsync'
import * as path from 'path'
import { UserPool } from 'aws-cdk-lib/aws-cognito'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { IRole, PolicyStatement } from 'aws-cdk-lib/aws-iam'

type AppSyncAPIProps = {
	appName: string
	unauthenticatedRole: IRole
	userpool: UserPool
	storyDB: Table
}

export function createAPI(scope: Construct, props: AppSyncAPIProps) {
	const api = new awsAppsync.GraphqlApi(scope, props.appName, {
		name: props.appName,
		schema: awsAppsync.SchemaFile.fromAsset(
			path.join(__dirname, './graphql/schema.graphql')
		),
		authorizationConfig: {
			defaultAuthorization: {
				authorizationType: awsAppsync.AuthorizationType.USER_POOL,
				userPoolConfig: {
					userPool: props.userpool,
				},
			},
			additionalAuthorizationModes: [
				{ authorizationType: awsAppsync.AuthorizationType.IAM },
			],
		},
		xrayEnabled: true,
		logConfig: {
			fieldLogLevel: awsAppsync.FieldLogLevel.ALL,
		},
	})

	api.grantQuery(props.unauthenticatedRole, 'listStories')

	const storyTableDataSource = api.addDynamoDbDataSource(
		`StoryDBDataSource`,
		props.storyDB
	)

	const parameterStoreDataSource = api.addHttpDataSource(
		'parameterStoreDataSource',
		'https://ssm.us-east-1.amazonaws.com',
		{
			authorizationConfig: {
				signingRegion: process.env.CDK_DEFAULT_REGION!,
				signingServiceName: 'ssm',
			},
		}
	)

	const allowSSMAccess = new PolicyStatement({
		actions: ['ssm:GetParameters'],
		resources: [
			`arn:aws:ssm:us-east-1:${process.env.CDK_DEFAULT_ACCOUNT}:parameter/OPENAI_SECRET`,
		],
	})

	parameterStoreDataSource.grantPrincipal.addToPrincipalPolicy(allowSSMAccess)

	const openAIDataSource = api.addHttpDataSource(
		'openAIDataSource',
		'https://api.openai.com'
	)

	const NONEDataSource = api.addNoneDataSource(`NoneDataSource`)

	const listStoriesFunction = new awsAppsync.AppsyncFunction(
		scope,
		'listStoriesFunction',
		{
			name: 'listStoriesFunction',
			api,
			dataSource: storyTableDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(__dirname, 'graphql/JS_functions/Query.listStories.js')
			),
		}
	)

	const publishFunction = new awsAppsync.AppsyncFunction(
		scope,
		'publishFunction',
		{
			name: 'publishFunction',
			api,
			dataSource: NONEDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(__dirname, 'graphql/JS_functions/Mutation.publish.js')
			),
		}
	)

	const createStoryInitFunction = new awsAppsync.AppsyncFunction(
		scope,
		'createStoryInitFunction',
		{
			name: 'createStoryInitFunction',
			api,
			dataSource: storyTableDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(
					__dirname,
					'graphql/JS_functions/Mutation.createStory_init.js'
				)
			),
		}
	)

	const createStoryGetOpenAISecretFunction = new awsAppsync.AppsyncFunction(
		scope,
		'createStoryGetOpenAISecretFunction',
		{
			name: 'createStoryGetOpenAISecretFunction',
			api,
			dataSource: parameterStoreDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(
					__dirname,
					'graphql/JS_functions/Mutation.createStory_getOpenAISecret.js'
				)
			),
		}
	)

	const createStoryGenerateStoryFunction = new awsAppsync.AppsyncFunction(
		scope,
		'createStoryGenerateStoryFunction',
		{
			name: 'createStoryGenerateStoryFunction',
			api,
			dataSource: openAIDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(
					__dirname,
					'graphql/JS_functions/Mutation.createStory_generateStory.js'
				)
			),
		}
	)

	const createStorySaveStoryFunction = new awsAppsync.AppsyncFunction(
		scope,
		'createStorySaveStoryFunction',
		{
			name: 'createStorySaveStoryFunction',
			api,
			dataSource: storyTableDataSource,
			runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
			code: awsAppsync.Code.fromAsset(
				path.join(
					__dirname,
					'graphql/JS_functions/Mutation.createStory_saveStory.js'
				)
			),
		}
	)

	new awsAppsync.Resolver(scope, 'listStoriesResolver', {
		api,
		typeName: 'Query',
		fieldName: 'listStories',
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/passThrough.js')
		),
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		pipelineConfig: [listStoriesFunction],
	})

	new awsAppsync.Resolver(scope, 'createStoryResolver', {
		api,
		typeName: 'Mutation',
		fieldName: 'createStory',
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/passThrough.js')
		),
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		pipelineConfig: [
			createStoryInitFunction,
			createStoryGetOpenAISecretFunction,
			createStoryGenerateStoryFunction,
			createStorySaveStoryFunction,
		],
	})

	new awsAppsync.Resolver(scope, 'publishResolver', {
		api,
		typeName: 'Mutation',
		fieldName: 'publish',
		code: awsAppsync.Code.fromAsset(
			path.join(__dirname, 'graphql/JS_functions/passThrough.js')
		),
		runtime: awsAppsync.FunctionRuntime.JS_1_0_0,
		pipelineConfig: [publishFunction],
	})

	return api
}
