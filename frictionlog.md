# Project

Chat Generator

## Description

Given a prompt from AppSync, put the prompt on the stash. Then create an ID of the job in DynamoDB, this triggers a subscription to the client with an id and a status of "PENDING". Then fetch an API key from Parameter Store, then--using the chat prompt from the stash, make a call to OpenAI using the API key from the previous function and the prompt on the stash. Given that chatGPT is a synchronous task, then store the data in DynamoDB and mark the task as complete. With the data in DynamoDB, the same lambda trigger from before is fired which again triggers a subscription to AppSync.

This project takes a step past what was covered in the [AppSync Notifier project](https://github.com/mtliendo/appsync-notifier/blob/main/frictionlog.md). Because of that, I'll be linking to those code snippets when appropriate instead repasting them here.

## Context

I've gotten data from Secrets Manager before, but this is my first time getting it from SSM. This is another pattern that I think should definitely be outlined in our docs (along with pushing data from a Lambda function).

It is currently 3:06AM CT, my hope is that I can get this done by 5:00AM CT.

## Getting Started

Same as in the previous app, I created a directory called `chat-generator`, changed into it and ran the following command:

```bash
npx aws-cdk@latest init -l typescript && code .
```

## App Creation

I'm immeadiately thinking about what I can borrow from the previous project.

What I need:
-- Auth: This can be pretty much copy and pasted from the last project
-- DB + Lambda function: This pattern can be copied over but will need to be looked at and modified
-- API: This is just a single operation: `generateStory`
-- A pipeline that stashes the prompt and returns an `id` and `status` back to the user
-- A function that gets a secret from parameter store
-- A function that makes a call to OpenAI
-- A function that stores data in DynamoDB

## Auth

Outside of removing the hypens in the service names, and installing the `@aws-cdk/aws-cognito-identitypool-alpha` package. I literally just copied the directory from the last project over.

Done.

## DB

I'll add the lambda after the API.

This was a straight copy/paste from the last project. Nothing modified in the `lib/databases/tables` file.

Done.

## API

### Construct Creation

For the construct, I copied it over from the last project but I changed `product` to `story` and `products` to `stories` (preserving the case). I'm keeping the ability to list stories since it'll come in handy with the final project.

### Schema Creation

For the schema, I kept the operations and directives,but changes the type to `Story`, along with its properties:

```graphql
type Query {
	listStories: [Story] @aws_cognito_user_pools @aws_iam
}

type Mutation {
	createStory(prompt: String!): Story @aws_cognito_user_pools
	publish(data: AWSJSON): AWSJSON @aws_iam
}

type Subscription {
	subscribe: AWSJSON @aws_subscribe(mutations: ["publish"])
}

type Story {
	id: ID!
	isComplete: Boolean!
	createdAt: AWSDateTime!
	updatedAt: AWSDateTime!
	text: String!
}
```

### Adding in TS -> JS build support

I'm ready to start mucking wth my functions, so I copied over the `build.mjs` file from the previous project and installed `glob` and `esbuild` as dev deps.

### Creating the TS functions, code and pipeline

I copied over the TS_functions directory from the previous project and installed `@aws-appsync/utils`.

The `Query.listStories.ts` file is fine as is. So is the `Mutation.publish.ts` file.

In the `passThrough.ts` file I added the following to the `request`:

```ts
if (ctx.info.fieldName === 'createStory') {
	ctx.stash.prompt = ctx.args.prompt
}
```

That way it can still be reused for the other functions.

The big one here is the `Mutation.createStory.ts` file.

First things first, gonna use [the same setup](https://github.com/mtliendo/appsync-notifier/blob/main/frictionlog.md?plain=1#L485-L504) as with my previous project to generate my AppSync types, queries and mutations.

Now for the `Mutation.createStory.ts` function, I'm actually going to do a different convention by suffixing the related functions.

`init.ts`

```ts
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
```

This function creates the item in DDB, but doesn't return an of the results. This will trigger the lambda that there was an update.

`_getOpenAISecret.ts`

```ts
import { Context, util } from '@aws-appsync/utils'

export function request(ctx: Context) {
	return {
		method: 'POST',
		resourcePath: '/',
		params: {
			headers: {
				'content-type': 'application/x-amz-json-1.1',
				'x-amz-target': 'AmazonSSM.GetParameter',
			},
			body: {
				Name: 'OPENAI_SECRET',
				WithDecryption: true,
			},
		},
	}
}

export function response(ctx: Context) {
	console.log(ctx.result.body)
	const result = JSON.parse(ctx.result.body).Parameter.Value
	console.log(result)
	return result
}
```

This will Fetch the secret from Parameter store. I'm unsure if this is the correct syntax and I'm purposely hardcoing the value `OPENAI_SECRET`. Hopefully the console.logs will help out here.

`_generateStory.ts`

```ts
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
```

This makes 2 assumptions: the `prompt` was passed in as an argument and that the auth token was the previous step.

I'm fairly confident the save function works as intended:

`_saveStory.ts`

```ts
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
```

I added those to the createStory pipeline resolver:

```ts
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
```

This is where Pipeline resolvers shine!

## Adding the Lambda function to publish

I was worried about this function but it's I can literally copy and paste it over!

## Putting the stack together

I'm going to copy and paste what I had in the previous project over and tweak as needed.

## Testing and debugging

I'm definitely not expecting this to work the first time, but it's currrently 4:56AM CT, so if I can get this working in the next 30 minutes, I'll consider that a win!

Deploy: Adding my deploy scripts:

````json
"build:appsyncFunctions": "node build.mjs",
		"deploy": " npm run build:appsyncFunctions && npx aws-cdk deploy",
    ```
````

I forgot to update my `bin` directory. Kinda worked out since I also forgot to update the `publishToAppSyncFunc` name as well.

Deployed just fine (I'm getting good at this lol).

Now time to create a user and list the stories.
-- Worked on the first try

Now the scary part. Gonna try and create a story from ChatGPT.
Oh, before I do that, I better save a secret in parameter store!

I did this from the console.

I went to create a story:
-- It broke on the parameter store part.
-- the story is created in DDB with isComplete set to false.
-- Cloudwatch says I'm missing auth token. I've ran into this before. The docs don't mention it anywhere relevant (they 100% should), but I need to sign the request.

With the help of chatGPT, I found the signing service name and added the object to the datasource:

```ts
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
```

Another error but closer:

```js
"body": "{\"__type\":\"AccessDeniedException\",\"Message\":\"User: arn:aws:sts::311853295989:assumed-role/ChatGeneratorStack-createAIStoryAPIparameterStoreD-UDIK73785HSH/APPSYNC_ASSUME_ROLE is not authorized to perform: ssm:GetParameter on resource: arn:aws:ssm:us-east-1:311853295989:parameter/OPENAI_SECRET because no identity-based policy allows the ssm:GetParameter action\"}"
```

Essentially, I need to give my datasource access to perform the ssm:GetParameter action. Simple enough.

Oh--CodeWhisperer actually wrote it for me!

```ts
const allowSSMAccess = new PolicyStatement({
	actions: ['ssm:GetParameters'],
	resources: [
		`arn:aws:ssm:us-east-1:${process.env.CDK_DEFAULT_ACCOUNT}:parameter/OPENAI_KEY`,
	],
})

parameterStoreDataSource.grantPrincipal.addToPrincipalPolicy(allowSSMAccess)
```

ooof, deployed and tested, got the same error. Just noticed CodeWhisperer put `OPENAI_KEY` instead of `OPENAI_SECRET`.

Trying again. Failed.

Ahh...codewhisperer again. Just noticed it put `GetParameters` instead of `GetParameter`.

Trying again.
