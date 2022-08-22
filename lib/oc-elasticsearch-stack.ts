import { objectToCloudFormation, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { CapacityConfig, Domain, EngineVersion } from 'aws-cdk-lib/aws-opensearchservice';
import { Vpc, SubnetType, EbsDeviceVolumeType, SecurityGroup, Peer, Port, CfnVPCPeeringConnection, Subnet } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface OcElasticsearchProps extends StackProps {
  esDomainName: string;
  deploymentType: string;
  vpcCidr: string;
  notificationEmail?: string;
  notificationSlackUrl?: string;
}

interface DeploymentSettings {
  numAzs: number;
  capacity: CapacityConfig;
}

const deploymentTypes : { [key: string]: DeploymentSettings } = {
  dev: {
    numAzs: 3,
    capacity: {
      dataNodes: 3,
      dataNodeInstanceType: "t3.medium.search",
      masterNodes: 3,
      masterNodeInstanceType: "t3.medium.search",
    },
  },
  prod: {
    numAzs: 3,
    capacity: {
      dataNodes: 3,
      dataNodeInstanceType: "r6g.large.search",
      masterNodes: 3,
      masterNodeInstanceType: "c6g.large.search",
    },
  },
};

export class OcElasticsearchStack extends Stack {
  constructor(scope: Construct, id: string, props: OcElasticsearchProps) {
    super(scope, id, props);
    const {
      esDomainName,
      vpcCidr,
      deploymentType,
      notificationEmail,
      notificationSlackUrl,
    } = props;

    const deploymentSettings = deploymentTypes[deploymentType];

    const vpc = new Vpc(this, 'Vpc', {
      cidr: vpcCidr,
      vpcName: `${esDomainName}-vpc`,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'private-isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 28,
          name: 'public',
          subnetType: SubnetType.PUBLIC,
        }
      ],
      maxAzs: deploymentSettings.numAzs,
    });

    const securityGroup = new SecurityGroup(this, 'DomainSecurityGroup', {
      vpc,
      securityGroupName: `${esDomainName}-sg`,
      description: `${esDomainName} security group`,
    });

    securityGroup.addIngressRule(
      Peer.ipv4('10.0.0.0/8'),
      Port.allTcp(),
      'Allow all from internal & any other peer vpcs',
    );

    const accessPolicy = new PolicyStatement({
      actions: ['es:*'],
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      resources: ['*'],
    });

    const esDomain = new Domain(this, 'EsDomain', {
      vpc,
      domainName: esDomainName,
      version: EngineVersion.ELASTICSEARCH_7_10,
      capacity: deploymentSettings.capacity,
      securityGroups: [securityGroup],
      ebs: {
        volumeSize: 100,
        volumeType: EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3,
      },
      automatedSnapshotStartHour: 6,
      enableVersionUpgrade: true,
      removalPolicy: RemovalPolicy.RETAIN,
      zoneAwareness: {
        availabilityZoneCount: deploymentSettings.numAzs,
      },
      logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
      },
      vpcSubnets: [vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      })],
      advancedOptions: {
        'rest.action.multi.allow_explicit_index': 'true',
        'indices.fielddata.cache.size': '40'
      },
      accessPolicies: [accessPolicy],
    });
  }
}
