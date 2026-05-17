import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { exportParam } from '../utils/parameter-utils';

interface SplitwiseEcrStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class SplitwiseEcrStack extends Stack {
  public readonly repositoryUri: string;
  public readonly repositoryArn: string;

  constructor(scope: Construct, id: string, props: SplitwiseEcrStackProps) {
    super(scope, id, props);

    const { appName, envName } = props;
    const domainName = 'splitwise-compute';

    // ECR Repository
    const repository = new ecr.Repository(this, 'SplitwiseRepository', {
      repositoryName: `${appName}-${envName}-splitwise`,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.RETAIN
    });

    // ECR Lifecycle Rule
    // tagStatus ANY keeps the 2 most recently pushed images (tagged or untagged).
    // This avoids ECR's restriction that tagPrefixList cannot contain empty strings.
    repository.addLifecycleRule({
      description: 'Keep only the last 2 images',
      rulePriority: 1,
      tagStatus: ecr.TagStatus.ANY,
      maxImageCount: 2
    });

    this.repositoryUri = repository.repositoryUri;
    this.repositoryArn = repository.repositoryArn;

    // SSM Exports
    exportParam(this, appName, envName, domainName, 'repository-uri', repository.repositoryUri);
    exportParam(this, appName, envName, domainName, 'repository-arn', repository.repositoryArn);
    exportParam(this, appName, envName, domainName, 'repository-name', repository.repositoryName);
  }
}
