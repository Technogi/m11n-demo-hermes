import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as events from 'aws-cdk-lib/aws-events'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as path from 'path';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class HermesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eventsBucket = new s3.Bucket(this, 'events-bucket', {
      bucketName: 'm11n-hermes-events'
    })

    const eventBus = new events.EventBus(this, 'event-bus', {
      eventBusName: 'm11n-hermes'
    })

    new events.Archive(this, 'hermes-archive', {
      archiveName: 'hermes-archive',
      description: 'general archive for Hermes',
      retention: cdk.Duration.days(5),
      sourceEventBus: eventBus,
      eventPattern: {

      }
    })

    const api = new apigw.RestApi(this, 'api', {
      restApiName: 'm11n-hermes'
    })

    const eventsReceiver = new nodejs.NodejsFunction(this, 'events-receiver-lambda', {
      functionName: 'm11n-hermes-event-receiver',
      entry: path.resolve(__dirname, 'lambdas', 'events-receiver.ts'),
      environment: {
        EVENTS_BUCKET: eventsBucket.bucketName,
        EVENT_BUS: eventBus.eventBusName,
        EVENT_BUS_ARN: eventBus.eventBusArn
      }
    })

    eventsBucket.grantPut(eventsReceiver)
    eventBus.grantPutEventsTo(eventsReceiver)
    eventsReceiver.role?.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['apigateway:GET'],
      effect: iam.Effect.ALLOW,
      resources: [`arn:aws:apigateway:${this.region}::/apikeys/*`]
    }))

    api.root.addMethod('POST', new apigw.LambdaIntegration(eventsReceiver, {}), { apiKeyRequired: true, operationName: 'receive-message' })

    const testApiKey = api.addApiKey('test-api-key', {
      apiKeyName: 'test-api-key',
      description: 'api-key for testing purposes',
    })

    cdk.Tags.of(testApiKey).add('ClientId', 'technogi')

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: testApiKey.keyId
    })

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url
    })

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'HermesQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
