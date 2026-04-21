#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LlmWikiV2Stack } from '../lib/llm-wiki-v2-stack';

const app = new cdk.App();

const REGION = 'ap-northeast-1';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

new LlmWikiV2Stack(app, 'LlmWikiV2Stack', {
  env,
  description: 'LLM Wiki v2 — Fargate + Bun + S3 Files + SQS + ALB',
});
