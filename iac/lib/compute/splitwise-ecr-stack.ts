import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
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

    // ECR Lifecycle Rules
    repository.addLifecycleRule({
      description: 'Keep only the last 2 tagged images',
      rulePriority: 1,
      tagStatus: ecr.TagStatus.TAGGED,
      tagPrefixList: ['v', ''],   // matches any tag
      maxImageCount: 2
    });

    repository.addLifecycleRule({
      description: 'Delete untagged images after 1 hour',
      rulePriority: 2,
      tagStatus: ecr.TagStatus.UNTAGGED,
      maxImageAge: Duration.hours(1)
    });

    this.repositoryUri = repository.repositoryUri;
    this.repositoryArn = repository.repositoryArn;

    // SSM Exports
    exportParam(this, appName, envName, domainName, 'repository-uri', repository.repositoryUri);
    exportParam(this, appName, envName, domainName, 'repository-arn', repository.repositoryArn);
    exportParam(this, appName, envName, domainName, 'repository-name', repository.repositoryName);
  }
}
