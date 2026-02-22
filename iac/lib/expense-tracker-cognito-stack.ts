// import { Stack, StackProps } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as ssm from 'aws-cdk-lib/aws-ssm';

// interface CognitoStackProps extends StackProps {
//   appName: string;
//   envName: string;
// }

// export class ExpenseTrackerCognitoStack extends Stack {
//   constructor(scope: Construct, id: string, props: CognitoStackProps) {
//     super(scope, id, props);
//     const { appName, envName } = props;

//     const exportParam = (name: string, value: string) => {
//       new ssm.StringParameter(this, `SSMParam-${name}`, {
//         parameterName: `/${appName}/${envName}/cognito/${name}`,
//         stringValue: value
//       });
//     };
//   }
// }
