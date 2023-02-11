import { APIGatewayProxyHandler } from 'aws-lambda'
import { S3, APIGateway, EventBridge } from 'aws-sdk'
import { createId } from '@paralleldrive/cuid2';

const s3 = new S3()
const ag = new APIGateway()
const apiKeysDirectory: Record<string, string> = {}
const eventBridge = new EventBridge()

export const handler: APIGatewayProxyHandler = async (request, ctx) => {
  try {
    const apiKeyId = request?.requestContext?.identity?.apiKeyId
    if (!apiKeyId) return {
      statusCode: 401,
      body: 'Invalid API Key'
    }

    let clientId: string | undefined = apiKeysDirectory[apiKeyId]
    if (!clientId) {
      const apiKey = await ag.getApiKey({
        apiKey: request?.requestContext?.identity?.apiKeyId || ''
      }).promise()

      clientId = apiKey?.tags?.ClientId
      if (!clientId) return {
        statusCode: 401,
        body: 'Invalid API Key'
      }

      apiKeysDirectory[apiKey.id!] = clientId
    }



    const eventType = JSON.parse(request?.body || '{}')?.['event-type']

    if (!eventType) {
      return {
        statusCode: 400,
        body: 'missing event-type'
      }
    }

    await s3.putObject({
      Bucket: process.env.EVENTS_BUCKET || '',
      Key: `${clientId}/${eventType}/${createId()}.json`,
      Body: request.body || ''
    }).promise()

    await eventBridge.putEvents({
      Entries: [{
        Source: clientId,
        EventBusName: process.env.EVENT_BUS,
        DetailType: eventType,
        Detail: typeof request?.body === 'string' ? request.body : JSON.stringify(request.body)
      }]
    }).promise()

    return {
      body: '',
      statusCode: 201
    }
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify(e)
    }
  }
}