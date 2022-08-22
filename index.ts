#!/usr/bin/env node
import 'source-map-support/register';
import { App, CfnOutput, Stack } from 'aws-cdk-lib';
import { SSMClient, GetParameterCommand, ParameterNotFound } from "@aws-sdk/client-ssm";
import { OcElasticsearchStack, OcElasticsearchProps } from './lib/oc-elasticsearch-stack';

function bye(msg: string, exitCode: number): void {
  console.log(msg);
  process.exit(exitCode);
}

const ocElasticsearchEnv = process.env.OC_ELASTICSEARCH_ENVIRONMENT || '';
if (!ocElasticsearchEnv) bye('You must set OC_ELASTICSEARCH_ENVIRONMENT!', 1);

async function getCdkConfig(): Promise<OcElasticsearchProps | undefined> {
  const client = new SSMClient({});
  const configParameterName = `/oc-elasticsearch-cdk/config/${ocElasticsearchEnv}`;
  const getConfigCommand = new GetParameterCommand({
    Name: configParameterName,
    WithDecryption: true,
  });

  try {
    const resp = await client.send(getConfigCommand);
    if (resp.Parameter) {
      return JSON.parse(resp.Parameter.Value || '{}');
    }
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      throw new Error(`Parameter ${configParameterName} not found!`);
    } else {
      console.log(error);
    }
  }
}

async function main(): Promise<void> {

  const config = await getCdkConfig();
  if (!config) {
    bye('Failed fetching config', 1);
  } else {
    console.log(config);

    const {
      esDomainName,
      notificationEmail,
      notificationSlackUrl,
      deploymentType,
      vpcCidr,
    } = config;

    const app = new App();
    new OcElasticsearchStack(app, `${esDomainName}-stack`, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
      esDomainName,
      deploymentType,
      vpcCidr,
      notificationEmail,
      notificationSlackUrl,
      tags: {
        project: 'MH',
        department: 'DE',
        product: 'opencast-elasticsearch',
        deploy_environment: ocElasticsearchEnv,
      }
    });
  }
}

main();
