import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

export class BedrockLambdaApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Lambda that talks to Bedrock
    const bedrockFn = new NodejsFunction(this, 'BedrockHandler', {
      entry: 'lambda/handler.ts', // we'll create this file
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(20),
      memorySize: 1024,
      environment: {
        MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0', // change if needed
        BEDROCK_REGION: this.region,
        LOG_LEVEL: 'INFO',
      },
    });

    // Allow Lambda to call Bedrock
    bedrockFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'], // tighten to specific ARNs later if you wish
      }),
    );

    // API Gateway -> Lambda proxy
    const api = new apigw.LambdaRestApi(this, 'BedrockApi', {
      handler: bedrockFn,
      proxy: false,
      restApiName: 'bedrock-query-api',
    });

    const query = api.root.addResource('query');
    query.addMethod('POST'); // POST /query -> Lambda
  }
}
