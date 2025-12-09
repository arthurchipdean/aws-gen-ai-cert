import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const modelId = process.env.MODEL_ID!;
const bedrockRegion = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2';

// Cold start tracking
let isColdStart = true;

// Single client reused across invocations
const bedrockClient = new BedrockRuntimeClient({ region: bedrockRegion });

export const handler = async (
  event: any // using "any" since CDK default REST API uses v1; adjust if needed
): Promise<APIGatewayProxyResultV2> => {
  const invocationStart = Date.now();
  const wasColdStart = isColdStart;
  isColdStart = false;

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userQuery: string = body.query;

    if (!userQuery || typeof userQuery !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing "query" string in request body.' }),
      };
    }

    const bedrockStart = Date.now();

    // Payload depends on the model family. Example for Claude 3 in Bedrock:
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an assistant. Answer the user's question clearly.\n\nUser: ${userQuery}`,
            },
          ],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const response = await bedrockClient.send(command);
    const bedrockLatencyMs = Date.now() - bedrockStart;

    const responseBodyJson = JSON.parse(
      new TextDecoder().decode(response.body)
    );

    // Claude 3 response format: messages + usage
    const answerText =
      responseBodyJson.content?.[0]?.text ??
      'No content returned from model.';

    const usage = responseBodyJson.usage || {};
    const inputTokens = usage.input_tokens ?? null;
    const outputTokens = usage.output_tokens ?? null;
    const totalTokens =
      inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : null;

    const totalLatencyMs = Date.now() - invocationStart;

    // Structured log for metrics
    console.log(
      JSON.stringify({
        type: 'bedrock_metrics',
        coldStart: wasColdStart,
        totalLatencyMs,
        inferenceLatencyMs: bedrockLatencyMs,
        inputTokens,
        outputTokens,
        totalTokens,
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: answerText,
        meta: {
          coldStart: wasColdStart,
          totalLatencyMs,
          inferenceLatencyMs: bedrockLatencyMs,
          inputTokens,
          outputTokens,
          totalTokens,
        },
      }),
    };
  } catch (err: any) {
    console.error(
      JSON.stringify({
        type: 'error',
        message: err.message,
        stack: err.stack,
      })
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: process.env.LOG_LEVEL === 'DEBUG' ? err.message : undefined,
      }),
    };
  }
};
