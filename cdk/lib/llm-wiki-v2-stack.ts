import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnResource,
  CfnOutput,
  Duration,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr_assets as ecrAssets,
  aws_s3 as s3,
  aws_s3_notifications as s3n,
  aws_sqs as sqs,
  aws_iam as iam,
  aws_logs as logs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_secretsmanager as sm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class LlmWikiV2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountId = this.account;

    // ================================================================
    // 1. VPC
    // ================================================================
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.102.0.0/16'),
      maxAzs: 2, // ALB requires 2+ AZs
      natGateways: 1, // cost optimization: 1 NAT shared across AZs
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    const nfsSg = new ec2.SecurityGroup(this, 'NfsSecurityGroup', {
      vpc,
      description: 'NFS (2049) between Fargate and S3 Files mount target',
      allowAllOutbound: true,
    });
    nfsSg.addIngressRule(nfsSg, ec2.Port.tcp(2049), 'NFS from same SG');

    // ================================================================
    // 2. S3 Buckets (ALL versioned — S3 Files requires it)
    // ================================================================
    const bucketDefaults: Partial<s3.BucketProps> = {
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    };

    const rawBucket = new s3.Bucket(this, 'RawSourcesBucket', {
      ...bucketDefaults,
      bucketName: `raw-sources-v2-${accountId}`,
    });

    const wikiBucket = new s3.Bucket(this, 'WikiBucket', {
      ...bucketDefaults,
      bucketName: `wiki-v2-${accountId}`,
    });

    const schemaBucket = new s3.Bucket(this, 'SchemaBucket', {
      ...bucketDefaults,
      bucketName: `schema-v2-${accountId}`,
    });

    // ================================================================
    // 3. SQS (Standard + DLQ)
    // ================================================================
    const dlq = new sqs.Queue(this, 'DLQ', {
      queueName: `llm-wiki-v2-dlq-${accountId}`,
      retentionPeriod: Duration.days(14),
    });

    const queue = new sqs.Queue(this, 'IngestQueue', {
      queueName: `llm-wiki-v2-${accountId}`,
      visibilityTimeout: Duration.minutes(10),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(queue),
    );

    // ================================================================
    // 4. S3 Files (FileSystem + MountTarget + AccessPoint)
    // ================================================================
    const s3FilesRole = new iam.Role(this, 'S3FilesServiceRole', {
      assumedBy: new iam.ServicePrincipal('elasticfilesystem.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': accountId },
          ArnLike: { 'aws:SourceArn': `arn:aws:s3files:${this.region}:${accountId}:file-system/*` },
        },
      }),
    });

    s3FilesRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:ListBucketVersions'],
      resources: [wikiBucket.bucketArn],
    }));
    s3FilesRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:AbortMultipartUpload', 's3:DeleteObject*', 's3:GetObject*', 's3:List*', 's3:PutObject*'],
      resources: [`${wikiBucket.bucketArn}/*`],
    }));
    s3FilesRole.addToPolicy(new iam.PolicyStatement({
      actions: ['events:DeleteRule', 'events:DisableRule', 'events:EnableRule', 'events:PutRule', 'events:PutTargets', 'events:RemoveTargets'],
      conditions: { StringEquals: { 'events:ManagedBy': 'elasticfilesystem.amazonaws.com' } },
      resources: ['arn:aws:events:*:*:rule/DO-NOT-DELETE-S3-Files*'],
    }));
    s3FilesRole.addToPolicy(new iam.PolicyStatement({
      actions: ['events:DescribeRule', 'events:ListRuleNamesByTarget', 'events:ListRules', 'events:ListTargetsByRule'],
      resources: ['arn:aws:events:*:*:rule/*'],
    }));

    const fileSystem = new CfnResource(this, 'WikiFileSystem', {
      type: 'AWS::S3Files::FileSystem',
      properties: {
        Bucket: wikiBucket.bucketArn,
        RoleArn: s3FilesRole.roleArn,
        AcceptBucketWarning: true,
      },
    });
    fileSystem.node.addDependency(wikiBucket);

    const mountTargets = vpc.privateSubnets.map((subnet, i) => {
      const mt = new CfnResource(this, `WikiMountTarget${i}`, {
        type: 'AWS::S3Files::MountTarget',
        properties: {
          FileSystemId: fileSystem.ref,
          SubnetId: subnet.subnetId,
          SecurityGroups: [nfsSg.securityGroupId],
        },
      });
      return mt;
    });

    const accessPoint = new CfnResource(this, 'WikiAccessPoint', {
      type: 'AWS::S3Files::AccessPoint',
      properties: {
        FileSystemId: fileSystem.ref,
        PosixUser: { Uid: '1000', Gid: '1000' },
        RootDirectory: {
          Path: '/wiki',
          CreationPermissions: { OwnerUid: '1000', OwnerGid: '1000', Permissions: '0755' },
        },
      },
    });
    for (const mt of mountTargets) {
      accessPoint.node.addDependency(mt);
    }

    // ================================================================
    // 5. Secrets Manager (Bearer token)
    // ================================================================
    const bearerSecret = new sm.Secret(this, 'BearerTokenSecret', {
      secretName: 'llm-wiki-v2/bearer-token',
      generateSecretString: { passwordLength: 32, excludePunctuation: true },
    });

    // ================================================================
    // 6. Container image
    // ================================================================
    const image = new ecrAssets.DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '..', '..'),
      platform: ecrAssets.Platform.LINUX_ARM64,
      exclude: ['cdk', 'phase0', '.doc', 'seed', 'node_modules', 'cdk.out', '.git'],
    });

    // ================================================================
    // 7. ECS Cluster + Task + Service
    // ================================================================
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // S3 Files client
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3files:ClientMount', 's3files:ClientWrite', 's3files:ClientRootAccess'],
      resources: [fileSystem.ref],
    }));
    // Bedrock
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));
    // SQS
    queue.grantConsumeMessages(taskRole);
    queue.grantSendMessages(taskRole);
    // S3 (raw read, schema read)
    rawBucket.grantRead(taskRole);
    schemaBucket.grantRead(taskRole);
    // Secrets Manager: ECS secret injection uses execution role (CDK wires automatically via addContainer secrets)
    // ECS Exec
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel', 'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel'],
      resources: ['*'],
    }));

    const logGroup = new logs.LogGroup(this, 'TaskLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      executionRole,
      taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    // S3 Files volume (escape hatch — CDK L2 has no S3Files support)
    const cfnTask = taskDef.node.defaultChild as ecs.CfnTaskDefinition;
    cfnTask.addPropertyOverride('Volumes', [{
      Name: 'wiki',
      S3FilesVolumeConfiguration: {
        FileSystemArn: fileSystem.ref,
        AccessPointArn: accessPoint.getAtt('AccessPointArn').toString(),
        RootDirectory: '/',
      },
    }]);

    const container = taskDef.addContainer('app', {
      image: ecs.ContainerImage.fromDockerImageAsset(image),
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'app' }),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        AWS_REGION: this.region,
        SQS_QUEUE_URL: queue.queueUrl,
        ANTHROPIC_MODEL: 'global.anthropic.claude-sonnet-4-6',
        CLAUDE_CODE_USE_BEDROCK: '1',
        WIKI_MOUNT: '/mnt/wiki',
        RAW_BUCKET: rawBucket.bucketName,
        SCHEMA_BUCKET: schemaBucket.bucketName,
      },
      secrets: {
        BEARER_TOKEN: ecs.Secret.fromSecretsManager(bearerSecret),
      },
      linuxParameters: new ecs.LinuxParameters(this, 'LinuxParams', { initProcessEnabled: true }),
    });
    container.addMountPoints({
      containerPath: '/mnt/wiki',
      readOnly: false,
      sourceVolume: 'wiki',
    });

    // ================================================================
    // 8. ALB + Service
    // ================================================================
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [nfsSg],
      enableExecuteCommand: true,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      healthCheckGracePeriod: Duration.seconds(120),
    });
    for (const mt of mountTargets) {
      service.node.addDependency(mt);
    }

    const listener = alb.addListener('HttpListener', {
      port: 80,
    });

    listener.addTargets('ApiTarget', {
      port: 8080,
      targets: [service],
      healthCheck: { path: '/health', interval: Duration.seconds(30) },
    });
    // PoC: HTTP:80 のみ。本番化時は ACM cert + HTTPS:443 listener + HTTP→HTTPS redirect に切替。

    // ================================================================
    // 9. Outputs
    // ================================================================
    new CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });
    new CfnOutput(this, 'RawBucketName', { value: rawBucket.bucketName });
    new CfnOutput(this, 'WikiBucketName', { value: wikiBucket.bucketName });
    new CfnOutput(this, 'SchemaBucketName', { value: schemaBucket.bucketName });
    new CfnOutput(this, 'BearerSecretArn', { value: bearerSecret.secretArn });
    new CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
  }
}
